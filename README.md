# Universal Link

Universal Link is a real-time sign language video call platform built to translate ASL gestures into live text and structured sentences. It combines a Python-powered LSTM inference backend, a Node.js WebRTC frontend, and grammar correction via Groq LLM.

---

## What this repository contains

- **Realtime ASL recognition** from live camera input
- **WebRTC video calling** with remote subtitle relay
- **Sentence builder** for instant detected word display
- **Grammar correction** via LLM-assisted sentence refinement
- **Training pipeline** for gesture sequence dataset creation and model training

---

## Technical highlights

- Python backend using **FastAPI**, **PyTorch**, and **Groq** for smart grammar correction
- Frontend built with **Socket.IO**, **Express**, and browser-based **MediaPipe Hands**
- Rolling sequence buffer architecture for **LSTM-based gesture prediction**
- Session-isolated prediction buffers to support multiple simultaneous users
- Clean UI with a professional muted grey/green theme and live transcript panel

---

## Repository structure

- `backend/`
  - `api.py` — main FastAPI backend serving `/predict`, `/reset-buffer`, `/health`, and `/fix-grammar`
  - loads `training/lstm_model.pt` and performs sequence-based ASL inference
- `frontend/`
  - `server.js` — Express + Socket.IO hub for video call signaling
  - `pages/` — `lobby.html` and `call.html` user interfaces
  - `js/` — client logic for camera processing, API requests, and subtitle display
  - `css/` — styling for lobby and call screens
- `training/`
  - model training and dataset scripts
  - `guide/` — documentation for data collection, dataset generation, training, and testing
- `requirements.txt` — Python runtime dependencies for the backend
- `training/requirements-training.txt` — training-specific dependencies

For guidance on each part of the repo, see `training/guide/` and `backend/README.md`.

---

## How the pieces fit together

1. **Frontend lobby** creates a room and joins a video call.
2. **Local camera frames** are processed in the browser with MediaPipe Hands.
3. **Landmark feature vectors** are sent to the backend `/predict` endpoint.
4. **Backend LSTM** consumes a sliding window of landmark frames and returns a sign prediction.
5. The frontend displays detected words instantly in the sentence builder and relays them over Socket.IO.
6. Pressing full stop sends the collected sign sentence to the `/fix-grammar` endpoint for LLM-based correction.

---

## Installation and setup

### Prerequisites

- Python 3.9 or newer
- Node.js 16+ and npm
- `GROQ_API_KEY` environment variable for LLM grammar correction

### 1. Install backend dependencies

```bash
cd /home/rejafairooz/universal-link
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

If you need training dependencies as well:

```bash
cd training
python3 -m venv venv_training
source venv_training/bin/activate
pip install -r requirements-training.txt
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Configure the backend API key

Set the Groq key in your shell or in a `.env` file:

```bash
export GROQ_API_KEY="your_api_key_here"
```

### 4. Start the backend API

From the repo root:

```bash
source venv/bin/activate
cd backend
python -m uvicorn api:app --reload --host 0.0.0.0 --port 5000
```

> Note: the frontend currently uses port `5000` by default. If you run the backend on another port, update `frontend/js/script.js` and `API_CONFIG.LOCAL_API` accordingly.

### 5. Start the frontend app

```bash
cd frontend
npm start
```

Then open `http://localhost:3000` in your browser.

---

## Recommended development workflow

- Run the backend API first
- Run the frontend server second
- Open the lobby page and join a room
- Test live signing with the local sentence builder visible
- Use the training guides in `training/guide/` if you want to extend the model or collect new data

---

## Notes

- `frontend/server.js` is the signaling server for WebRTC and socket communication
- `backend/api.py` is the inference server for ASL prediction and grammar correction
- `training/guide/` contains step-by-step instructions for data collection, dataset generation, LSTM training, and testing

