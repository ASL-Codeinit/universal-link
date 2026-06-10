import os
import cv2
import csv
import numpy as np
import joblib
from groq import Groq
from dotenv import load_dotenv

# 1. Initialize Groq directly via environment variables
load_dotenv()
groq_api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=groq_api_key)

# 2. Load your local trained model from the backend-relative path
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'asl_model.pkl')
try:
    model = joblib.load(MODEL_PATH)
    print(f"✅ Machine Learning model loaded successfully from {MODEL_PATH}!")
except Exception as e:
    print(f"❌ Error loading model from {MODEL_PATH}: {e}")
    exit()

# 🟢 FIX 1: Open the camera BEFORE loading MediaPipe to prevent background deadlock hangs
print("🎬 Initializing webcam hardware...")
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("✅ Camera ready! Loading MediaPipe Tracking Layers...")
import mediapipe as mp
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.6)

# 🟢 FIX 2: Added the missing Robust Feature Extraction function to match your training setup
def extract_robust_features(hand_landmarks):
    raw_coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark])
    wrist = raw_coords[0]
    centered_coords = raw_coords - wrist
    
    max_val = np.max(np.abs(centered_coords))
    if max_val == 0: max_val = 1e-5
    normalized_coords = centered_coords / max_val
    flattened_features = normalized_coords.flatten().tolist() # 63 values
    
    # Extra Distance Features (Finger tips relative to wrist)
    tip_ids = [4, 8, 12, 16, 20]
    for tip_id in tip_ids:
        tip_coord = normalized_coords[tip_id]
        distance = float(np.linalg.norm(tip_coord))
        flattened_features.append(distance)
        
    return flattened_features # Returns 68 features per hand

# 4. Text Accumulation & Auto-Stack State
stacked_words = []
groq_output_sentence = ""
CONFIDENCE_THRESHOLD = 0.75  # ⚡ Optimized: Changed from 0.35 to 0.75 to prevent false tracking spam

# --- AUTO STACKING HELPERS ---
last_added_word = None
word_counter = 0        # Counts consecutive frames of the same sign
FRAMES_TO_HOLD = 15     # Must hold sign for ~15 frames (~0.5 seconds) to auto-add

print("\n🎥 System Active!")
print("✨ The program will AUTO-STACK words when held steadily for 0.5 seconds.")
print("👉 Press '.' (Full Stop) to send stacked words to Groq.")
print("👉 Press 'C' to clear everything.")
print("👉 Press 'Q' to exit.\n")

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        continue

    frame = cv2.flip(frame, 1)
    h, w, c = frame.shape
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb_frame)

    current_word = "None"
    confidence = 0.0

    # Extract Landmarks and predict
    if results.multi_hand_landmarks:
        left_hand_features = [0.0] * 68
        right_hand_features = [0.0] * 68
        
        for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
            handedness = results.multi_handedness[idx].classification[0].label
            clean_features = extract_robust_features(hand_landmarks)
            
            if handedness == "Left":
                left_hand_features = clean_features
            elif handedness == "Right":
                right_hand_features = clean_features

        # Keep structural stack consistency identical to recording file
        all_landmarks = left_hand_features + right_hand_features

        if len(all_landmarks) == 136:
            input_data = np.array(all_landmarks).reshape(1, -1)
            try:
                current_word = str(model.predict(input_data)[0])
                probabilities = model.predict_proba(input_data)
                confidence = float(np.max(probabilities))
            except Exception:
                pass

    # --- THE AUTO-STACK LOGIC ---
    if current_word != "None" and confidence >= CONFIDENCE_THRESHOLD:
        if current_word == last_added_word:
            word_counter += 1
        else:
            last_added_word = current_word
            word_counter = 0

        if word_counter == FRAMES_TO_HOLD:
            if not stacked_words or stacked_words[-1] != current_word:
                stacked_words.append(current_word)
                print(f"🤖 Auto-Stacked: {stacked_words}")
    else:
        word_counter = 0
        last_added_word = None

    # --- RENDER WINDOW HUD ---
    # Top Panel: Live Prediction Monitoring
    cv2.rectangle(frame, (0, 0), (w, 80), (15, 15, 15), -1)
    
    # Progress bar showing how close the word is to auto-stacking
    progress_width = int((min(word_counter, FRAMES_TO_HOLD) / FRAMES_TO_HOLD) * 200)
    cv2.rectangle(frame, (20, 60), (220, 70), (50, 50, 50), -1)
    cv2.rectangle(frame, (20, 60), (20 + progress_width, 70), (0, 255, 0), -1)

    cv2.putText(frame, f"SIGN: {current_word} ({confidence*100:.1f}%)", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

    # Bottom Panel: Word Stack Buffer & Groq output stream
    cv2.rectangle(frame, (0, h - 120), (w, h), (25, 20, 20), -1)
    buffer_text = " ".join(stacked_words) if stacked_words else "[Empty Stack]"
    cv2.putText(frame, f"STACK: {buffer_text}", (20, h - 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)
    
    display_groq = groq_output_sentence if groq_output_sentence else "Press '.' to translate sentence"
    cv2.putText(frame, f"GROQ: {display_groq}", (20, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    cv2.imshow('ASL to Groq Core Pipeline', frame)

    # --- KEY HANDLING ---
    key = cv2.waitKey(1) & 0xFF

    # FULL STOP Key (.): Run Groq Inference and Display Output
    if key == ord('.'):
        if stacked_words:
            raw_input_text = " ".join(stacked_words)
            print(f"\n🧠 Sending text stack to Groq Engine: '{raw_input_text}'")
            try:
                chat_completion = client.chat.completions.create(
                    messages=[
                        {
                            "role": "system",
                            "content": "You are an interpreter. Convert the following words into a clean, natural English sentence. Return ONLY the sentence."
                        },
                        {
                            "role": "user",
                            "content": f"Words: {raw_input_text}"
                        }
                    ],
                    model="llama-3.3-70b-versatile",
                )
                groq_output_sentence = chat_completion.choices[0].message.content.strip()
                print(f"✨ Groq Answer: {groq_output_sentence}")
            except Exception as e:
                groq_output_sentence = f"Groq Error: {str(e)}"
        else:
            print("Stack is empty! Hold gestures in front of the camera first.")

    # C Key: Clear memory logs
    elif key == ord('c') or key == ord('C'):
        stacked_words = []
        groq_output_sentence = ""
        word_counter = 0
        last_added_word = None
        print("🧹 Cleaned word stack and display buffer.")

    # Q Key: Safe Exit
    elif key == ord('q') or key == ord('Q'):
        break

cap.release()
cv2.destroyAllWindows()
hands.close()
print("System disconnected.")