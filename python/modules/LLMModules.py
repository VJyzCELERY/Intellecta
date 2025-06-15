from llama_cpp import Llama
from modules import config
import json
import os
from datetime import datetime
from modules.FAISSModules import ImageFaissManager,DocumentFaissManager,HistoryFaissManager,AudioFaissManager
from modules.WhisperModules import WhisperNoFFmpeg
from modules.ScheduleModule import ScheduleDBManager

class LLMManager:
    """
    LLMManager handles integration between LLM inference, multimodal file processing,
    and FAISS-based retrieval for contextual augmentation and real-time interaction.

    Attributes:
        llm: The LLM model instance (e.g., LLaMA via llama-cpp).
        embedding_model: Embedding model used by FAISS managers.
        stt_model: Speech-to-text model (e.g., WhisperNoFFmpeg).
        session_id (str): Session identifier used for FAISS indexing.
        temperature (float): Sampling temperature for LLM generation.
        top_k (int): Top-k sampling parameter for LLM.
        top_p (float): Nucleus sampling parameter for LLM.
        current_prompt (str): Stores the most recent prompt for reference.
        latest_file (list): List of recently uploaded files.
        scheduleManager: Manages user's calendar/schedule.
        imageManager, docManager, histManager, audioManager: FAISS index managers.
    """
    def __init__(self,embedding_model,stt_model : WhisperNoFFmpeg ,session_id="General",temperature=0.5,top_k=40,top_p=0.9):
        """
        Initialize the LLMManager with configuration and FAISS managers.
        """
        self.llm = Llama(model_path=config.MODEL_PATH,n_gpu_layers=config.N_GPU_LAYERS,n_ctx=config.TOKEN_LIMIT,chat_format="chatml",verbose=True)
        self.temperature=temperature
        self.top_k=top_k
        self.embedding_model=embedding_model
        self.stt_model=stt_model
        self.top_p=top_p
        self.session_id=session_id
        self.latest_file = []
        self.current_prompt=""
        self.scheduleManager : ScheduleDBManager = None
        self.imageManager : ImageFaissManager = None
        self.docManager : DocumentFaissManager = None
        self.histManager : HistoryFaissManager = None
        self.audioManager : AudioFaissManager = None
        self._load_faiss()

    def _load_faiss(self):
        """
        Load or reinitialize FAISS managers for the current session.
        """
        self.imageManager=ImageFaissManager(embedding_model=self.embedding_model,session_id=self.session_id,index_path="image.index")
        self.docManager=DocumentFaissManager(embedding_model=self.embedding_model,session_id=self.session_id,index_path="doc.index")
        self.audioManager=AudioFaissManager(STT_MODEL=self.stt_model,embedding_model=self.embedding_model,session_id=self.session_id,index_path="audio.index")

    def _update_session(self,session_id):
        """
        Change active session and reload FAISS managers accordingly.
        """
        self.session_id=session_id
        self._load_faiss()

    def _load_schedulemanager(self,userId):
        """
        Initialize the schedule manager using a user ID.
        """
        self.scheduleManager = ScheduleDBManager(userId)
        print(f'Loaded schedule manager : {self.scheduleManager}')

    def import_database(self,binary_data):
        """
        Import schedule database from binary blob.
        """
        self.scheduleManager.import_database(binary_data=binary_data)

    def faiss_trained(self):
        """
        Check if any FAISS manager has a trained index.
        """
        return (
            self.docManager.index.is_trained or
            self.docManager.index.ntotal > 0 or
            self.imageManager.index.is_trained or
            self.imageManager.index.ntotal > 0
        )

    def search_all(self, query: str, latest_upload=None, top_k: int = 5):
        """
        Perform a semantic search across all managers and rank by custom relevancy.

        Args:
            query (str): The query to search for.
            latest_upload (list): Paths of recently uploaded files.
            top_k (int): Number of top results to return.
        """
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
        """
        Delete indexed files by ID and type (document, image, audio).
        """
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
        """
        Process and index uploaded files based on extension.
        """
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
        """
        Generate streaming LLM response with reasoning phase.

        Args:
            user_prompt (list): List of message dicts for chat completion.

        Yields:
            str: JSON-encoded string with generated text chunks.
        """
        prompt_with_reasoning = user_prompt.copy()
        prompt_with_reasoning.append({
            "role": "assistant", 
            "content": "<think>\nLet me think through this step by step:\n"
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
                    # Only yield content after </think>
                    after_thinking = text.split("</think>", 1)
                    if len(after_thinking) > 1:
                        yield json.dumps({'text': after_thinking[1]}) + '\n'
                    continue
                
                if not in_thinking:
                    yield json.dumps({'text': text}) + '\n'
        print("================== EOF Prompt ===================")

    
    def format_metadata(self,metadata):
        """
        Convert metadata into a readable string format for prompting.
        """
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

    

    def format_prompt_schedule(self,user_prompt):
        """
        Format schedule-aware prompt using Markdown and user's events.
        """
        model_path = os.path.basename(config.MODEL_PATH)
        model_name = os.path.splitext(model_path)[0]
        today = datetime.now()
        today_str = today.strftime('%Y-%m-%d')
        def format_events_markdown(events):
            if not events:
                return "No upcoming events."
            lines = ["| Title | Start | End | Description |", "|---|---|---|---|"]
            for e in events:
                lines.append(f"| **{e['title']}** | {e['start']} | {e['end']} | {e['description']} |")
            return "\n".join(lines)
        events = self.scheduleManager.get_upcoming_events(3)
        events_md = format_events_markdown(events)
        prompt = [
            {"role": "system", "content": 
f"""You are {model_name}, a time management assistant helping users optimize their schedules.

Use markdown for formatting:
- **Bold** key points and terms
- Use headings and bullet points
- Use math and tables if needed

Today's date: {today_str}

Here is the user's current schedule:
{events_md}

Your job: Analyze this schedule and respond to the user's time management request clearly and efficiently. Focus only on what the user needs.
"""
}
,{"role": "user", "content": user_prompt}
        ]
        print(prompt)
            
        return prompt

    def format_prompt(self,user_prompt,latest_upload=None,mode="chat"):
        """
        Format prompt for LLM with relevant file context and structured markdown instructions.

        Args:
            user_prompt (str): The user's message.
            latest_upload (list): Recently uploaded files.
            mode (str): Mode of operation ("chat" or "schedule").

        Returns:
            list: Prompt formatted for LLM chat completion.
        """
        if mode == 'schedule':
            return self.format_prompt_schedule(user_prompt)
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
f"""You are {model_name}, a helpful AI assistant. You help users study and work on projects by analyzing their materials and providing clear explanations.

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

    

        