# Intellecta

Intellecta is a time management application with the ability to run a local LLM developed with Node js and python. The app is primarily developed with only reasoning model in mind.

---

Requirements
```
Node.js
npm
Anaconda
```

---

## Getting Started

### app setup

Navigate to the `app/` directory and run:

```
cd app
npm install
npm start
```

### Python setup
Navigate to the `python/` directory and run :
```
cd python
conda env create -f environment.yml
conda activate IntellPython
python main.py
```

---
### LLM Model

The python uses `Llama.cpp` to run the model so only use model with `.gguf` extension. To load a model, in the folder adjacent to the `main.py` create a `models` folder and place the `.gguf` model in that folder.
During the first launch the python server will create a `config.json` where you can adjust the file name of the model accordingly in that file later.
```
Intellecta/
├── app/
│ ├── . . .
└── python/
| ├── models/
| | └── DeepseekR1.gguf
| ├── environment.yml
| ├── config.json
| └── main.py
```
The model used during development is taken from [Hugging Face](https://huggingface.co/DevQuasar/deepseek-ai.DeepSeek-R1-Distill-Qwen-7B-GGUF)
