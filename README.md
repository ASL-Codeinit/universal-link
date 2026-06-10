clea# 🔗 Universal Link: Real-Time ASL Translation Layer

**Universal Link** is a real-time Sign Language-to-Speech translation system. We bridge the communication gap by combining custom-trained computer vision models with **Google Gemini LLM** for sophisticated, context-aware grammar correction.

---

## 🚀 Key Features
* **Custom-Trained AI**: Built and trained on a proprietary dataset of ASL gestures using a RandomForest classifier.
* **Intelligent Grammar (Gemini)**: Raw ASL gloss is transformed into natural, fluent English using the **Gemini LLM**.
* **Ultra-Low Latency**: Total system latency of **95-150ms**, well under the 200ms industry target for fluid conversation.
* **Integrated Text-to-Speech (TTS)**: Instant audio feedback for hearing participants via the Web Speech API.
* **Dual-Hand Recognition**: Tracks **126 landmark features** (63 per hand) for high-precision tracking of complex signs.

---

## 📂 File Directory & Descriptions
The project is split between the **ML Inference Pipeline** and the **Real-Time Communication Bridge**.

### **Backend / ML (Python)**
* `predict.py`: The core engine handling webcam capture, MediaPipe landmark extraction, and **Gemini API** calls.
* `model.joblib`: Our custom-trained **RandomForest model**.
* `venv/`: Virtual environment with optimized packages for Apple Silicon/Windows.

### **Server & Frontend (Node.js)**
* `frontend/server.js`: The central hub using **Socket.io** to bridge Python AI predictions to the video call.
* `frontend/pages/`: Contains the frontend HTML pages and **WebRTC** peer-to-peer streaming logic.
* `frontend/css/`: Contains CSS for the lobby and call pages.
* `frontend/js/`: Contains client-side JavaScript logic.

---

## 🛠️ Installation & Setup

### **1. Prerequisites**
* **Python 3.9+**
* **Node.js & npm**
* **Gemini API Key** (Set as an environment variable)

### **2. Machine Learning Environment (Python)**
```bash
cd training
python3 -m venv venv
source venv/bin/activate

# Install core dependencies:
pip install "numpy<2.0.0" opencv-python mediapipe==0.10.9 scikit-learn requests google-generativeai
```

### **3. Backend Model Startup**
Run the model prediction loop from the backend folder using the trained model in `backend/asl_model.pkl`:
```bash
cd backend
source ../venv/bin/activate
export GROQ_API_KEY="your_api_key_here"
python predict.py
```

This will open the webcam, load the backend model, and start ASL sign prediction with Groq translation support.

### **4. Backend API Server Startup**
Start the FastAPI server for frontend prediction requests:
```bash
cd backend
source ../venv/bin/activate
python -m uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

Then ensure `frontend/js/script.js` is set to use `http://localhost:8000/predict` as the local API.

### **5. Frontend / Node.js Setup**

```bash
cd frontend
npm install
npm start
```

Then open `http://localhost:3000` in your browser to access the lobby page.

### **4. Backend Server Startup**
From the project root, start the Node.js signaling server for the frontend to connect to:
```bash
cd frontend
node server.js
```

If you want the frontend and backend server both to run locally with the same port, the `npm start` command already starts `frontend/server.js`.

