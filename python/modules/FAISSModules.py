import faiss
import json
import os
import numpy as np
import gc
from abc import ABC, abstractmethod
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Union
from modules import config
from modules.EmbeddingModules import split_text
from modules.DocumentModules import extract_text_from_docx,extract_text_from_pdf,extract_title_from_docx,extract_title_from_pdf
from modules.ImageModules import extract_object_from_image,extract_text_from_image
import whisper
from pydantic import BaseModel
class FileData(BaseModel):
    id:str
    name: str
    arrayBuffer: Union[str, List[int]]

class FileClass(BaseModel):
    id:str
    path:str

class BaseFaissManager:
    def __init__(self, embedding_model: SentenceTransformer,session_id = "General", index_path="faiss.index", dimension = config.FAISS_DIM):
        
        self.session_folder = os.path.join(config.INDEX_BASE_FOLDER,session_id)
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
        if os.path.exists(self.metadata_path):
            with open(self.metadata_path, "r") as f:
                return json.load(f)
        return {}

    def _save_metadata(self):
        with open(self.metadata_path, "w") as f:
            json.dump(self.metadata, f, indent=4)

    def data_exists(self):
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
        Searches FAISS for relevant content based on query and optionally a file path.
        
        :param query: The user question.
        :param file_path: If provided, prioritizes results from this file.
        :param top_k: Number of results to return.
        :return: List of relevant metadata.
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
    def get_embedding_text(self, metadata: Dict) -> str:
        """For documents, we embed the 'text' field."""
        return metadata.get("text", "")
    
    def add_document(self,id:str, path: str, text: str, title: str = None):
        if not title:
            title = os.path.basename(path)
        metadata = {"id":id,"path": path, "text": text, "title": title}
        self.add(text, metadata)

    def process_document(self,path:str,id:str):
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
        # Check for duplicate based on 'path', 'text', and 'objects'
        for existing_metadata in self.metadata.values():
            if (existing_metadata.get("path") == metadata.get("path") and
                existing_metadata.get("text") == metadata.get("text") and
                existing_metadata.get("title") == metadata.get("title")):
                return True
        return False

class ImageFaissManager(BaseFaissManager):
    def get_embedding_text(self, metadata: Dict) -> str:
        """For images, we embed the 'text' field (extracted text from image)."""
        return metadata.get("text", "")
    
    def add_image(self,id:str, path: str, text: str, objects: List[str]):
        metadata = {"id":id,"path": path, "text": text, "objects": objects}
        self.add(text, metadata)
    
    def process_image(self,image_path : str,id):
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"File not found: {image_path}")
        
        text = extract_text_from_image(image_path)
        objects = extract_object_from_image(image_path)

        text_chunks = split_text(text)

        for chunk in text_chunks:
            self.add_image(id=id,path=image_path,text=chunk,objects=objects)
            self._save_last_id()

    def check_duplicate_metadata(self, metadata: Dict[str, Union[str, List[str]]]) -> bool:
        # Check for duplicate based on 'path', 'text', and 'objects'
        for existing_metadata in self.metadata.values():
            if (existing_metadata.get("path") == metadata.get("path") and
                existing_metadata.get("text") == metadata.get("text") and
                set(existing_metadata.get("objects", [])) == set(metadata.get("objects", []))):
                return True
        return False


class AudioFaissManager(BaseFaissManager):
    def __init__(self,STT_MODEL, embedding_model: SentenceTransformer,session_id = "General", index_path="faiss.index", dimension = config.FAISS_DIM):
        super(AudioFaissManager,self).__init__(embedding_model,session_id,index_path,dimension)
        self.model = STT_MODEL

    def get_embedding_text(self, metadata: Dict) -> str:
        """For audio, we embed the 'transcription' field."""
        return metadata.get("transcription", "")
    
    def add_audio(self,id:str, path: str, text: str, lang: str = None):
        if not lang:
            lang = 'en'
        metadata = {"id":id,"path": path, "transcription": text, "language": lang}
        self.add(text, metadata)

    def extract_title(self,path:str):
        return os.path.basename(path)

    def process_audio(self,audio_path:str,id:str):
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
    def add_message(self, role: str, text: str, timestamp: float = None):
        """
        Adds a chat message to the FAISS index.
        
        :param message_id: Unique message identifier.
        :param role: "user" or "assistant".
        :param text: The chat message.
        :param timestamp: UNIX timestamp (optional, defaults to current time).
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
        """For history, we embed the 'text' field."""
        return metadata.get("text", "")
    def get_recent_messages(self, count: int = 5):
        """
        Retrieves the most recent chat messages based on metadata timestamps.
        
        :param count: Number of messages to retrieve.
        :return: List of messages sorted by timestamp.
        """
        messages = sorted(self.metadata.values(), key=lambda x: x["timestamp"], reverse=True)
        return messages[:count*2]