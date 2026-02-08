# 🔗 Universal Link: Real-Time ASL Translation Layer

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

### **Server & Frontend (Node.js/React)**
* `server/server.js`: The central hub using **Socket.io** to bridge Python AI predictions to the video call.
* `server/public/`: Contains the **React** frontend and **WebRTC** peer-to-peer streaming logic.

---

## 🛠️ Installation & Setup

### **1. Prerequisites**
* **Python 3.9+**
* **Node.js & npm**
* **Gemini API Key** (Set as an environment variable)

### **2. Machine Learning Environment (Python)**
```bash
cd "model/to send"
python3 -m venv venv
source venv/bin/activate

# Install core dependencies:
pip install "numpy<2.0.0" opencv-python mediapipe==0.10.9 scikit-learn requests google-generativeai
python3 predict.py
