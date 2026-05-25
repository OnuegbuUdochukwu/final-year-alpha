import os
import logging
from huggingface_hub import InferenceClient

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "meta-llama/Meta-Llama-3-8B-Instruct"

def _get_client() -> InferenceClient:
    """Returns an authenticated InferenceClient, raises an error if token is missing."""
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        raise ValueError("HF_TOKEN environment variable is missing or empty. Cannot connect to Hugging Face API.")
    return InferenceClient(api_key=hf_token)

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

def query_llm(system_prompt: str, user_prompt: str, model: str = None, max_tokens: int = 1000, temperature: float = 0.1) -> str:
    """
    Queries the Hugging Face LLM using the provided prompts.
    """
    client = _get_client()
    selected_model = model or DEFAULT_MODEL
    
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    try:
        response = client.chat.completions.create(
            model=selected_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"LLM Query Failed for model {selected_model}: {e}")
        raise
