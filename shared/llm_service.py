import os
import re
import json
import logging
import requests

from huggingface_hub import InferenceClient

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"

# ─── Standard Inference API (text generation) ─────────────────────────────────
_HF_STD_API_BASE = "https://api-inference.huggingface.co/models"


def _get_hf_token() -> str:
    """Returns the HF_TOKEN or raises ValueError."""
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        raise ValueError("HF_TOKEN environment variable is missing or empty. Cannot connect to Hugging Face API.")
    return hf_token


def _get_client() -> InferenceClient:
    """Returns an authenticated InferenceClient, raises an error if token is missing."""
    return InferenceClient(api_key=_get_hf_token())


def test_llm_connection():
    """Pings the Hugging Face API to check connection health."""
    try:
        client = _get_client()
        # Perform a minimal generation to test connection
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5,
        )
        if response and response.choices:
            logger.info("Connection Successful: Hugging Face API is reachable.")
            logger.info(f"Active Default Model: {DEFAULT_MODEL}")
            return True
        else:
            logger.error("Connection Failed: Received empty response from Hugging Face API.")
            return False
    except Exception as e:
        logger.error(f"Connection Failed: Could not connect to Hugging Face API. Error: {e}")
        return False


def query_llm_standard(prompt: str, model: str = None, max_new_tokens: int = 500) -> str:
    """
    Queries the Hugging Face Standard Inference API (text generation endpoint).
    Uses https://api-inference.huggingface.co/models/{model_id} directly,
    avoiding the /v1/chat/completions endpoint entirely.

    Returns the generated text as a string.
    Raises on API failure.
    """
    hf_token = _get_hf_token()
    selected_model = model or DEFAULT_MODEL
    url = f"{_HF_STD_API_BASE}/{selected_model}"

    headers = {
        "Authorization": f"Bearer {hf_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": max_new_tokens,
            "return_full_text": False,
        },
    }

    logger.info(f"[StandardAPI] Calling model={selected_model}, prompt_len={len(prompt)}")

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()

        data = resp.json()

        # The Standard API returns a list of dicts: [{"generated_text": "..."}]
        if isinstance(data, list) and len(data) > 0:
            return data[0].get("generated_text", "")
        elif isinstance(data, dict) and "generated_text" in data:
            return data["generated_text"]
        else:
            logger.error(f"[StandardAPI] Unexpected response shape: {str(data)[:300]}")
            raise ValueError(f"Unexpected HF Standard API response: {str(data)[:300]}")

    except requests.exceptions.RequestException as e:
        logger.error(f"[StandardAPI] HTTP error for model {selected_model}: {e}")
        raise


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
