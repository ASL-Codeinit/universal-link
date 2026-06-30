# SignLink

SignLink is a real-time sign language video call platform that translates American Sign Language (ASL) gestures into live text and grammatically refined sentences. The system combines browser-based hand tracking with a temporal LSTM gesture recognition model, real-time WebRTC communication, and AI-powered grammar correction.

The application is built as a full-stack system consisting of a FastAPI inference backend, a Node.js + Socket.IO signaling server, and a browser frontend using MediaPipe Hands. The entire application is containerized with Docker and deployed on Microsoft Azure Container Apps.

---

## What this repository contains

- **Realtime ASL recognition** from live camera input
- **WebRTC video calling** with remote subtitle relay
- **Sentence builder** for instant detected word display
- **Grammar correction** via LLM-assisted sentence refinement
- **Training pipeline** for gesture sequence dataset creation and model training

---

## Technical highlights

* Real-time WebRTC video communication with Socket.IO signaling
* Browser-based hand tracking using MediaPipe Hands
* Temporal LSTM gesture recognition using rolling 20-frame landmark sequences
* FastAPI inference backend built with PyTorch
* Server-side confidence filtering (`CONFIDENCE_THRESHOLD`) so low-confidence frames never reach the frontend
* Client-side prediction smoothing — a rolling 5-frame majority vote stabilizes signs before they're added to a sentence
* Groq-powered grammar correction for detected sign sequences
* Session-isolated prediction buffers supporting multiple simultaneous conversations
* Single shared `ML_BACKEND_PORT` setting so the local backend port only has to be changed in one place
* Dockerized frontend and backend
* Cloud deployment on Microsoft Azure Container Apps
* Azure Container Registry (ACR) for container image management

## System Architecture

```text
Camera
   │
   ▼
MediaPipe Hands
   │
   ▼
Feature Extraction (136 features/frame)
   │
   ▼
FastAPI Backend
   │
Rolling 20-frame Buffer (per session_id)
   │
   ▼
LSTM Model (PyTorch)
   │
   ▼
Confidence Filter (server-side)
   │
   ▼
Predicted Sign
   │
   ├────────► Live subtitles
   │
   ▼
Majority-Vote Smoothing (client-side, 5-frame history)
   │
   ▼
Sentence Builder
   │
   ▼
Groq Grammar Correction
   │
   ▼
Final Sentence
```

---

## Repository structure

- `backend/`
  - `api.py` — main FastAPI backend serving `/predict`, `/reset-buffer`, `/health`, and `/fix-grammar`
  - loads `lstm_model.pt` and performs sequence-based ASL inference, with per-session rolling buffers and server-side confidence filtering
- `frontend/`
  - `server.js` — Express + Socket.IO hub for video call signaling; also serves `/config.js` so the browser can read shared `.env` values like `ML_BACKEND_PORT`
  - `pages/` — `lobby.html`, `setup.html`, `call.html`, and `call-ended.html` user interfaces
  - `js/` — client logic for camera processing, API requests, prediction smoothing, and subtitle display
  - `css/` — styling for lobby, setup, call, and call-ended screens
- `training/`
  - model training and dataset scripts
  - `guide/` — documentation for data collection, dataset generation, training, and testing
- `requirements.txt` — Python runtime dependencies for the backend
- `training/requirements-training.txt` — training-specific dependencies

For guidance on each part of the repo, see `training/guide/`, `backend/README.md`, and `frontend/README.md`.

---

## How the pieces fit together

1. **Frontend lobby** (`/`) creates a room and the user picks a mode (`signer`/`speaker`).
2. **Setup page** (`/setup`) confirms camera/mic access before joining.
3. **Local camera frames** are processed in the browser with MediaPipe Hands on the call page (`/video?room=ROOM_ID`).
4. **Landmark feature vectors** (136 per frame) are sent to the backend `/predict` endpoint, tagged with the room's `session_id` so concurrent calls never share a buffer.
5. **Backend LSTM** consumes a sliding 20-frame window of landmark frames and returns a sign prediction, filtered against `CONFIDENCE_THRESHOLD` so low-confidence guesses never reach the client.
6. The frontend runs its own 5-frame majority-vote smoothing on top of that, displays the stabilized word instantly in the sentence builder, and relays it over Socket.IO.
7. Pressing full stop (`.`) sends the collected sign sentence to the `/fix-grammar` endpoint for LLM-based correction.
8. Ending the call (`/call-ended`) shows the session duration and transcript, pulled from `sessionStorage`.

---

## Installation and setup

### Prerequisites

- Python 3.9 or newer
- Node.js 16+ and npm
- A Groq API key for LLM grammar correction

### 1. Configure environment variables

Both the backend and frontend read from a shared `.env` file so the local backend port only needs to be set once. Create `.env` (at the project root, or duplicated into `backend/.env` and `frontend/.env` depending on your setup) with:

```
GROQ_API_KEY=your_api_key_here
ML_BACKEND_PORT=8000
```

`api.py` binds to `ML_BACKEND_PORT` on startup, and `server.js` reads the same value and exposes it to the browser via `/config.js`, so `frontend/js/script.js` always knows the correct local backend URL without hardcoding it. If you change the port, this is the only line you need to edit.

### 2. Install backend dependencies

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
This includes `python-dotenv`, used to load `GROQ_API_KEY` and `ML_BACKEND_PORT` from `.env`.

If you need training dependencies as well:

```bash
cd training
python3 -m venv venv_training
source venv_training/bin/activate
pip install -r requirements-training.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```
This includes the Node `dotenv` package, used by `server.js` to read the same `.env` file as the backend.

### 4. Start the backend API

```bash
# Local development (auto-restarts on code changes)
uvicorn api:app --reload --host 0.0.0.0 --port $ML_BACKEND_PORT

# Or, if api.py reads ML_BACKEND_PORT itself:
python api.py
```

You shouldn't need to touch `frontend/js/script.js` directly to change the port — update `ML_BACKEND_PORT` in `.env` instead, and both the backend and the frontend's `/config.js` injection will pick it up.

In production, the frontend automatically detects the environment (via hostname) and communicates with the deployed Azure backend instead of the local one.

### 5. Start the frontend app

```bash
cd frontend
npm start
```

Then open `http://localhost:3000` in your browser.

---

## Docker Deployment

Both frontend and backend are fully containerized.

Build and start the application locally:

```bash
docker compose up --build
```

The application will be available at:

* Frontend: `http://localhost:3000`
* Backend: `http://localhost:8000` (or your configured `ML_BACKEND_PORT`)

The same Docker images are deployed to Microsoft Azure Container Apps through Azure Container Registry.

## Cloud Deployment

The production deployment uses:

* Microsoft Azure Container Apps
* Azure Container Registry (ACR)
* Docker
* FastAPI
* Node.js
* Azure Container App Secrets for secure `GROQ_API_KEY` management

Both frontend and backend are deployed independently, allowing each service to be updated without affecting the other.

```
Azure Container App
│
├── universal-link-frontend
│      │
│      ├── HTML
│      ├── CSS
│      ├── JS
│      ├── Socket.IO
│      └── WebRTC
│
└── universal-link-backend
       │
       ├── FastAPI
       ├── PyTorch
       ├── LSTM
       ├── Groq
       └── Prediction API
```

## Recommended development workflow

- Run the backend API first
- Run the frontend server second
- Open the lobby page and join a room
- Test live signing with the local sentence builder visible
- Use the training guides in `training/guide/` if you want to extend the model or collect new data

---

## Recent Improvements

### Deployment

* Dockerized both the FastAPI backend and Node.js frontend.
* Deployed the application on Microsoft Azure Container Apps.
* Added automatic switching between local and production backend URLs.
* Configured the Groq API key securely using Azure Container App secrets.
  
### Endpoints
* Consolidated local backend port configuration into a single shared `ML_BACKEND_PORT` env var, read by both `api.py` and `server.js` (and relayed to the browser via `/config.js`), instead of a hardcoded port in `script.js`.

### Inference Improvements

* Improved temporal buffer handling to prevent unnecessary resets caused by brief hand tracking failures.
* Added a per-session `GESTURE_TIMEOUT` so the backend buffer auto-clears after roughly a second of inactivity, starting a fresh gesture window.
* Added client-side majority-vote smoothing (5-frame rolling history) on top of server-side filtering, so a sign only registers once it's been consistently predicted.
* Added backend buffer status (`buffering`, `buffer_size`) to the frontend for improved prediction handling and debugging.
* Fixed runtime issues affecting subtitle updates and sentence generation.

## Future Work

* Improve prediction accuracy with a larger ASL training dataset.
* Further tune temporal smoothing thresholds for more stable real-time predictions.
* Add TURN server support for improved WebRTC connectivity beyond the current public relay.
* Extend the supported ASL vocabulary and sentence construction.
* Optimize inference speed and reduce container image size.
* Improve the mobile experience and overall UI.

## Notes

- `frontend/server.js` is the signaling server for WebRTC and socket communication, and also serves `/config.js` so the browser can read shared `.env` values.
- `backend/api.py` is the inference server for ASL prediction and grammar correction.
- `training/guide/` contains step-by-step instructions for data collection, dataset generation, LSTM training, and testing.
- See `backend/README.md` and `frontend/README.md` for endpoint-level and pipeline-level detail not covered here.