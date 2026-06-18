import io
import os
import tempfile
import logging
from typing import Optional
import pymupdf4llm
import docx

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

class DocumentExtractor:
    """Utility class for extracting clean text from binary documents (PDF, DOCX)."""

    @staticmethod
    def extract_from_pdf(file_bytes: bytes) -> Optional[str]:
        """Extracts text from a PDF file as Markdown using pymupdf4llm to preserve visual hierarchy."""
        pdf_path = None
        try:
            # Write raw bytes to a temporary file
            fd_pdf, pdf_path = tempfile.mkstemp(suffix=".pdf")
            with os.fdopen(fd_pdf, 'wb') as f:
                f.write(file_bytes)
            
            # Extract layout-aware markdown
            md_text = pymupdf4llm.to_markdown(pdf_path)
            
            return DocumentExtractor._clean_text(md_text)
        except Exception as e:
            logger.error(f"Failed to extract text from PDF using pymupdf4llm: {e}")
            return None
        finally:
            # Clean up the temporary file
            if pdf_path and os.path.exists(pdf_path):
                try:
                    os.unlink(pdf_path)
                except Exception as cleanup_err:
                    logger.warning(f"Failed to clean up temp PDF {pdf_path}: {cleanup_err}")

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
