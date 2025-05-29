from transformers import AutoTokenizer, AutoModelForCausalLM,TextIteratorStreamer
from modules import config
import json
import os
from modules.FAISSModules import ImageFaissManager,DocumentFaissManager,HistoryFaissManager
import torch
import shutil
import threading


class LLMManager:
    def __init__(self,embedding_model,session_id="General",model_name=config.MODEL_NAME,model_dir=config.MODEL_DIR,temperature=0.1,top_k=10,top_p=0.3):
       self.tokenizer=None
       self.model = None
       self.device = "cuda" if torch.cuda.is_available() else "cpu"
       self.model_name = model_name
       self.model_dir=os.path.join(model_dir,model_name)
       self.top_k,self.top_p,self.temperature = top_k,top_p,temperature
       self.embedding_model=embedding_model
       self.session_id=session_id
       self.latest_file = []
       self.current_prompt=""
       self.imageManager : ImageFaissManager = None
       self.docManager : DocumentFaissManager = None
       self.histManager : HistoryFaissManager = None
       self._load_faiss()
       self._load_model()
       self.streamer = TextIteratorStreamer(self.tokenizer, skip_prompt=True, skip_special_tokens=True)
        

    def _load_model(self):
        os.makedirs(self.model_dir, exist_ok=True)
        if not os.path.exists(os.path.join(self.model_dir, "config.json")):
            print(f"Downloading model: {self.model_name}")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForCausalLM.from_pretrained(self.model_name, torch_dtype=torch.float16, device_map="auto",attn_implementation="flash_attention_2",use_safetensors=True)
            cache_dir = os.path.expanduser("~/.cache/huggingface/hub/")

            # Get the exact path to the cached model directory
            model_cache_dir = os.path.join(cache_dir, f"models--{self.model_name.replace('/', '--')}")
            if os.path.exists(model_cache_dir):
                shutil.rmtree(model_cache_dir)
                print(f"Deleted cache for model: {self.model_name}")
            else:
                print("Cache already cleared or model was not cached.")
            # Save model to local directory
            self.tokenizer.save_pretrained(self.model_dir)
            self.model.save_pretrained(self.model_dir)
            print("Model saved to disk.")
        else:
            cache_dir = os.path.expanduser("~/.cache/huggingface/hub/")
            model_cache_dir = os.path.join(cache_dir, f"models--{self.model_name.replace('/', '--')}")
            if os.path.exists(model_cache_dir):
                shutil.rmtree(model_cache_dir)
                print(f"Deleted cache for model: {self.model_name}")
            else:
                print("Cache already cleared or model was not cached.")
            
            print(f"Loading model from {self.model_dir}")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_dir)
            self.model = AutoModelForCausalLM.from_pretrained(self.model_dir, torch_dtype=torch.float16, device_map="auto")

        print("Model ready!")

    def _load_faiss(self):
        self.imageManager=ImageFaissManager(embedding_model=self.embedding_model,session_id=self.session_id,index_path="image.index")
        self.docManager=DocumentFaissManager(embedding_model=self.embedding_model,session_id=self.session_id,index_path="doc.index")

    def _update_session(self,session_id):
        self.session_id=session_id
        self._load_faiss()

    def faiss_trained(self):
        return (
            self.docManager.index.is_trained or
            self.docManager.index.ntotal > 0 or
            self.imageManager.index.is_trained or
            self.imageManager.index.ntotal > 0
        )

    def search_all(self, query: str, latest_upload=None, top_k: int = 5):
        """Searches across all FAISS managers and aggregates results."""
        results = []
        results.extend(self.docManager.search(query, latest_upload,file_type="document", top_k=top_k))
        results.extend(self.imageManager.search(query, latest_upload,file_type="image", top_k=top_k))

        # Assign a custom relevance score, prioritizing the latest uploads
        for result in results:
            if latest_upload and any(upload_path in result["metadata"]["path"] for upload_path in latest_upload):
                result["custom_relevance"] = result["distance"]*0.75  # Boost for latest uploads
            else:
                result["custom_relevance"] = result["distance"]*2   # Default relevance

        # Sort by custom relevance and distance
        results.sort(key=lambda x: (x["custom_relevance"], x["distance"]))
        print(results)
        return results[:top_k]
    
    def process_file(self,file_paths : list):
        if not file_paths:
            return
        for file_path in file_paths:
            if file_path.endswith((".pdf",".docx")):
                self.docManager.process_document(file_path)
            elif file_path.endswith((".jpg", ".png", ".jpeg")):
                self.imageManager.process_image(file_path)
            else:
                print("Invalid file extension")
                continue
    
    def stream_generator(self,user_prompt):
        final_response=""
        chat_text = self.tokenizer.apply_chat_template(user_prompt,tokenize=False,add_generation_prompt=True)
        inputs = self.tokenizer(chat_text,padding=True, return_tensors="pt").to(self.device)

        thread = threading.Thread(target=self.model.generate, kwargs={
            "input_ids": inputs["input_ids"],
            "max_new_tokens": config.TOKEN_LIMIT,
            "streamer": self.streamer,
            "temperature": self.temperature,
            "top_k": self.top_k,
            "top_p": self.top_p,
        })
        print("Thinking. . .")
        thread.start()
        for chunk in self.streamer:
            print(chunk,end='')
            final_response+=f'{chunk}'
            yield json.dumps({'text':chunk})+'\n'
        
        thread.join()

        print(f'\nFinal Response : {final_response}')
        final_response=final_response.strip()
        return final_response
    
    def format_metadata(self,metadata):
        """Format metadata based on the result type."""
        data = metadata["metadata"]
        if "document" == metadata["type"]:  # If the result is a document
            formatted = f"Path: {data['path']}\n"
            formatted += f"Title: {data['title']}\n"
            formatted += f"Text: {data['text']}\n"
        
        elif "image" == metadata["type"]:  # If the result is an image
            formatted = f"Path: {data['path']}\n"
            formatted += f"Objects Detected: {', '.join(data.get('objects', []))}\n"
            formatted += f"Extracted Text: {data['text']}\n"
        
        elif "audio" == metadata["type"]:  # If the result is an audio file
            formatted = f"Path: {data['title']}\n"
            formatted += f"Title: {data['distance']}\n"
            formatted += f"Transcribed Text: {data['text']}\n"
        else:
            return str(metadata)

        return formatted

    def format_prompt(self,user_prompt,latest_upload=None):
        relevant_entries = []
        relevant_section=""
        priority_section=[]
        self.current_prompt=user_prompt
        if self.faiss_trained():
            relevant_entries = self.search_all(user_prompt,latest_upload,max(len(latest_upload),1)*5)
            relevant_section="Added Information : \n"
            for entry in relevant_entries:
                relevant_section+=self.format_metadata(entry)
        if latest_upload:
                upload_info = "\n".join([f"- \"{file}\"" for file in latest_upload])
                priority_section = (
                    "Item recently uploaded by user :\n"
                    f"{upload_info}"
                )
        prompt = [
            {"role": "system", "content": 
                "You are a helpful assistant.\n"
                "Analyze all data carefully before responding.\n"
                "Only provide references if explicitly mentioned in the document.\n"
                "Do not generate fake references. Do not repeat references multiple times.\n"
                f"{priority_section}\n"
                f"{relevant_section}"
            }
        ] + [
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": ""}  # Empty because the model will generate this
        ]
        print(prompt)
            
        return prompt


        