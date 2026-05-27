import os
import re
import json
import logging
from huggingface_hub import InferenceClient

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"

def _get_hf_token() -> str:
    """Returns the HF_TOKEN or raises ValueError."""
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        raise ValueError("HF_TOKEN environment variable is missing or empty. Cannot connect to Hugging Face API.")
    return hf_token


def query_llm_standard(prompt: str, model: str = None, max_new_tokens: int = 500) -> str:
    """
    Queries the Hugging Face Inference API.
    
    Returns the generated text as a string.
    Raises on API failure.
    """
    hf_token = _get_hf_token()
    selected_model = model or DEFAULT_MODEL

    logger.info(f"[StandardAPI] Calling model={selected_model}, prompt_len={len(prompt)}")

    client = InferenceClient(model=selected_model, token=hf_token)
    response = client.text_generation(prompt, max_new_tokens=max_new_tokens, return_full_text=False)
    
    return response


def parse_json_from_llm(raw_text: str, expect_array: bool = False):
    """
    Robustly parses JSON from LLM output, stripping markdown fences and
    extracting the first JSON object or array found.

    Args:
        raw_text: The raw string returned by the LLM.
        expect_array: If True, look for a JSON array [...] first; otherwise look for {...}.

    Returns:
        Parsed Python object (dict or list).

    Raises:
        ValueError if no valid JSON can be extracted.
    """
    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?", "", raw_text, flags=re.IGNORECASE).strip()

    if expect_array:
        match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    else:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)

    if not match:
        raise ValueError(f"No JSON {'array' if expect_array else 'object'} found in LLM response: {raw_text[:300]}")

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as e:
        raise ValueError(f"Malformed JSON in LLM response: {e}. Snippet: {match.group(0)[:200]}") from e
