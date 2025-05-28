from llama_cpp import Llama
from modules import config
import json
import os
from modules.FAISSModules import ImageFaissManager,DocumentFaissManager,HistoryFaissManager,AudioFaissManager
from modules.WhisperModules import WhisperNoFFmpeg

class LLMManager:
    def __init__(self,embedding_model,stt_model : WhisperNoFFmpeg ,session_id="General",temperature=0.5,top_k=40,top_p=0.9):
        self.llm = Llama(model_path=config.MODEL_PATH,n_gpu_layers=config.N_GPU_LAYERS,n_ctx=config.TOKEN_LIMIT,chat_format="chatml",verbose=True)
        self.temperature=temperature
        self.top_k=top_k
        self.embedding_model=embedding_model
        self.stt_model=stt_model
        self.top_p=top_p
        self.session_id=session_id
        self.latest_file = []
        self.current_prompt=""
        self.imageManager : ImageFaissManager = None
        self.docManager : DocumentFaissManager = None
        self.histManager : HistoryFaissManager = None
        self.audioManager : AudioFaissManager = None
        self._load_faiss()

    def _load_faiss(self):
        self.imageManager=ImageFaissManager(embedding_model=self.embedding_model,session_id=self.session_id,index_path="image.index")
        self.docManager=DocumentFaissManager(embedding_model=self.embedding_model,session_id=self.session_id,index_path="doc.index")
        self.audioManager=AudioFaissManager(STT_MODEL=self.stt_model,embedding_model=self.embedding_model,session_id=self.session_id,index_path="audio.index")

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

        # Relevancy Score
        for result in results:
            if latest_upload and any(upload_path in result["metadata"]["path"] for upload_path in latest_upload):
                result["Relevancy Score"] = result["distance"]*0.75
            else:
                result["Relevancy Score"] = result["distance"]*2

        # Sort by custom relevance and distance
        results.sort(key=lambda x: (x["Relevancy Score"], x["distance"]))
        print(results)
        return results[:top_k]
    
    def delete_files(self,file_ids:list,types:list):
        if not file_ids:
            return
        for id,type in zip(file_ids,types):
            if type in ['pdf','docx','notes','txt']:
                self.docManager.delete_by_metadata_id(id)
            elif type in ['mp3','wav']:
                self.audioManager.delete_by_metadata_id(id)
            elif type in ['jpg','png','jpeg','webp','bmp']:
                self.imageManager.delete_by_metadata_id(id)

    def process_file(self,file_paths : list,file_ids:list):
        if not file_paths:
            return
        for file_path,file_id in zip(file_paths,file_ids):
            if file_path.endswith((".pdf",".docx",'.notes','.txt')):
                self.docManager.process_document(file_path,file_id)
            elif file_path.endswith((".jpg", ".png", ".jpeg",'.webp','.bmp')):
                self.imageManager.process_image(file_path,file_id)
            elif file_path.endswith((".mp3",".wav")):
                self.audioManager.process_audio(file_path,file_id)
            else:
                print("Invalid file extension")
                continue
    
    # def stream_generator(self,user_prompt):
    #     final_response=""
    #     response = self.llm.create_chat_completion(messages=user_prompt,stream=True,max_tokens=config.TOKEN_LIMIT,
    #                         stop=["<|im_end|>", "<|user|>", "<|system|>"],
    #                         temperature=self.temperature,
    #                         top_k=self.top_k,
    #                         top_p=self.top_p,
    #                         repeat_penalty=1.1
    #                         )
    #     for chunk in response:
    #         if "choices" in chunk and chunk["choices"]:
    #             text = chunk["choices"][0].get("delta", {}).get("content", "")
    #             print(f'{text}',end='')
    #             final_response += text
    #             yield json.dumps({'text':text})+'\n'
    #     print(f'\nFinal Response : \n{final_response}')
    #     return final_response

    def stream_generator(self, user_prompt):
    # Add reasoning instruction with special tokens
        prompt_with_reasoning = user_prompt.copy()
        prompt_with_reasoning.append({
            "role": "assistant", 
            "content": "<thinking>\nLet me think through this step by step:\n"
        })
        
        response = self.llm.create_chat_completion(
            messages=prompt_with_reasoning,
            stream=True,
            max_tokens=config.TOKEN_LIMIT,
            stop=["<|im_end|>", "<|user|>", "<|system|>"],
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
            repeat_penalty=1.1
        )
        print("<think>\nLet me think through this step by step:\n")
        in_thinking = True
        for chunk in response:
            if "choices" in chunk and chunk["choices"]:
                text = chunk["choices"][0].get("delta", {}).get("content", "")
                print(text,end='')
                # Check if we're leaving thinking mode
                if "</think>" in text:
                    in_thinking = False
                    # Only yield content after </thinking>
                    after_thinking = text.split("</think>", 1)
                    if len(after_thinking) > 1:
                        yield json.dumps({'text': after_thinking[1]}) + '\n'
                    continue
                
                # Only yield if we're not in thinking mode
                if not in_thinking:
                    yield json.dumps({'text': text}) + '\n'
        print("================== EOF Prompt ===================")

    
    def format_metadata(self,metadata):
        """Format metadata based on the result type."""
        data = metadata["metadata"]
        if "document" == metadata["type"]:
            formatted = f"Path: {data['path']}\n"
            formatted = f"Type: {metadata["type"]}\n"
            formatted += f"Title: {data['title']}\n"
            formatted += f"Text: {data['text']}\n"
        
        elif "image" == metadata["type"]:
            formatted = f"Path: {data['path']}\n"
            formatted = f"Type: {metadata["type"]}\n"
            formatted += f"Objects Detected: {', '.join(data.get('objects', []))}\n"
            formatted += f"Extracted Text: {data['text']}\n"
        
        elif "audio" == metadata["type"]:
            formatted = f"Path: {data['title']}\n"
            formatted = f"Type: {metadata["type"]}\n"
            formatted += f"Title: {data['distance']}\n"
            formatted += f"Transcribed Text: {data['text']}\n"
        else:
            return str(metadata)

        return formatted

    def format_prompt(self,user_prompt,latest_upload=None):
        relevant_entries = []
        model_path = os.path.basename(config.MODEL_PATH)
        model_name = os.path.splitext(model_path)[0]
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
f"""You are {model_name}, a helpful AI assistant specializing in educational content. You help users study and work on projects by analyzing their materials and providing clear explanations.

## Your Task
Analyze the files from the current session and provide comprehensive explanations. If data is unclear, interpret it using your knowledge and explain your reasoning. You may expand upon the information in the files or use your own knowledge if no files are present.

## Response Format
Use markdown formatting with the following structure:

### Text Formatting
- **Bold** for key terms, important concepts, and definitions  
- *Italics* for emphasis and foreign terms
- `code formatting` for technical terms and specific values
- > Blockquotes for important notes or definitions

### Organization
- ## Main headers for primary topics
- ### Subheaders for detailed sections
- **Bullet points** for lists and categories
- **Numbered lists** for steps and processes
- **Tables** for comparisons (use | syntax)

### Mathematical Content
- $inline math$ for simple formulas within text
- $$block math$$ for complex equations
- Always explain variables and symbols after formulas

## Priority Focus Areas
{priority_section}

## Session Files
{relevant_section}

Provide your response directly based on the user's question and the available materials.
"""
            },{"role": "user", "content": user_prompt}
        ]
        print(prompt)
            
        return prompt

    

        