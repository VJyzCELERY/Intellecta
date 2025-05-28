import torch
import faiss
import os
import json
import cv2
import numpy as np
from paddleocr import PaddleOCR
from ultralytics import YOLO
from langchain_huggingface import HuggingFaceEmbeddings

OCR = PaddleOCR(use_angle_cls=True, lang="en")
Yolo = YOLO("yolov8n.pt")

def extract_text_from_image(path : str):
    # img = cv2.imread(path)
    results = OCR.ocr(img=path)
    extracted_text=" ".join([line[1][0] for result in results for line in result])
    return extracted_text.strip()

def extract_object_from_image(path : str):
    results = Yolo(path)
    objects = [r.names[int(d.cls)] for r in results for d in r.boxes]
    return list(set(objects))  