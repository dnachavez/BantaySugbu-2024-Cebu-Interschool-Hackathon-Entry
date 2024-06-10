import torch
from transformers import AutoProcessor, AutoModelForImageClassification
import numpy as np
from collections import deque
from flask import Flask, render_template, request, jsonify
import json
import os
from datetime import datetime, timedelta
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

MODEL_PATH = "./"
processor = AutoProcessor.from_pretrained(MODEL_PATH)
model = AutoModelForImageClassification.from_pretrained(MODEL_PATH)

app = Flask(__name__)

frame_buffer = deque(maxlen=5)
current_label = ""

def process_frame(frame):
    inputs = processor(images=frame, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    scores = outputs.logits.softmax(dim=1)[0]
    labels = model.config.id2label
    max_score, max_index = torch.max(scores, dim=0)
    label = labels[max_index.item()]
    score = max_score.item() * 100
    return label, score

def get_smoothed_predictions(buffer):
    aggregated_scores = {}
    for label, score in buffer:
        if label not in aggregated_scores:
            aggregated_scores[label] = []
        aggregated_scores[label].append(score)
    averaged_scores = {label: np.mean(scores) for label, scores in aggregated_scores.items()}
    max_label = max(averaged_scores, key=averaged_scores.get)
    max_score = averaged_scores[max_label]
    return max_label, max_score

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed', methods=['POST'])
def video_feed():
    global current_label
    frame = Image.open(request.files['frame'])
    frame_resized = frame.resize((224, 224))
    label, score = process_frame(frame_resized)
    frame_buffer.append((label, score))
    smoothed_label, smoothed_score = get_smoothed_predictions(frame_buffer)
    current_label = smoothed_label
    return jsonify({"label": current_label})

@app.route('/save_notification', methods=['POST'])
def save_notification():
    data = request.json
    if not os.path.exists('history.json'):
        history = []
    else:
        with open('history.json', 'r') as f:
            history = json.load(f)
    
    time_threshold = timedelta(minutes=15)
    current_time = datetime.strptime(data['timestamp'], "%Y-%m-%d %H:%M:%S")
    
    for entry in history:
        entry_time = datetime.strptime(entry['timestamp'], "%Y-%m-%d %H:%M:%S")
        if entry['address'] == data['address'] and abs((current_time - entry_time)) < time_threshold:
            if entry['label'] == data['label']:
                return jsonify({"status": "duplicate"}), 200

    history.append({
        "id": str(len(history) + 1),
        "label": data['label'],
        "address": data['address'],
        "timestamp": data['timestamp']
    })

    with open('history.json', 'w') as f:
        json.dump(history, f, indent=4)

    return jsonify({"status": "success"}), 200

@app.route('/get_current_label', methods=['GET'])
def get_current_label():
    global current_label
    return jsonify({"label": current_label})

@app.route('/get_history', methods=['GET'])
def get_history():
    if not os.path.exists('history.json'):
        return jsonify([])

    with open('history.json', 'r') as f:
        history = json.load(f)
    
    for entry in history:
        try:
            entry['timestamp'] = datetime.strptime(entry['timestamp'], "%Y-%m-%d %H:%M:%S").strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    
    history.sort(key=lambda x: datetime.strptime(x['timestamp'], "%Y-%m-%d %H:%M:%S"), reverse=True)
    
    return jsonify(history)

@app.route('/get_google_maps_api_key', methods=['GET'])
def get_google_maps_api_key():
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    return jsonify({"api_key": api_key})

if __name__ == "__main__":
    app.run(debug=True)
