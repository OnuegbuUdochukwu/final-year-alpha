import logging
from fuzzywuzzy import process
import re

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

class SkillNormalizer:
    """Normalizes extracted skill entities to a canonical dictionary representation."""

    def __init__(self):
        # A master dictionary of known canonical skills
        # In a real environment, this might be loaded dynamically from the PostgreSQL `skills` table.
        self.canonical_skills = {
            "Python": "Python",
            "JavaScript": "JavaScript",
            "JS": "JavaScript",
            "React": "React",
            "React.js": "React",
            "ReactJS": "React",
            "Node.js": "Node.js",
            "Node": "Node.js",
            "Express": "Express.js",
            "Express.js": "Express.js",
            "SQL": "SQL",
            "MySQL": "MySQL",
            "PostgreSQL": "PostgreSQL",
            "Postgres": "PostgreSQL",
            "Docker": "Docker",
            "Kubernetes": "Kubernetes",
            "K8s": "Kubernetes",
            "AWS": "AWS",
            "Amazon Web Services": "AWS",
            "Azure": "Azure",
            "GCP": "GCP",
            "Google Cloud Platform": "GCP",
            "Machine Learning": "Machine Learning",
            "ML": "Machine Learning",
            "Artificial Intelligence": "AI",
            "AI": "AI",
            "Java": "Java",
            "C++": "C++",
            "HTML": "HTML",
            "CSS": "CSS",
            "Git": "Git",
            "Selenium": "Selenium"
        }
        
        # Extracted purely for fuzzy matching against values
        self.canonical_list = list(set(self.canonical_skills.values()))
        # Set a reasonable cut-off for fuzzy matching confidence (0-100)
        self.fuzzy_threshold = 80

    def clean_skill_string(self, raw_skill: str) -> str:
        """Basic text cleaning to remove strange punctuation but preserve necessary dots (like Node.js)."""
        # Lowercase, strip surrounding whitespace
        cleaned = raw_skill.strip()
        # Remove trailing periods
        if cleaned.endswith('.'):
            cleaned = cleaned[:-1]
        return cleaned

    def normalize(self, raw_skill: str) -> str:
        """
        Takes a raw extracted string and attempts to resolve it:
        1. Exact match checking via the alias dictionary.
        2. Case-insensitive exact match.
        3. Fuzzy match against the known canonical list.
        """
        cleaned = self.clean_skill_string(raw_skill)
        if not cleaned:
            return None

        # 1. Direct Lookup (Exact)
        if cleaned in self.canonical_skills:
            return self.canonical_skills[cleaned]
            
        # 2. Case-insensitive lookup
        lower_map = {k.lower(): v for k, v in self.canonical_skills.items()}
        if cleaned.lower() in lower_map:
            return lower_map[cleaned.lower()]

        # 3. Fuzzy Matching using Levenshtein distance
        # 'extractOne' returns a tuple: (matched_string, score)
        best_match, score = process.extractOne(cleaned, self.canonical_list)
        
        if score >= self.fuzzy_threshold:
            logger.debug(f"Fuzzy matched '{cleaned}' -> '{best_match}' (Score: {score})")
            return best_match
            
        logger.debug(f"Could not normalize '{cleaned}' (Best match: {best_match} @ {score})")
        return cleaned # Return as-is if we couldn't confidently normalize

    def normalize_list(self, raw_skills_list: list) -> list:
        """Normalizes an entire list of strings, removing duplicates."""
        normalized_set = set()
        for skill in raw_skills_list:
            norm = self.normalize(skill)
            if norm:
                normalized_set.add(norm)
        return list(normalized_set)

if __name__ == "__main__":
    normalizer = SkillNormalizer()
    
    test_cases = ["react", "ReactJS", "Javascript", "K8s", "node js", "UnknownSkill"]
    
    print("--- Skill Normalization Test ---")
    for test in test_cases:
        result = normalizer.normalize(test)
        print(f"Raw: {test.ljust(15)} => Normalized: {result}")
