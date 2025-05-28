from langchain_huggingface import HuggingFaceEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import whisper
from modules import config

EMBEDDING_MODEL = SentenceTransformer(model_name_or_path="all-MiniLM-L6-v2")

def split_text(text):
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=config.CHUNK_SIZE,chunk_overlap=200)
    return text_splitter.split_text(text)