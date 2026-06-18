import re
import logging

logger = logging.getLogger(__name__)

def extract_static_metadata(md_text: str) -> dict:
    """
    Extracts static metadata from the Markdown text using heuristics.
    """
    metadata = {
        "name": "",
        "contact": {
            "email": "",
            "phone": "",
            "location": "",
            "linkedin": ""
        },
        "summary": "",
        "interests": []
    }
    
    if not md_text:
        return metadata

    lines = [line.strip() for line in md_text.split('\n') if line.strip()]
    
    # 1. Name: usually in the first 2 non-empty lines
    for line in lines[:2]:
        # Strip markdown headers if any
        clean_line = line.replace('#', '').replace('*', '').strip()
        if clean_line and len(clean_line.split()) <= 4:  # A name is usually 1-4 words
            metadata["name"] = clean_line
            break

    # 2. Contact string scanning (first 15 lines)
    for line in lines[:15]:
        # Email
        email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', line)
        if email_match and not metadata["contact"]["email"]:
            metadata["contact"]["email"] = email_match.group(0)
            
        # Phone (simple heuristic: looks like a phone number)
        phone_match = re.search(r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', line)
        if phone_match and not metadata["contact"]["phone"]:
            metadata["contact"]["phone"] = phone_match.group(0)
            
        # LinkedIn / Links
        linkedin_match = re.search(r'(https?://[^\s]+|linkedin\.com[^\s]*)', line, re.IGNORECASE)
        if linkedin_match and not metadata["contact"]["linkedin"]:
            metadata["contact"]["linkedin"] = linkedin_match.group(0)

    # 3. Summary / Profile
    # Search for header containing "Profile" or "Summary", capture until next header
    in_summary = False
    summary_lines = []
    for line in lines:
        is_header = line.startswith('#') or line.isupper()
        if not in_summary:
            if re.search(r'\b(Profile|Summary|About)\b', line, re.IGNORECASE) and len(line) < 50:
                in_summary = True
        else:
            if is_header and len(line) < 50: # Next section
                break
            summary_lines.append(line)
    
    if summary_lines:
        metadata["summary"] = "\n".join(summary_lines)

    # 4. Interests
    in_interests = False
    interests_lines = []
    for line in lines:
        is_header = line.startswith('#') or line.isupper()
        if not in_interests:
            if re.search(r'\b(Interests|Hobbies)\b', line, re.IGNORECASE) and len(line) < 50:
                in_interests = True
        else:
            if is_header and len(line) < 50:
                break
            interests_lines.append(line)

    if interests_lines:
        # Flatten and split by commas or bullets
        full_interests = " ".join(interests_lines)
        items = re.split(r'[,|•*►-]', full_interests)
        metadata["interests"] = [i.strip() for i in items if i.strip()]

    return metadata

def reconcile_resume_data(md_text: str, llm_data: dict) -> dict:
    """
    Merges llm_data with the statically extracted metadata.
    If an LLM field is null or empty, it overwrites it with static data.
    """
    if not isinstance(llm_data, dict):
        return llm_data

    static_data = extract_static_metadata(md_text)

    # Reconcile Name
    if not llm_data.get("name") or str(llm_data.get("name")).strip() == "":
        llm_data["name"] = static_data["name"]

    # Reconcile Contact
    contact = llm_data.get("contact", {})
    if not isinstance(contact, dict):
        contact = {}
    
    for key in ["email", "phone", "linkedin"]:
        if not contact.get(key) or str(contact.get(key)).strip() == "":
            contact[key] = static_data["contact"][key]
    llm_data["contact"] = contact

    # Reconcile Summary
    if not llm_data.get("summary") or len(str(llm_data.get("summary")).strip()) < 10:
        if static_data["summary"]:
            llm_data["summary"] = static_data["summary"]

    # Reconcile Interests into Skills
    if static_data["interests"]:
        skills = llm_data.get("skills", [])
        if not isinstance(skills, list):
            skills = []
        skills.extend(static_data["interests"])
        # deduplicate
        llm_data["skills"] = list(dict.fromkeys(skills))

    return llm_data
