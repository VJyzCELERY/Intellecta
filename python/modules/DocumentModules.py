from pypdf import PdfReader
from docx import Document
import os

def extract_title_from_pdf(pdf_path,fallback=None):
    reader = PdfReader(pdf_path)
    
    # Try to get the title from metadata
    if reader.metadata and reader.metadata.title:
        return reader.metadata.title.strip()
    
    # If no metadata title, infer from the first page
    if len(reader.pages) > 0:
        first_page_text = reader.pages[0].extract_text().strip()
        if first_page_text:
            return first_page_text.split("\n")[0]  # Assume first line is the title
    if fallback:
        return fallback
    return os.path.basename(pdf_path)

def extract_title_from_docx(docx_path,fallback : str = None):
    doc = Document(docx_path)
    
    # Try to find a bold or large font text as the title
    for para in doc.paragraphs:
        if para.style.name.startswith("Heading") or any(run.bold for run in para.runs):
            return para.text.strip()
    if fallback:
        return fallback
    # If no heading found, assume first paragraph is the title
    return os.path.basename(docx_path)


def extract_text_from_pdf(pdf_path):
    text = ""
    with open(pdf_path, "rb") as f:
        reader = PdfReader(f)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    return text

# Function to extract text from DOCX
def extract_text_from_docx(docx_path):
    doc = Document(docx_path)
    return "\n".join([p.text for p in doc.paragraphs])