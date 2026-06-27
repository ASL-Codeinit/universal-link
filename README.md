# Universal Link

Universal Link is a real-time sign language video call platform that translates American Sign Language (ASL) gestures into live text and grammatically refined sentences. The system combines browser-based hand tracking with a temporal LSTM gesture recognition model, real-time WebRTC communication, and AI-powered grammar correction.

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
* Groq-powered grammar correction for detected sign sequences
* Session-isolated prediction buffers supporting multiple simultaneous conversations
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
Rolling 20-frame Buffer
   │
   ▼
LSTM Model (PyTorch)
   │
   ▼
Predicted Sign
   │
   ├────────► Live subtitles
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

Run the FastAPI server on any available port:

```bash
python -m uvicorn api:app --reload --host 0.0.0.0 --port <PORT>
```

For local development, update the `API_BASE` value in `frontend/js/script.js` to match the backend URL if necessary.

In production, the frontend automatically detects the environment and communicates with the deployed Azure backend.


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
* Backend: `http://localhost:8000`

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
* Stored container images in Azure Container Registry (ACR).
* Added automatic switching between local and production backend URLs.
* Configured the Groq API key securely using Azure Container App secrets.

### Inference Improvements

* Fixed feature extraction to match the preprocessing used during model training.
* Improved temporal buffer handling to prevent unnecessary resets caused by brief hand tracking failures.
* Tuned prediction thresholds and cooldowns for more responsive real-time recognition.
* Added backend buffer status to the frontend for improved prediction handling and debugging.
* Fixed runtime issues affecting subtitle updates and sentence generation.


## Future Work

* Improve prediction accuracy with a larger ASL training dataset.
* Enhance temporal smoothing for more stable real-time predictions.
* Add TURN server support for improved WebRTC connectivity.
* Extend the supported ASL vocabulary and sentence construction.
* Optimize inference speed and reduce container image size.
* Improve the mobile experience and overall UI.

## Notes

- `frontend/server.js` is the signaling server for WebRTC and socket communication
- `backend/api.py` is the inference server for ASL prediction and grammar correction
- `training/guide/` contains step-by-step instructions for data collection, dataset generation, LSTM training, and testing

