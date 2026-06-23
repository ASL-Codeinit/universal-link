# Backend: ASL LSTM Prediction API

FastAPI server for real-time ASL sign prediction using LSTM and grammar correction via Groq LLM.

## Quick Start

**1. Install dependencies**
```bash
pip install -r requirements.txt
```

**2. Add `.env` file**
```
GROQ_API_KEY=your_api_key_from_console.groq.com
```

**3. Run server**
```bash
uvicorn api:app --host 0.0.0.0 --port 8000
```

API ready at `http://localhost:8000`

---

## Core Endpoints

### `POST /predict`
Send hand landmarks for sign detection.

**Request:**
```json
{
  "landmarks": [0.5, 0.3, ..., 0.7],  // 136 floats
  "handedness": ["Left"],
  "session_id": "room-123"
}
```

**Response:**
```json
{
  "sign": "HELLO",
  "confidence": 0.92,
  "buffering": false
}
```

Buffers 20 frames → runs LSTM → returns sign + confidence.

### `POST /reset-buffer`
Clear session buffer when hands disappear.

```json
{ "session_id": "room-123" }
```

### `POST /fix-grammar`
Convert signs to English sentence.

**Request:**
```json
{ "words": ["HELLO", "MY", "NAME"] }
```

**Response:**
```json
{ "sentence": "Hello, my name is..." }
```

### `GET /health`
Check model & backend status.

---

## How It Works

1. Frontend extracts 136 hand landmarks from MediaPipe
2. Sends to `/predict` with `session_id` (room ID)
3. Backend buffers 20 frames per session
4. LSTM runs → returns sign + confidence
5. Frontend displays result
6. Call `/reset-buffer` when no hands detected

---

## Model Details

- **Input:** 20 frames × 136 features (hand + pose landmarks)
- **LSTM:** 2 layers, 128 units, 0.3 dropout
- **Output:** Sign class + confidence (0.0–1.0)
- **Trained on:** ASL gesture sequences

---

## Files

```
backend/
├── api.py              # FastAPI server
├── lstm_model.pt       # Trained LSTM model
├── requirements.txt    # Dependencies
└── README.md           # This file
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Model won't load | Check `lstm_model.pt` exists, `torch` installed |
| "Data length invalid" | Frontend not extracting 136 landmarks correctly |
| Grammar returns empty | Verify `GROQ_API_KEY` in `.env` |
| "ML: error" in frontend | Backend not running on `localhost:8000` |
| Predictions stuck on "..." | Wait for 20 frames to buffer, check MediaPipe detection |

---


See main [README.md](../README.md) for full project context.
