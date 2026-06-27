from fastapi import FastAPI
from groq import Groq
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import torch.nn as nn
import numpy as np
import os
from collections import deque
from dotenv import load_dotenv
from typing import Optional

load_dotenv()
app = FastAPI()

groq_api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=groq_api_key)

BACKEND_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BACKEND_DIR, "lstm_model.pt")

# ── Settings — must match training ─────────────────────────────
SEQUENCE_LENGTH = 20
FEATURES_PER_FRAME = 136
CONFIDENCE_THRESHOLD = 0.75

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request schemas ──────────────────────────────────────────────
class LandmarkRequest(BaseModel):
    landmarks: list[float]
    handedness: list[str]
    session_id: str = "default"   # per-session buffer key — pass roomId from frontend
    timestamp: Optional[int] = None

class GrammarRequest(BaseModel):
    words: list[str]

class ResetRequest(BaseModel):
    session_id: str = "default"

# ── LSTM model definition (must match training exactly) ─────────
class ASLModel(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, num_classes):
        super(ASLModel, self).__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.3
        )
        self.fc = nn.Linear(hidden_size, num_classes)

    def forward(self, x):
        out, _ = self.lstm(x)
        out = out[:, -1, :]   # take last timestep's output
        out = self.fc(out)
        return out

# ── Load LSTM model ───────────────────────────────────────────────
print(f"Loading LSTM model from: {MODEL_PATH}")
try:
    checkpoint = torch.load(MODEL_PATH, map_location='cpu', weights_only=False)
    model = ASLModel(
        checkpoint['input_size'],
        checkpoint['hidden_size'],
        checkpoint['num_layers'],
        checkpoint['num_classes']
    )
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()
    classes = checkpoint['classes']
    print(f"✅ LSTM model loaded successfully!")
    print(f"Classes ({len(classes)}): {classes}")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    model = None
    classes = []

# ── Per-session rolling window buffers ──────────────────────────
# Each session_id (use roomId from frontend) gets its own buffer,
# so two people signing simultaneously don't pollute each other's
# sequences. Buffers are created lazily on first use.
session_buffers: dict[str, deque] = {}

def get_buffer(session_id: str) -> deque:
    if session_id not in session_buffers:
        session_buffers[session_id] = deque(maxlen=SEQUENCE_LENGTH)
    return session_buffers[session_id]


@app.get("/")
def home():
    return {
        "status": "ASL LSTM API is running!",
        "endpoints": {
            "/predict": "POST - Send one frame's landmarks for ASL prediction",
            "/health": "GET - Check API health",
            "/reset-buffer": "POST - Clear a session's rolling window (call when hands disappear)"
        }
    }


@app.post("/predict")
def predict(data: LandmarkRequest):
    if model is None:
        return {"error": "Model not loaded"}

    landmarks = data.landmarks

    if len(landmarks) != FEATURES_PER_FRAME:
        return {"error": f"Data length {len(landmarks)} is invalid. Need {FEATURES_PER_FRAME}."}

    buffer = get_buffer(data.session_id)
    buffer.append(landmarks)

    print(data.session_id)
    print(
    f"Session={data.session_id} | Buffer={len(buffer)}/{SEQUENCE_LENGTH}")

    # not enough frames yet — still buffering
    if len(buffer) < SEQUENCE_LENGTH:
        print("Buffering...")
        return {
            "sign": "...",
            "confidence": 0.0,
            "handedness": data.handedness,
            "buffering": True,
            "buffer_size": len(buffer)
        }

    # window full — run LSTM inference
    try:
        input_data = np.array(buffer, dtype=np.float32).reshape(
            1, SEQUENCE_LENGTH, FEATURES_PER_FRAME
        )
        with torch.no_grad():
            output = model(torch.from_numpy(input_data))
            probs = torch.softmax(output, dim=1)
            confidence, predicted = torch.max(probs, dim=1)
            confidence = float(confidence.item())
            sign = classes[predicted.item()]
            print(
    f"Prediction: {sign} | Confidence: {confidence:.3f}"
            )

        return {
            "sign": sign,
            "confidence": confidence,
            "handedness": data.handedness,
            "buffering": False
        }
    except Exception as e:
        return {"error": f"Prediction failed: {str(e)}"}


@app.post("/reset-buffer")
def reset_buffer(data: ResetRequest):
    """Call this when no hands are detected, to avoid splicing
    unrelated gesture fragments into one sequence."""
    print("BUFFER CLEARED")
    if data.session_id in session_buffers:
        session_buffers[data.session_id].clear()
    return {"status": "buffer cleared", "session_id": data.session_id}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model": "LSTM",
        "classes": len(classes),
        "active_sessions": len(session_buffers),
        "model_loaded": model is not None
    }

@app.post("/fix-grammar")
async def fix_grammar(data: GrammarRequest):
    if not data.words:
        return {"sentence": ""}

    raw_text = " ".join(data.words)
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional Sign Language interpreter. Convert the following list of signs into a single, natural, and grammatically correct English sentence. Do not add extra commentary, only return the sentence."
                },
                {
                    "role": "user",
                    "content": f"Signs: {raw_text}"
                }
            ],
            model="llama-3.3-70b-versatile",
        )
        corrected_sentence = chat_completion.choices[0].message.content
        return {"sentence": corrected_sentence.strip()}
    except Exception as e:
        return {"error": str(e), "fallback": raw_text}