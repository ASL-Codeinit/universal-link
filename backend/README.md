# Backend: ASL LSTM Prediction API

FastAPI server for real-time ASL sign prediction using a per-session LSTM rolling-window pipeline, plus grammar correction via Groq's `llama-3.3-70b-versatile`.

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

API ready at `http://localhost:8000`. CORS is currently open to all origins (`allow_origins=["*"]`).

---

## Core Endpoints

### `POST /predict`

Send one frame's hand landmarks for sign detection. Frames are buffered per `session_id` until a full sequence is collected, then the LSTM runs inference.

**Request:**
```json
{
  "landmarks": [0.5, 0.3, "... 136 floats total"],
  "handedness": ["Left"],
  "session_id": "room-123",
  "timestamp": 1719760000000
}
```
- `landmarks` must contain exactly **136** floats per frame, or the endpoint returns `{"error": "Data length <n> is invalid. Need 136."}`.
- `session_id` defaults to `"default"` if omitted — pass the room/call ID from the frontend so concurrent signers don't share a buffer.
- `timestamp` is optional and currently accepted but not used by the backend.

**Response while buffering (fewer than 20 frames collected):**
```json
{
  "sign": "...",
  "confidence": 0.0,
  "handedness": ["Left"],
  "buffering": true,
  "buffer_size": 7
}
```

**Response once the window is full (20 frames):**
```json
{
  "sign": "HELLO",
  "confidence": 0.92,
  "handedness": ["Left"],
  "buffering": false
}
```

**Important behavior notes:**
- If `model` failed to load at startup, every call returns `{"error": "Model not loaded"}`.
- If more than **1 second** (`GESTURE_TIMEOUT`) elapses between consecutive frames for a given `session_id`, the buffer is automatically cleared before the new frame is added — this starts a fresh gesture rather than splicing unrelated motion together.
- A `CONFIDENCE_THRESHOLD` constant (0.75) is defined in the code but is **not currently enforced** — the endpoint always returns the top predicted class and its raw softmax confidence, regardless of how low it is. Filtering low-confidence predictions is left to the frontend.
- Inference failures (e.g. shape mismatches) are caught and returned as `{"error": "Prediction failed: <message>"}`.

### `POST /reset-buffer`

Clears a session's rolling window. Call this when hand tracking is lost, to avoid splicing unrelated gesture fragments into one sequence.

**Request:**
```json
{ "session_id": "room-123" }
```

**Response:**
```json
{ "status": "buffer cleared", "session_id": "room-123" }
```
Safe to call even if the session has no existing buffer yet (defaults to `"default"` if omitted).

### `POST /fix-grammar`

Converts an ordered list of recognized signs into a natural English sentence using Groq (`llama-3.3-70b-versatile`).

**Request:**
```json
{ "words": ["HELLO", "MY", "NAME"] }
```

**Response (success):**
```json
{ "sentence": "Hello, my name is..." }
```

**Response (empty input):**
```json
{ "sentence": "" }
```

**Response (Groq call fails):**
```json
{ "error": "<exception message>", "fallback": "HELLO MY NAME" }
```

### `GET /health`

Returns model and session status.
```json
{
  "status": "healthy",
  "model": "LSTM",
  "classes": 26,
  "active_sessions": 3,
  "model_loaded": true
}
```

### `GET /`

Basic liveness/info endpoint listing available routes.

---

## How It Works

1. Frontend extracts 136 hand/pose landmark features per frame (e.g. via MediaPipe).
2. Each frame is POSTed to `/predict` with a `session_id` identifying the signer/room.
3. The backend maintains a separate `deque(maxlen=20)` buffer per `session_id` (created lazily on first request, stored in-memory — buffers are lost on server restart).
4. If a session goes idle for more than 1 second, its buffer auto-resets on the next frame.
5. Once 20 frames are buffered, they're stacked into a `(1, 20, 136)` tensor and passed through the LSTM model; softmax confidence and the argmax class are returned.
6. Frontend displays the result and accumulates recognized signs.
7. Frontend calls `/reset-buffer` when hand detection is lost, and can call `/fix-grammar` with the accumulated word list to get a clean sentence.

---

## Model Details

- **Architecture:** single-layer `nn.LSTM` stack (`num_layers` from checkpoint) followed by a linear classification head (`nn.Linear`) applied to the final timestep's hidden state. Dropout of 0.3 is configured on the LSTM (only active during training).
- **Input shape:** `(batch=1, sequence_length=20, features=136)`.
- **Architecture hyperparameters** (`input_size`, `hidden_size`, `num_layers`, `num_classes`) and the `classes` label list are all loaded from the `lstm_model.pt` checkpoint at startup, not hardcoded — check the checkpoint or startup logs for actual values.
- **Output:** predicted class label (string) + softmax confidence (float, 0.0–1.0). No confidence threshold is currently applied server-side.
- Model file expected at `backend/lstm_model.pt`, loaded via `torch.load(..., weights_only=False)`.

---

## Files

```
backend/
├── api.py              # FastAPI server (predict, reset-buffer, fix-grammar, health)
├── lstm_model.pt        # Trained LSTM checkpoint (weights + config + class labels)
├── requirements.txt     # Dependencies
├── .env                 # GROQ_API_KEY (not committed)
└── README.md             # This file
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Model won't load / `model_loaded: false` | Check `lstm_model.pt` exists at `backend/`, `torch` is installed, and the checkpoint keys match (`input_size`, `hidden_size`, `num_layers`, `num_classes`, `model_state_dict`, `classes`) |
| `"Data length <n> is invalid. Need 136."` | Frontend isn't extracting exactly 136 landmark floats per frame |
| `buffering: true` never resolves | Frames aren't arriving at least once per second for that `session_id` — buffer keeps resetting on timeout before reaching 20 frames |
| Predictions feel "sticky" or wrong after switching gestures | Make sure the frontend calls `/reset-buffer` (or pauses >1s) between distinct gestures |
| Grammar endpoint returns `error`/`fallback` | Verify `GROQ_API_KEY` in `.env` and that the Groq account has access to `llama-3.3-70b-versatile` |
| Two users' predictions mixing together | Confirm each client sends a unique, stable `session_id` (e.g. room ID), not the default `"default"` |
| "ML: error" in frontend | Backend not reachable at `localhost:8000`, or CORS misconfigured |

---

See main [README.md](../README.md) for full project context.