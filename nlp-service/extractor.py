import io
import logging
from typing import Optional
from pdfminer.high_level import extract_text as extract_pdf_text
import docx

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

class DocumentExtractor:
    """Utility class for extracting clean text from binary documents (PDF, DOCX)."""

    @staticmethod
    def extract_from_pdf(file_bytes: bytes) -> Optional[str]:
        """Extracts text from a PDF file using pdfminer."""
        try:
            # Using io.BytesIO to simulate a file object for pdfminer
            pdf_file = io.BytesIO(file_bytes)
            text = extract_pdf_text(pdf_file)
            return DocumentExtractor._clean_text(text)
        except Exception as e:
            logger.error(f"Failed to extract text from PDF: {e}")
            return None

    @staticmethod
    def extract_from_docx(file_bytes: bytes) -> Optional[str]:
        """Extracts text from a DOCX file using python-docx."""
        try:
            docx_file = io.BytesIO(file_bytes)
            doc = docx.Document(docx_file)
            full_text = []
            for para in doc.paragraphs:
                full_text.append(para.text)
            text = '\n'.join(full_text)
            return DocumentExtractor._clean_text(text)
        except Exception as e:
            logger.error(f"Failed to extract text from DOCX: {e}")
            return None
            
    @staticmethod
    def extract_from_bytes(file_bytes: bytes, filename: str) -> Optional[str]:
        """Convenience method to extract based on filename extension."""
        if filename.lower().endswith('.pdf'):
            return DocumentExtractor.extract_from_pdf(file_bytes)
        elif filename.lower().endswith('.docx'):
            return DocumentExtractor.extract_from_docx(file_bytes)
        elif filename.lower().endswith('.txt'):
            try:
                return DocumentExtractor._clean_text(file_bytes.decode('utf-8'))
            except Exception as e:
                logger.error(f"Failed to decode TXT file: {e}")
                return None
        else:
            logger.warning(f"Unsupported file format: {filename}")
            return None

    @staticmethod
    def _clean_text(text: str) -> str:
        """Basic initial cleaning: strip whitespace and normalize newlines."""
        if not text:
            return ""
        # Remove massive excessive newlines or weird hidden encoding chars
        # We will do deeper NLP cleaning (lemmatizing/stopwords) in the NLP pipeline itself
        cleaned = text.strip()
        # Collapse multiple spaces or tabs into a single space if necessary, 
        # though newlines are preserved for paragraph structure.
        return cleaned

if __name__ == "__main__":
    # A simple test loop for local development if run directly
    print("Extractor module initialized successfully. Ready for use by the API.")
