from fastapi import FastAPI
from groq import Groq
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
import os
from dotenv import load_dotenv
from typing import Optional

load_dotenv()
app = FastAPI()
groq_api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=groq_api_key)

BACKEND_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BACKEND_DIR, "asl_model.pkl")

class GrammarRequest(BaseModel):
    words: list[str]

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request body schema
class LandmarkRequest(BaseModel):
    landmarks: list[float]
    handedness: list[str]
    timestamp: Optional[int] = None

# Request grammar Schema
class GrammarRequest(BaseModel):
    words: list[str]

print(f"Loading ML model from: {MODEL_PATH}")
try:
    model = joblib.load(MODEL_PATH)
    print("✅ Model loaded successfully!")
    print("Expected features:", model.n_features_in_)
except Exception as e:
    print(f"❌ Error loading model: {e}")
    model = None


@app.get("/")
def home():
    return {
        "status": "ASL API is running!",
        "endpoints": {
            "/predict": "POST - Send landmarks for ASL prediction",
            "/health": "GET - Check API health"
        }
    }


@app.post("/predict")
def predict(data: LandmarkRequest):
    if model is None:
        return {"error": "Model not loaded"}

    landmarks = data.landmarks
    handedness = data.handedness

    # --- THE FIX: FORCED PADDING ---
    if len(landmarks) == 136:
        # User is showing two hands. Data is already full.
        input_data = landmarks
    elif len(landmarks) == 68:
        # Pad missing second hand
        input_data = landmarks + [0.0] * 68

    else:
        # Safeguard against corrupted data packets
        return {"error": f"Data length {len(landmarks)} is invalid. Need 63 or 126."}

    # Convert to numpy and reshape for a single prediction
    landmarks_array = np.array(input_data).reshape(1, -1)

    try:
        # Predict the class (e.g., 'A', 'B', 'Hello')
        prediction = model.predict(landmarks_array)[0]
        
        # Get the probability to show how sure the model is
        probabilities = model.predict_proba(landmarks_array)
        confidence = float(np.max(probabilities))

        return {
            "sign": str(prediction),
            "confidence": confidence,
            "handedness": handedness,
            "input_size": len(input_data) # Useful for debugging
        }
    except Exception as e:
        return {"error": f"Prediction failed: {str(e)}"}

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": model is not None
    }

@app.post("/fix-grammar")
async def fix_grammar(data: GrammarRequest):
    if not data.words:
        return {"sentence": ""}
    
    raw_text = " ".join(data.words)
    
    try:
        # Llama 3.3 70B is incredibly fast on Groq
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
        
        # Extract the text response
        corrected_sentence = chat_completion.choices[0].message.content
        return {"sentence": corrected_sentence.strip()}

    except Exception as e:
        return {"error": str(e), "fallback": raw_text}