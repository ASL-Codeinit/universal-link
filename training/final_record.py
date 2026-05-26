import os
import cv2
import csv
import numpy as np

# 1. Open the camera FIRST using the DirectShow backend
print("🎬 Initializing webcam hardware...")
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
if not cap.isOpened():
    print("❌ Error: Could not access webcam. Make sure it isn't open in another app.")
    exit()

# 2. Set resolution hints to speed up handshake
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("✅ Camera ready! Now loading MediaPipe Tracking...")

# 3. Import and initialize MediaPipe AFTER the camera is safely open
import mediapipe as mp
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(min_detection_confidence=0.7, max_num_hands=2)
mp_drawing = mp.solutions.drawing_utils

TARGET_COUNT = 200 

def extract_robust_features(hand_landmarks):
    raw_coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark])
    wrist = raw_coords[0]
    centered_coords = raw_coords - wrist
    
    max_val = np.max(np.abs(centered_coords))
    if max_val == 0: max_val = 1e-5
    normalized_coords = centered_coords / max_val
    flattened_features = normalized_coords.flatten().tolist() 
    
    tip_ids = [4, 8, 12, 16, 20]
    for tip_id in tip_ids:
        tip_coord = normalized_coords[tip_id]
        distance = float(np.linalg.norm(tip_coord))
        flattened_features.append(distance)
        
    return flattened_features 

# --- THE WORD LOOP BEGINS ---
while True:
    label = input("\nEnter Word (or 'exit' to stop recording): ").strip().lower()
    if label == 'exit': 
        break
    
    print(f"Prepare to sign: '{label}'... Look at the camera window!")
    
    # Safe countdown loop
    for i in range(30, 0, -1):
        ret, frame = cap.read()
        if ret:
            frame = cv2.flip(frame, 1)
            cv2.putText(frame, f"GET READY TO SIGN: {label}", (50, 220), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            cv2.putText(frame, f"Starting in: {i//10 + 1}s", (50, 270), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            cv2.imshow('Recording', frame)
            cv2.waitKey(50) 

    count = 0
    with open('my_data.csv', 'a', newline='') as f:
        writer = csv.writer(f)
        
        while count < TARGET_COUNT:
            ret, frame = cap.read()
            if not ret: break
                
            frame = cv2.flip(frame, 1)
            results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            
            if results.multi_hand_landmarks:
                left_hand_features = [0.0] * 68
                right_hand_features = [0.0] * 68
                
                for idx, hand_lms in enumerate(results.multi_hand_landmarks):
                    handedness = results.multi_handedness[idx].classification[0].label
                    clean_features = extract_robust_features(hand_lms)
                    
                    if handedness == "Left":
                        left_hand_features = clean_features
                    elif handedness == "Right":
                        right_hand_features = clean_features
                
                total_features = left_hand_features + right_hand_features
                writer.writerow([label] + total_features)
                count += 1
                
                for hand_lms in results.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(frame, hand_lms, mp_hands.HAND_CONNECTIONS)
            
            cv2.putText(frame, f"Rec: {label} ({count}/{TARGET_COUNT})", (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 2)
            cv2.imshow('Recording', frame)
            
            if cv2.waitKey(1) == ord('q'): 
                print("Recording canceled.")
                break

cap.release()
cv2.destroyAllWindows()
print("\n✅ Session completed clean!")