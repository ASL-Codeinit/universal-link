🔗 Universal Link: Real-Time ASL Translation Layer

Universal Link is a real-time Sign Language-to-Speech translation system designed to bridge the communication gap in video conferencing. By combining custom-trained computer vision models with Gemini LLM grammar correction, we provide a seamless experience for Deaf and Hard-of-Hearing users.
+3

🚀 Key Features

Custom-Trained AI: Built from scratch using a proprietary dataset of ASL gestures.


Real-Time Translation: Gesture-to-text with sub-200ms latency (averaging 95-150ms).
+3


Intelligent Grammar: Leverages Google Gemini to transform raw ASL gloss patterns into natural, fluent English.
+2


Integrated Text-to-Speech (TTS): Instant audio output for hearing participants via the Web Speech API.
+2


Dual-Hand Recognition: Processes 126 landmark features (63 per hand) for high-precision tracking.
+2

📂 File Directory & Descriptions
The project is organized into two main components: the ML Pipeline and the Communication Bridge.

Backend / ML (Python)
predict.py: The core execution script. It handles webcam capture, MediaPipe landmark extraction, and sends predictions to the server.
+2


model.joblib: The custom-trained RandomForest classifier containing our proprietary ASL logic.
+2

venv/: Local virtual environment containing optimized dependencies (NumPy, OpenCV, MediaPipe).

Server & Frontend (Node.js)
server/server.js: The central hub. Uses Socket.io to bridge the Python AI predictions to the WebRTC video call.


server/public/: Contains the React/JavaScript frontend, WebRTC peer-to-peer logic, and TTS execution scripts.
+1

🛠️ Installation & Setup
1. Prerequisites
Python 3.9+ (Note: Use python3 on macOS)

Node.js & npm

Java JRE (Required for the language_tool_python grammar engine)

2. Machine Learning Environment (Python)
Navigate to the model folder and set up the virtual environment:

Bash
cd "model/to send"
python3 -m venv venv
source venv/bin/activate

# Install specific versions to avoid Mac compatibility issues:
pip install "numpy<2.0.0" 
pip install opencv-python==4.9.0.80 
pip install mediapipe==0.10.9 
pip install scikit-learn requests language_tool_python
3. Communication Bridge (Node.js)
Open a new terminal window:

Bash
cd "model/to send/server"
npm install
node server.js
🧠 System Architecture

Capture: MediaPipe detects 126 hand landmarks in real-time.
+1


Inference: Our RandomForest model (trained on 50+ ASL patterns) classifies the gesture.
+2


Refinement: The raw gloss is processed via Gemini LLM for contextual grammar correction.
+1


Broadcast: Translated text is sent via Socket.io to the WebRTC Data Channel.
+2


Output: The hearing user receives real-time text and synthesized speech.

📈 Performance Metrics

Detection Latency: ~95ms.
+2


Total System Latency: <200ms (Target achieved).
+2


Feature Complexity: 126 unique hand coordinates per frame.
+1
