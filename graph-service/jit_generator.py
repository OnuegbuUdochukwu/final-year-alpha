"""
jit_generator.py — Just-In-Time Graph Generation via Hugging Face Inference API.

When the A* pathfinder cannot locate a target skill/role in the Neo4j graph,
this module is called to:
  1. Ask an LLM to design a skill subgraph for that role (generate_subgraph)
  2. Inject the subgraph into Neo4j via idempotent MERGE Cypher (inject_into_neo4j)
  3. Hot-reload the in-memory NetworkX graph on the live engine (hot_patch_networkx)

The caller (api.py) then re-runs A* on the updated graph and returns the result.
"""

import os
import re
import json
import logging
import requests

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

_PRIMARY_MODEL  = "mistralai/Mistral-7B-Instruct-v0.3"
_FALLBACK_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"
_HF_API_BASE    = "https://api-inference.huggingface.co/v1/chat/completions"
_TIMEOUT_SEC    = 30   # raised from 25s to handle cold starts on HF free tier

# Normalisation ceiling: edge weight = time_hours / _WEIGHT_CEILING
# Seeded courses top out at ~80h (weight ≈ 0.27); 300h ceiling keeps JIT in the same band.
_WEIGHT_CEILING = 300.0

# ─── System prompt ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a curriculum design API. Your ONLY output is a single valid JSON object.
Do NOT output markdown, code fences, explanations, or any text outside the JSON object.

Generate a learning path subgraph for the given target job role.

Rules:
1. Include 5-10 intermediate Skill nodes between "Foundation" and the target role.
2. Every node must have exactly three fields:
   - "id": unique snake_case identifier (e.g. "html_css")
   - "name": human-readable label (e.g. "HTML & CSS")
   - "type": one of "Concept", "Language", "Tool", or "Role"
3. Every edge must have exactly five fields:
   - "source_id": id of the source node
   - "target_id": id of the target node
   - "title": name of a real online course or resource
   - "time_hours": estimated study time in hours (integer)
   - "cost_usd": cost in USD (integer, 0 if free)
4. The FIRST edge MUST have source_id exactly "foundation" (lowercase).
5. The LAST edge MUST have target_id matching the role node's id.
6. Every node (except Foundation) must appear as target_id in at least one edge.
7. Do NOT include a "weight" field — the system calculates this automatically.

Return ONLY the JSON object. No other text."""

# ─── Custom exception ─────────────────────────────────────────────────────────

class JITGenerationError(Exception):
    """Raised when the JIT pipeline fails at any stage."""
    pass

# ─── Public functions ─────────────────────────────────────────────────────────

def generate_subgraph(target_role: str) -> dict:
    """
    Calls the Hugging Face Serverless Inference API to generate a skill subgraph
    for the given target_role.

    Returns a validated dict matching the schema:
        { "role": str, "nodes": [...], "edges": [...] }

    Raises:
        JITGenerationError — on API failure, timeout, or malformed/invalid JSON.
    """
    from shared.llm_service import query_llm
    
    model = os.getenv("JIT_MODEL", _PRIMARY_MODEL)
    user_message = f'Generate a learning path subgraph for the role: "{target_role}"'

    logger.info(f"[JIT] Calling HF API: model={model}, target='{target_role}'")

    try:
        raw_text = query_llm(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=user_message,
            model=model,
            max_tokens=1200,
            temperature=0.1
        )
    except Exception as e:
        logger.warning(f"[JIT] Primary model '{model}' failed: {e}. Trying fallback...")
        try:
            raw_text = query_llm(
                system_prompt=_SYSTEM_PROMPT,
                user_prompt=user_message,
                model=_FALLBACK_MODEL,
                max_tokens=1200,
                temperature=0.1
            )
        except Exception as fallback_e:
            raise JITGenerationError(f"Both primary and fallback HF models failed. Error: {fallback_e}") from fallback_e

    # ── Extract JSON from response (handles prose-wrapped JSON) ──────────────
    subgraph = _extract_and_validate_json(raw_text, target_role)
    logger.info(
        f"[JIT] Subgraph generated: {len(subgraph['nodes'])} nodes, "
        f"{len(subgraph['edges'])} edges for '{target_role}'"
    )
    return subgraph

def inject_into_neo4j(subgraph: dict, engine) -> None:
    """
    Writes all nodes and edges from the LLM subgraph into Neo4j using idempotent
    MERGE statements. Uses the engine's existing driver connection.

    The `engine` parameter is a PathfinderGraphEngine instance (from pathfinder.py).

    Raises:
        JITGenerationError — on Neo4j write failure.
    """
    database = engine.neo4j_database
    logger.info(f"[JIT] Injecting subgraph into Neo4j (database='{database}')...")

    try:
        with engine.neo_driver.session(database=database) as session:

            # 1. Upsert Skill nodes
            for node in subgraph.get("nodes", []):
                name      = node.get("name", "").strip()
                node_type = node.get("type", "Concept")
                if not name:
                    continue
                session.run(
                    """
                    MERGE (s:Skill {name: $name})
                    SET s.jit = true,
                        s.node_type = $node_type
                    """,
                    name=name,
                    node_type=node_type,
                )

            # Build id→name lookup for edge resolution
            id_to_name = {n["id"]: n["name"].strip() for n in subgraph.get("nodes", [])}
            # The Foundation node already exists in the graph — map the sentinel id
            id_to_name["foundation"] = "Foundation"

            # 2. Upsert LEARN_VIA edges
            for edge in subgraph.get("edges", []):
                src_name  = id_to_name.get(edge.get("source_id", ""), "")
                tgt_name  = id_to_name.get(edge.get("target_id", ""), "")
                title     = edge.get("title", "Online Course").strip()
                time_h    = int(edge.get("time_hours", 10))
                cost_usd  = int(edge.get("cost_usd", 0))

                if not src_name or not tgt_name:
                    logger.warning(f"[JIT] Skipping edge with unresolvable ids: {edge}")
                    continue

                # Normalise weight consistently with existing seeded edges
                weight = round(time_h / _WEIGHT_CEILING, 4)

                session.run(
                    """
                    MATCH (a:Skill {name: $src})
                    MATCH (b:Skill {name: $tgt})
                    MERGE (a)-[r:LEARN_VIA {title: $title}]->(b)
                    SET r.normalized_weight = $weight,
                        r.cost  = $cost,
                        r.hours = $hours
                    """,
                    src=src_name,
                    tgt=tgt_name,
                    title=title,
                    weight=weight,
                    cost=cost_usd,
                    hours=time_h,
                )

        node_count = len(subgraph.get("nodes", []))
        edge_count = len(subgraph.get("edges", []))
        logger.info(f"[JIT] Neo4j injection complete: {node_count} nodes, {edge_count} edges.")

    except Exception as e:
        raise JITGenerationError(f"Neo4j injection failed: {str(e)}") from e


def hot_patch_networkx(engine) -> None:
    """
    Reloads the in-memory NetworkX graph on the live engine singleton by calling
    engine.build_networkx_graph(). This re-reads all nodes and edges from Neo4j
    (which now contains the JIT-injected data).

    At <100 nodes the reload completes in <100ms — no restart required.

    Raises:
        JITGenerationError — if the graph rebuild fails.
    """
    logger.info("[JIT] Hot-patching NetworkX graph from updated Neo4j data...")
    try:
        engine.build_networkx_graph()
        logger.info(
            f"[JIT] NetworkX graph reloaded: "
            f"{engine.G.number_of_nodes()} nodes, {engine.G.number_of_edges()} edges."
        )
    except Exception as e:
        raise JITGenerationError(f"NetworkX hot-patch failed: {str(e)}") from e


# ─── Private helpers ──────────────────────────────────────────────────────────def _extract_and_validate_json(raw_text: str, target_role: str) -> dict:
    """
    Extracts the first JSON object from the LLM's response text (handles cases
    where the model wraps the JSON in prose or markdown fences) and validates
    that it contains the required keys.

    Returns a validated dict.
    Raises JITGenerationError on parse or validation failure.
    """
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?", "", raw_text, flags=re.IGNORECASE).strip()

    # Extract the outermost JSON object
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise JITGenerationError(
            f"LLM response contained no JSON object. Raw response: {raw_text[:300]}"
        )

    try:
        subgraph = json.loads(match.group(0))
    except json.JSONDecodeError as e:
        raise JITGenerationError(
            f"LLM returned malformed JSON: {str(e)}. "
            f"Raw snippet: {match.group(0)[:200]}"
        ) from e

    # Schema validation
    required_keys = {"nodes", "edges"}
    missing = required_keys - set(subgraph.keys())
    if missing:
        raise JITGenerationError(
            f"LLM JSON missing required keys: {missing}. "
            f"Got keys: {list(subgraph.keys())}"
        )
    if not isinstance(subgraph.get("nodes"), list) or not subgraph["nodes"]:
        raise JITGenerationError("LLM JSON 'nodes' is empty or not a list.")
    if not isinstance(subgraph.get("edges"), list) or not subgraph["edges"]:
        raise JITGenerationError("LLM JSON 'edges' is empty or not a list.")

    # Validate that at least one edge links from Foundation
    has_foundation_entry = any(
        str(e.get("source_id", "")).lower() == "foundation"
        for e in subgraph["edges"]
    )
    if not has_foundation_entry:
        raise JITGenerationError(
            "LLM subgraph has no edge starting from 'foundation'. "
            "The path cannot connect to the existing graph."
        )

    # Inject the role name if the LLM omitted it
    subgraph.setdefault("role", target_role)

    return subgraph
