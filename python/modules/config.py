import os
import json

DEFAULT_CONFIG = {
    "CONTEXT_LIMIT":8192,
    "TOKEN_LIMIT":8192,
    "CHUNK_SIZE":512,
    "MODEL_PATH":"./models/DeepseekR1.gguf",
    "INDEX_BASE_FOLDER":"./index",
    "SCHEDULE_BASE_FOLDER":"./schedules",
    "FAISS_DIM":384,
    "FAISS_NLIST":100,
    "N_GPU_LAYERS":0,
    "UPLOAD_FOLDER":"./temp",
    "STT_MODEL":"tiny"
    
}

CONFIG_FILE = "config.json"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        print("Config file not found, creating one with default values.")
        with open(CONFIG_FILE, "w") as f:
            json.dump(DEFAULT_CONFIG, f, indent=4)
        return DEFAULT_CONFIG 

    with open(CONFIG_FILE, "r") as f:
        config = json.load(f)

    updated = False
    for key, default_value in DEFAULT_CONFIG.items():
        if key not in config:
            print(f"Adding missing config key: {key} (default: {default_value})")
            config[key] = default_value
            updated = True

    if updated:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=4)

    return config

CONFIG = load_config()

os.makedirs(CONFIG["UPLOAD_FOLDER"], exist_ok=True)
os.makedirs(CONFIG["INDEX_BASE_FOLDER"], exist_ok=True)

CONTEXT_LIMIT = CONFIG["CONTEXT_LIMIT"]
TOKEN_LIMIT = CONFIG["TOKEN_LIMIT"]
CHUNK_SIZE = CONFIG["CHUNK_SIZE"]
MODEL_PATH = CONFIG["MODEL_PATH"]
INDEX_BASE_FOLDER = CONFIG["INDEX_BASE_FOLDER"]
SCHEDULE_BASE_FOLDER = CONFIG["SCHEDULE_BASE_FOLDER"]
FAISS_DIM = CONFIG["FAISS_DIM"]
FAISS_NLIST = CONFIG["FAISS_NLIST"]
N_GPU_LAYERS = CONFIG["N_GPU_LAYERS"]
UPLOAD_FOLDER = CONFIG["UPLOAD_FOLDER"]
STT_MODEL = CONFIG["STT_MODEL"]