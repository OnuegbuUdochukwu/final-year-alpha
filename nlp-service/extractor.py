import io
import os
import tempfile
import logging
from typing import Optional
from pdf2docx import Converter
import docx

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

class DocumentExtractor:
    """Utility class for extracting clean text from binary documents (PDF, DOCX)."""

    @staticmethod
    def extract_from_pdf(file_bytes: bytes) -> Optional[str]:
        """Extracts text from a PDF file by normalizing its layout via a temporary DOCX conversion."""
        pdf_path = None
        docx_path = None
        try:
            # 1. Write the raw PDF bytes to a temporary file
            fd_pdf, pdf_path = tempfile.mkstemp(suffix=".pdf")
            with os.fdopen(fd_pdf, 'wb') as f:
                f.write(file_bytes)
            
            # 2. Create a path for the temporary DOCX file
            fd_docx, docx_path = tempfile.mkstemp(suffix=".docx")
            os.close(fd_docx) # Close immediately, pdf2docx will write to it
            
            # 3. Convert PDF to DOCX
            cv = Converter(pdf_path)
            cv.convert(docx_path, start=0, end=None)
            cv.close()
            
            # 4. Read the DOCX file back into bytes to reuse our extract_from_docx logic
            with open(docx_path, 'rb') as f:
                docx_bytes = f.read()
                
            return DocumentExtractor.extract_from_docx(docx_bytes)
        except Exception as e:
            logger.error(f"Failed to extract text from PDF via docx normalization: {e}")
            return None
        finally:
            # 5. Clean up temporary files
            if pdf_path and os.path.exists(pdf_path):
                try:
                    os.unlink(pdf_path)
                except Exception as cleanup_err:
                    logger.warning(f"Failed to clean up temp PDF {pdf_path}: {cleanup_err}")
                    
            if docx_path and os.path.exists(docx_path):
                try:
                    os.unlink(docx_path)
                except Exception as cleanup_err:
                    logger.warning(f"Failed to clean up temp DOCX {docx_path}: {cleanup_err}")

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
