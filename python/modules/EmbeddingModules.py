from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from modules import config

# Load the SentenceTransformer model once globally
EMBEDDING_MODEL = SentenceTransformer(model_name_or_path="all-MiniLM-L6-v2")

def split_text(text):
    """
    Splits a long text into smaller overlapping chunks using LangChain's RecursiveCharacterTextSplitter.

    This is useful for embedding large texts into manageable chunks for better performance in similarity search
    and vector-based retrieval systems.

    Parameters:
        text (str): The raw text to be split.

    Returns:
        List[str]: A list of text chunks with defined size and overlap.
    """
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=config.CHUNK_SIZE,chunk_overlap=200)
    return text_splitter.split_text(text)