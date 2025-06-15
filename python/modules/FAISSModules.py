import faiss
import json
import os
import numpy as np
import gc
from abc import abstractmethod
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Union
from modules import config
from modules.EmbeddingModules import split_text
from modules.DocumentModules import extract_text_from_docx,extract_text_from_pdf,extract_title_from_docx,extract_title_from_pdf
from modules.ImageModules import extract_object_from_image,extract_text_from_image
from pydantic import BaseModel
class FileData(BaseModel):
    id:str
    name: str
    arrayBuffer: Union[str, List[int]]

class FileClass(BaseModel):
    id:str
    path:str

class BaseFaissManager:
    """
    Abstract base class for managing FAISS indexes with metadata support.
    This class handles embedding storage, searching, deduplication, deletion,
    and persistence of both the index and associated metadata.
    """
    def __init__(self, embedding_model: SentenceTransformer,session_id = "General", index_path="faiss.index", dimension = config.FAISS_DIM):
        """
        Initialize FAISS manager with a session-specific folder, embedding model, and FAISS configuration.
        
        Args:
            embedding_model (SentenceTransformer): Model for generating text embeddings.
            session_id (str): Unique identifier for the session.
            index_path (str): Name of the FAISS index file.
            dimension (int): Dimensionality of embeddings.
        """
        self.session_folder = os.path.join('userdata',session_id,config.INDEX_BASE_FOLDER)
        os.makedirs(self.session_folder, exist_ok=True)
        self.index_path = os.path.join(self.session_folder,index_path)
        self.metadata_path = os.path.join(self.session_folder, f"{index_path}-metadata.json")
        self.id_tracker_path = os.path.join(self.session_folder, f"{index_path}-id.json")
        self.last_id = self._load_last_id() 
        self.embedding_model = embedding_model
        self.dimension = dimension
        self.index = self._load_or_create_index()
        self.metadata = self._load_metadata()

    def _load_last_id(self):
        """Load the last used integer ID from disk."""
        if os.path.exists(self.id_tracker_path):
            with open(self.id_tracker_path, "r") as f:
                return json.load(f).get("last_id", 0)
        return -1

    def _save_last_id(self):
        """Save the current last used ID to disk."""
        with open(self.id_tracker_path, "w") as f:
            json.dump({"last_id": self.last_id}, f)

    def _load_or_create_index(self):
        if os.path.exists(self.index_path):
            try:
                return faiss.read_index(self.index_path)
            except Exception as e:
                print(f"Failed to load FAISS index ({self.index_path}): {e}. Creating a new one.")

        index = faiss.IndexHNSWFlat(self.dimension, 32)
        return faiss.IndexIDMap(index)

    def _load_metadata(self):
        """Load metadata associated with indexed vectors from disk."""
        if os.path.exists(self.metadata_path):
            with open(self.metadata_path, "r") as f:
                return json.load(f)
        return {}

    def _save_metadata(self):
        """Save metadata to disk."""
        with open(self.metadata_path, "w") as f:
            json.dump(self.metadata, f, indent=4)

    def data_exists(self):
        """Check if metadata exists for this session."""
        return os.path.exists(self.metadata_path)
    
    @abstractmethod
    def check_duplicate_metadata(self, metadata: Dict[str, Union[str, List[str]]]) -> bool:
        """Abstract method to check for duplicate metadata. 
        Each subclass should implement this method to check for duplicates based on its own metadata format."""
        pass
    
    @abstractmethod
    def get_embedding_text(self, metadata: Dict) -> str:
        """Abstract method to extract the text that should be used for embedding from metadata.
        Each subclass must implement this to specify which field contains the embeddable text."""
        pass

    def add(self, text: str, metadata: Dict[str, Union[str, List[str]]]):
        """Add an embedding and metadata to the FAISS index."""
        duplicate_data = self.check_duplicate_metadata(metadata)
        if duplicate_data:
            print("Duplicate Data, skipping")
            return duplicate_data
        self.last_id+=1
        item_id=self.last_id
        vector = self.embedding_model.encode([text])[0]
        self.index.add_with_ids(np.array([vector], dtype=np.float32), np.array([item_id], dtype=np.int64))
        self.metadata[str(item_id)] = metadata
        self._save_metadata()
        self._save_index()

    def search(self, query: str, file_paths = None,file_type="", top_k: int = 5):
        """
        Search for top-k closest embeddings given a query.
        
        Args:
            query (str): Search query.
            file_paths (list[str]): Prioritize results from these file paths.
            file_type (str): Type of the file (document, image, etc).
            top_k (int): Number of top results to return.
        
        Returns:
            List of matched metadata and distances.
        """
        vector = self.embedding_model.encode([query])[0]
        distances, indices = self.index.search(np.array([vector], dtype=np.float32), top_k)
        results = []
        for i, idx in enumerate(indices[0]):
            matches_path = False
            if idx == -1:
                continue
            item_id_str = str(idx)
            metadata = self.metadata.get(item_id_str, {})
            if file_paths:
                for path in file_paths:
                    print(f"DEBUG : {metadata.get("path")}")
                    if metadata.get("path") == path:
                        matches_path=True
                        break
            if file_paths and matches_path:
                results.insert(0, {"metadata": metadata, "distance": distances[0][i],"type":file_type})
            else:
                results.append({"metadata": metadata, "distance": distances[0][i],"type":file_type})
        
        return results

    def delete_by_metadata_id(self, target_id: str):
        """
        Delete all entries with the specified metadata 'id' and rebuild the FAISS index.
        
        :param target_id: The metadata 'id' to delete
        :return: Number of entries deleted
        """
        # Find all internal IDs that match the target metadata ID
        ids_to_delete = []
        for internal_id, metadata in self.metadata.items():
            if metadata.get("id") == target_id:
                ids_to_delete.append(int(internal_id))
        
        if not ids_to_delete:
            print(f"No entries found with metadata id: {target_id}")
            return 0
        
        print(f"Found {len(ids_to_delete)} entries to delete for metadata id: {target_id}")
        
        # Remove metadata entries
        for internal_id in ids_to_delete:
            del self.metadata[str(internal_id)]
        
        # Rebuild the FAISS index
        self._rebuild_index()
        
        # Save updated metadata
        self._save_metadata()
        
        print(f"Successfully deleted {len(ids_to_delete)} entries and rebuilt index")
        return len(ids_to_delete)
    
    def _rebuild_index(self):
        """
        Rebuild the FAISS index from scratch using remaining metadata.
        This is necessary because FAISS doesn't support efficient deletion.
        Resets internal IDs to start from 0 again.
        """
        print("Rebuilding FAISS index...")
        
        # Create new index
        base_index = faiss.IndexHNSWFlat(self.dimension, 32)
        self.index = faiss.IndexIDMap(base_index)
        
        # Re-add all remaining entries with new sequential IDs
        if self.metadata:
            texts = []
            old_metadata = self.metadata.copy()  # Keep copy of old metadata
            new_metadata = {}  # Create new metadata with sequential IDs
            new_id = 0
            
            for old_internal_id, metadata in old_metadata.items():
                # Use the subclass-specific method to extract embeddable text
                text = self.get_embedding_text(metadata)
                if text:
                    texts.append(text)
                    new_metadata[str(new_id)] = metadata  # Assign new sequential ID
                    new_id += 1
            
            if texts:
                # Generate embeddings for all texts
                vectors = self.embedding_model.encode(texts)
                
                # Create sequential internal IDs starting from 0
                sequential_ids = np.arange(len(texts), dtype=np.int64)
                
                # Add to index with sequential IDs
                self.index.add_with_ids(
                    np.array(vectors, dtype=np.float32),
                    sequential_ids
                )
                
                # Update metadata with new sequential IDs
                self.metadata = new_metadata
                
                # Update last_id to the highest used ID
                self.last_id = len(texts) - 1
            else:
                # No entries left, reset everything
                self.metadata = {}
                self.last_id = -1
        else:
            # No metadata, reset everything
            self.last_id = -1
        
        # Save updated last_id
        self._save_last_id()
        
        # Save the rebuilt index
        self._save_index()
        print(f"Index rebuild complete. New last_id: {self.last_id}")
    
    def _save_index(self):
        faiss.write_index(self.index, self.index_path)

    def get_metadata_ids(self):
        """
        Get all unique metadata 'id' values in the index.
        
        :return: Set of metadata IDs
        """
        metadata_ids = set()
        for metadata in self.metadata.values():
            if "id" in metadata:
                metadata_ids.add(metadata["id"])
        return metadata_ids

    def get_entries_by_metadata_id(self, target_id: str):
        """
        Get all entries with the specified metadata 'id'.
        
        :param target_id: The metadata 'id' to search for
        :return: List of metadata entries
        """
        entries = []
        for metadata in self.metadata.values():
            if metadata.get("id") == target_id:
                entries.append(metadata)
        return entries

class DocumentFaissManager(BaseFaissManager):
    """
    Handles the processing and indexing of document files into a FAISS vector store.
    """
    def get_embedding_text(self, metadata: Dict) -> str:
        """
        Extract the text to embed from the document metadata.

        Args:
            metadata (Dict): The metadata dictionary.

        Returns:
            str: The text to be embedded.
        """
        return metadata.get("text", "")
    
    def add_document(self,id:str, path: str, text: str, title: str = None):
        """
        Add a document (or a chunk of it) to the FAISS index.

        Args:
            id (str): Unique identifier for the document.
            path (str): File path of the document.
            text (str): Text content of the document chunk.
            title (str, optional): Title of the document. Defaults to filename if not provided.
        """
        if not title:
            title = os.path.basename(path)
        metadata = {"id":id,"path": path, "text": text, "title": title}
        self.add(text, metadata)

    def process_document(self,path:str,id:str):
        """
        Process and index a document by reading its text content and splitting into chunks.

        Args:
            path (str): Path to the document file.
            id (str): Document identifier.

        Raises:
            FileNotFoundError: If the file does not exist.
            ValueError: If the file extension is unsupported.
        """
        if not os.path.exists(path):
            raise FileNotFoundError(f"File not found : {path}")
        
        ext = os.path.splitext(path)[1].lower()
        if ext == ".pdf":
            text = extract_text_from_pdf(path)
            inferred_title = extract_title_from_pdf(path)
        elif ext == ".docx":
            text = extract_text_from_docx(path)
            inferred_title = extract_title_from_docx(path)
        elif ext == ".notes" or ext =='.txt':
            with open(path,'r') as file:
                text = file.read()
            inferred_title = os.path.basename(path)
        else:
            raise ValueError(f"Unsupported document type: {ext}")
        if not text:
            return
        
        text_chunks = split_text(text)
        
        for chunk in text_chunks:
            self.add_document(id=id,path=path,text=chunk,title=inferred_title)
            self._save_last_id()

    def check_duplicate_metadata(self, metadata: Dict[str, Union[str, List[str]]]) -> bool:
        """
        Check if the given metadata already exists in the index.

        Args:
            metadata (Dict): Metadata to check.

        Returns:
            bool: True if duplicate is found, False otherwise.
        """
        for existing_metadata in self.metadata.values():
            if (existing_metadata.get("path") == metadata.get("path") and
                existing_metadata.get("text") == metadata.get("text") and
                existing_metadata.get("title") == metadata.get("title")):
                return True
        return False

class ImageFaissManager(BaseFaissManager):
    """
    Manages the processing and indexing of images using extracted text and object recognition.
    """
    def get_embedding_text(self, metadata: Dict) -> str:
        """
        Extract the text to embed from image metadata.

        Args:
            metadata (Dict): The metadata dictionary.

        Returns:
            str: The extracted text to embed.
        """
        return metadata.get("text", "")
    
    def add_image(self,id:str, path: str, text: str, objects: List[str]):
        """
        Add an image's metadata to the FAISS index.

        Args:
            id (str): Unique identifier for the image.
            path (str): Path to the image file.
            text (str): OCR-extracted text.
            objects (List[str]): List of recognized objects.
        """
        metadata = {"id":id,"path": path, "text": text, "objects": objects}
        self.add(text, metadata)
    
    def process_image(self,image_path : str,id):
        """
        Process an image by extracting text and objects, then indexing the data.

        Args:
            image_path (str): Path to the image file.
            id (str): Unique identifier for this image.

        Raises:
            FileNotFoundError: If the image file does not exist.
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"File not found: {image_path}")
        
        text = extract_text_from_image(image_path)
        objects = extract_object_from_image(image_path)

        text_chunks = split_text(text)

        for chunk in text_chunks:
            self.add_image(id=id,path=image_path,text=chunk,objects=objects)
            self._save_last_id()

    def check_duplicate_metadata(self, metadata: Dict[str, Union[str, List[str]]]) -> bool:
        """
        Check for duplicate image metadata in the index.

        Args:
            metadata (Dict): Metadata to check.

        Returns:
            bool: True if duplicate exists, False otherwise.
        """
        for existing_metadata in self.metadata.values():
            if (existing_metadata.get("path") == metadata.get("path") and
                existing_metadata.get("text") == metadata.get("text") and
                set(existing_metadata.get("objects", [])) == set(metadata.get("objects", []))):
                return True
        return False


class AudioFaissManager(BaseFaissManager):
    """
    Handles audio processing by transcribing speech and indexing the transcription.
    """
    def __init__(self,STT_MODEL, embedding_model: SentenceTransformer,session_id = "General", index_path="faiss.index", dimension = config.FAISS_DIM):
        """
        Initialize the audio FAISS manager.

        Args:
            STT_MODEL: The speech-to-text model.
            embedding_model (SentenceTransformer): Embedding model instance.
            session_id (str, optional): Session name or ID.
            index_path (str, optional): Path to FAISS index file.
            dimension (int): Embedding dimension size.
        """
        super(AudioFaissManager,self).__init__(embedding_model,session_id,index_path,dimension)
        self.model = STT_MODEL

    def get_embedding_text(self, metadata: Dict) -> str:
        """
        Get the transcribed text from audio metadata.

        Args:
            metadata (Dict): Metadata dictionary.

        Returns:
            str: Transcribed text.
        """
        return metadata.get("transcription", "")
    
    def add_audio(self,id:str, path: str, text: str, lang: str = None):
        """
        Add audio transcription to the FAISS index.

        Args:
            id (str): Audio ID.
            path (str): Path to the audio file.
            text (str): Transcribed text.
            lang (str, optional): Language of the transcription. Defaults to 'en'.
        """
        if not lang:
            lang = 'en'
        metadata = {"id":id,"path": path, "transcription": text, "language": lang}
        self.add(text, metadata)

    def extract_title(self,path:str):
        """
        Extract the title (filename) from a path.

        Args:
            path (str): File path.

        Returns:
            str: Filename as title.
        """
        return os.path.basename(path)

    def process_audio(self,audio_path:str,id:str):
        """
        Process and transcribe an audio file, then add it to the FAISS index.

        Args:
            audio_path (str): Path to the audio file.
            id (str): Audio ID.

        Raises:
            FileNotFoundError: If the file is not found.
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"File not found: {audio_path}")
        try:
            result = self.model.transcribe(audio_path)
            transcription = result["text"]
            lang = result['language']
            transcription_chunk = split_text(transcription)

            for chunk in transcription_chunk:
                self.add_audio(id,audio_path,chunk,lang)
                self._save_last_id()
        except Exception as e:
            print("error during audio transcription :\n",e)



            

class HistoryFaissManager(BaseFaissManager):
    """
    Manages the indexing of chat history (user-assistant messages) into FAISS.
    """
    def add_message(self, role: str, text: str, timestamp: float = None):
        """
        Add a chat message to the FAISS index.

        Args:
            role (str): Role of sender ("user" or "assistant").
            text (str): Message text.
            timestamp (float, optional): UNIX timestamp. Defaults to current time.
        """
        if timestamp is None:
            timestamp = time.time()  # Use current time if not provided

        metadata = {
            "role": role,
            "text": text,
            "timestamp": timestamp
        }
        self.add(text, metadata)
    def get_embedding_text(self, metadata: Dict) -> str:
        """
        Extract the text to embed from chat metadata.

        Args:
            metadata (Dict): Message metadata.

        Returns:
            str: The chat text.
        """
        return metadata.get("text", "")
    def get_recent_messages(self, count: int = 5):
        """
        Retrieve the most recent chat messages.

        Args:
            count (int, optional): Number of recent messages to retrieve (x2 including user and assistant).

        Returns:
            List[Dict]: List of message metadata sorted by time.
        """
        messages = sorted(self.metadata.values(), key=lambda x: x["timestamp"], reverse=True)
        return messages[:count*2]