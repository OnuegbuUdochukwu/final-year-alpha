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

def extract_location_from_lines(md_text: str) -> str:
    """Simple heuristic to grab City, State if Location is missing."""
    for line in md_text.split('\n')[:15]:
        if re.search(r'\b[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}\b', line):
            return line.strip()
    return ""

def get_contact_info(llm_contact: dict, md_text: str) -> dict:
    if not isinstance(llm_contact, dict):
        llm_contact = {}
        
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', md_text)
    email = llm_contact.get("email") or (email_match.group(0) if email_match else "")
    
    phone_match = re.search(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', md_text)
    phone = llm_contact.get("phone") or (phone_match.group(0) if phone_match else "")
    
    linkedin_match = re.search(r'(linkedin\.com/in/[\w-]+)', md_text)
    linkedin = llm_contact.get("linkedin") or (linkedin_match.group(0) if linkedin_match else "")
    
    location = llm_contact.get("location") or extract_location_from_lines(md_text)

    return {"email": email, "phone": phone, "location": location, "linkedin": linkedin}
def extract_orphaned_sections(md_text: str, known_keys: list) -> dict:
    """
    Scans the Markdown for headers not covered by the LLM's known_keys.
    Returns a dict of orphaned sections: {header_lower: {"title": ..., "items": [...]}}
    """
    if not md_text:
        return {}

    pattern = re.compile(r'^(#{1,3})\s+(.+?)\n(.*?)(?=^#{1,3}\s|\Z)', re.MULTILINE | re.DOTALL)
    matches = pattern.findall(md_text)

    orphaned_data = {}
    normalized_known = [k.lower() for k in known_keys]

    for _, header, content in matches:
        clean_header = header.strip()
        if clean_header.lower() not in normalized_known:
            # Clean up the content and split by newlines or bullets into an array
            items = [line.strip('-* ').strip() for line in content.split('\n') if line.strip()]
            if items:
                orphaned_data[clean_header.lower()] = {
                    "title": clean_header,
                    "items": items
                }
    return orphaned_data

def normalize_resume(llm: dict, parsed: dict, md_text: str) -> dict:
    """
    Enforces a strict, flat schema for the frontend.
    """
    if not isinstance(llm, dict):
        llm = {}
    if not isinstance(parsed, dict):
        parsed = {}

    # Define the keys the LLM already successfully captured
    known_keys = [
        "skills", "biography", "contact", "summary",
        "experience", "education", "profile", "work experience"
    ]

    # Run the orphaned-section scraper
    orphaned_sections = extract_orphaned_sections(md_text, known_keys)

    return {
        "name": llm.get("name") or parsed.get("biography", {}).get("name", ""),
        "title": llm.get("title") or "",
        "summary": llm.get("summary") or "",
        "contact": get_contact_info(llm.get("contact", {}), md_text),
        "experience": llm.get("experience", []),
        "education": llm.get("education", []),
        "skills": llm.get("skills", []),
        "additional_sections": list(orphaned_sections.values())
    }
