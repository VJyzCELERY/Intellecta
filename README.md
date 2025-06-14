# Intellecta

Intellecta is a time management application with the ability to run a local LLM developed with Node js and python.

---

Requirements
```
Node.js
npm
Anaconda
```

## Project Structure
```
Intellecta/
├── app/ # Frontend (Node.js)
│ ├── package.json
│ ├── public/
│ └── src/
└── python/ # Backend (Python, Anaconda)
├── environment.yml
└── *.py
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
```
cd python
conda env create -f environment.yml
conda activate IntellPython
python main.py
```
