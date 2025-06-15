from paddleocr import PaddleOCR
from ultralytics import YOLO

OCR = PaddleOCR(use_angle_cls=True, lang="en")
Yolo = YOLO("yolov8n.pt")

def extract_text_from_image(path : str):
    """
    Extracts visible text from an image using PaddleOCR.

    Args:
        path (str): Path to the image file.

    Returns:
        str: Concatenated string of all recognized text in the image.
    """
    # img = cv2.imread(path)
    results = OCR.ocr(img=path)
    extracted_text=" ".join([line[1][0] for result in results for line in result])
    return extracted_text.strip()

def extract_object_from_image(path : str):
    """
    Detects objects in an image using the YOLOv8 model.

    Args:
        path (str): Path to the image file.

    Returns:
        list: Unique list of detected object class names.
    """
    results = Yolo(path)
    objects = [r.names[int(d.cls)] for r in results for d in r.boxes]
    return list(set(objects))  