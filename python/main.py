from fastapi.responses import StreamingResponse
from fastapi import FastAPI,UploadFile,File,BackgroundTasks,Request,Form
from modules import config,LLMModules
from modules.EmbeddingModules import EMBEDDING_MODEL,split_text
from modules.WhisperModules import WhisperNoFFmpeg
from modules.FAISSModules import FileData,FileClass
from pydantic import BaseModel
from typing import List
import os
import shutil
import uvicorn
import base64

llm_manager = LLMModules.LLMManager(stt_model=WhisperNoFFmpeg(config.STT_MODEL),embedding_model=EMBEDDING_MODEL)

class FileUploadRequest(BaseModel):
    files:List[FileData]
    IMMEDIATE_PROCESS: bool

app = FastAPI()
UPLOAD_FOLDER =config.UPLOAD_FOLDER
files_memory = []
process_new_file = False

@app.post("/import-db")
async def import_db(userId: str = Form(...), dbFile: UploadFile = File(...)):
    # Save the uploaded file to disk
    binary_data  = await dbFile.read()
    if llm_manager.scheduleManager == None:
        llm_manager._load_schedulemanager(userId)
    llm_manager.import_database(binary_data)
    return {"message": f"DB for user {userId} imported successfully"}

@app.post('/delete-session')
async def delete_session(request : Request):
    session_id = (await request.body()).decode("utf-8").strip()
    path = os.path.join('index',session_id)
    if os.path.exists(path):
        print(f'deleting {path}')
        shutil.rmtree(path)

@app.post("/delete")
async def delete_files(delete : dict):
    print("Deleting File")
    file_id = delete['ids']  
    type = delete['types']   
    llm_manager.delete_files(file_id,type)



@app.post("/upload/")
async def upload_files(request :FileUploadRequest):
    """Handles multiple file uploads and saves them."""
    global process_new_file,files_memory
    files = request.files
    IMMEDIATE_PROCESS = request.IMMEDIATE_PROCESS
    os.makedirs(UPLOAD_FOLDER,exist_ok=True)
    files_memory.clear()
    for file in files:
        file_path = os.path.join(UPLOAD_FOLDER, file.name)
        if isinstance(file.arrayBuffer, str):
           # If it's a base64 string
           try:
                file_content = base64.b64decode(file.arrayBuffer)
           except:
                file_content = file.arrayBuffer.encode('utf-8')
        elif isinstance(file.arrayBuffer, list):
            # If it's an array of byte values (converted from Uint8Array)
            file_content = bytes(file.arrayBuffer)
        else:
           raise ValueError(f"Unsupported arraybuffer format for file {file.name}")
            
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
        files_memory.append(FileClass(id=file.id,path=file_path))
        if not IMMEDIATE_PROCESS:
            process_new_file=True
    if len(files) > 0:
        if IMMEDIATE_PROCESS:
            paths=[]
            paths = [file.path for file in files_memory]
            ids = [file.id for file in files_memory]
            llm_manager.process_file(file_paths=paths,file_ids=ids)
            files_memory=[]
            if os.path.isdir(UPLOAD_FOLDER):
                shutil.rmtree(UPLOAD_FOLDER)
            process_new_file=False
    return {"message": f"{len(files)} files uploaded successfully"}

@app.post("/generate")
async def generate(prompt: dict):
    global process_new_file,files_memory
    if not llm_manager:
        print('Session not loaded')
        return {"error": "Session not loaded"}
    user_prompt = prompt["prompt"]
    mode = prompt["mode"]
    print(mode)
    paths = []
    if process_new_file:
        paths = [file.path for file in files_memory]
        ids = [file.id for file in files_memory]
        llm_manager.process_file(file_paths=paths,file_ids=ids)
        process_new_file=False
    formatted_prompt = llm_manager.format_prompt(user_prompt,paths,mode=mode)
    files_memory=[]
    if os.path.isdir(UPLOAD_FOLDER):
        shutil.rmtree(UPLOAD_FOLDER)

    return StreamingResponse(llm_manager.stream_generator(formatted_prompt), media_type="text/event-stream")

@app.post("/loadSession")
async def load_session(request : Request):
    global llm_manager,UPLOAD_FOLDER
    session_id = (await request.body()).decode("utf-8").strip()
    normalized_path = os.path.normpath(session_id)


    print(f'session id : {normalized_path}')
    if normalized_path.endswith(os.path.join('', 'schedule')):
        user_id = os.path.dirname(normalized_path)
        llm_manager._load_schedulemanager(user_id)
    else:
        llm_manager._update_session(session_id)
        UPLOAD_FOLDER = os.path.join('index',session_id,'upload')

    return {"message": "Session loaded successfully"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app,host="0.0.0.0",port=8000)