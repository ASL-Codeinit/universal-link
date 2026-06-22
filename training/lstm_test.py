
# Real-time LSTM sign recognition pipeline:
# 1. Capture webcam frames and detect hands using MediaPipe.
# 2. Extract the same 136 features/frame used during training
#    (68 features for left hand + 68 for right hand).
# 3. Maintain a sliding sequence buffer containing the most recent
#    20 frames. Each new frame is appended and the oldest frame is
#    discarded, ensuring the buffer always matches the sequence length
#    the LSTM was trained on.
# 4. If no hands are detected, clear the buffer to avoid combining
#    unrelated gesture fragments into a single sequence.
# 5. Once the buffer contains 20 frames, reshape it to
#    (1, 20, 136), run LSTM inference, and obtain class probabilities.
# 6. Display the predicted sign only when confidence exceeds the
#    configured threshold; otherwise show it as a low-confidence result.



# Sequence buffer management:
# sequence_buffer acts as a rolling window of the latest 20 frames.
# The LSTM does not classify individual frames; it classifies the
# entire motion sequence. Each frame contributes one 136-feature vector.
# When a new frame arrives, it is added to the buffer and the oldest
# frame is removed if necessary. This creates a continuously updating
# 20-frame sequence for real-time prediction.


import os
import cv2
import numpy as np
import torch
import torch.nn as nn

# ── Settings ─────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'lstm_model.pt')
SEQUENCE_LENGTH = 20
FEATURES_PER_FRAME = 136
CONFIDENCE_THRESHOLD = 0.75

# ── Model definition (must match training exactly) ────────────────────
class ASLModel(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, num_classes):
        super(ASLModel, self).__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.3
        )
        self.fc = nn.Linear(hidden_size, num_classes)

    def forward(self, x):
        out, _ = self.lstm(x)
        out = out[:, -1, :]
        out = self.fc(out)
        return out

# ── Load checkpoint ─────────────────────────────────────────────────
try:
    checkpoint = torch.load(MODEL_PATH, map_location='cpu', weights_only=False)
    model = ASLModel(
        checkpoint['input_size'],
        checkpoint['hidden_size'],
        checkpoint['num_layers'],
        checkpoint['num_classes']
    )
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()
    classes = checkpoint['classes']
    print(f"LSTM model loaded from {MODEL_PATH}")
    print(f"Classes ({len(classes)}): {classes}")
except Exception as e:
    print(f"Error loading model from {MODEL_PATH}: {e}")
    exit()

# ── Camera + MediaPipe (camera opened first, same fix as before) ──────
print("Initializing webcam hardware...")
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("Camera ready! Loading MediaPipe Tracking Layers...")
import mediapipe as mp
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.6)

# ── Feature extraction (identical to recording/training pipeline) ─────
def extract_robust_features(hand_landmarks):
    raw_coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark])
    wrist = raw_coords[0]
    centered_coords = raw_coords - wrist

    max_val = np.max(np.abs(centered_coords))
    if max_val == 0:
        max_val = 1e-5
    normalized_coords = centered_coords / max_val
    flattened_features = normalized_coords.flatten().tolist()  # 63 values

    tip_ids = [4, 8, 12, 16, 20]
    for tip_id in tip_ids:
        tip_coord = normalized_coords[tip_id]
        distance = float(np.linalg.norm(tip_coord))
        flattened_features.append(distance)
    return flattened_features  # 68 features per hand

# ── Sequence buffer ─────────────────────────────────────────────────
sequence_buffer = []

print("\nSystem Active!")
print("Press 'Q' to exit.\n")

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

        all_landmarks = left_hand_features + right_hand_features  # 136

        if len(all_landmarks) == FEATURES_PER_FRAME:
            sequence_buffer.append(all_landmarks)
            sequence_buffer = sequence_buffer[-SEQUENCE_LENGTH:]
    else:
        # No hands detected this frame — decide whether to reset or just
        # not append. Resetting is safer: avoids splicing unrelated
        # gesture fragments into one sequence.
        sequence_buffer = []

    # Only predict once we have a full window
    if len(sequence_buffer) == SEQUENCE_LENGTH:
        
        input_data = np.array(sequence_buffer, dtype=np.float32).reshape(1, SEQUENCE_LENGTH, FEATURES_PER_FRAME)
        with torch.no_grad():
            output = model(torch.from_numpy(input_data))
            probs = torch.softmax(output, dim=1)
            confidence, predicted = torch.max(probs, dim=1)
            confidence = confidence.item()
            current_word = classes[predicted.item()]
        print(f"{current_word}: {confidence:.3f}")

    # --- HUD ---
    cv2.rectangle(frame, (0, 0), (w, 80), (15, 15, 15), -1)
   
    buf_fill = int((len(sequence_buffer) / SEQUENCE_LENGTH) * 200)
    cv2.rectangle(frame, (20, 60), (220, 70), (50, 50, 50), -1)
    cv2.rectangle(frame, (20, 60), (20 + buf_fill, 70), (0, 255, 0), -1)

    if current_word != "None" and confidence >= CONFIDENCE_THRESHOLD:
        label = f"SIGN: {current_word} ({confidence*100:.1f}%)"
        color = (0, 255, 0)
    elif current_word != "None":
        label = f"SIGN: {current_word}? ({confidence*100:.1f}%) [below threshold]"
        color = (0, 165, 255)
    else:
        label = f"Buffering... ({len(sequence_buffer)}/{SEQUENCE_LENGTH})"
        color = (200, 200, 200)

    cv2.putText(frame, label, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    cv2.imshow('LSTM Sign Test', frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q') or key == ord('Q'):
        break

cap.release()
cv2.destroyAllWindows()
hands.close()
print("System disconnected.")