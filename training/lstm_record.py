import cv2
import numpy as np
import os

# ── Camera first, MediaPipe after ──────────────────────────────
print("🎬 Initializing webcam...")
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

import mediapipe as mp
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(min_detection_confidence=0.7, max_num_hands=2)
print("✅ Camera and MediaPipe ready!")

# ── Settings ───────────────────────────────────────────────────
SEQUENCE_LENGTH = 20   # frames per sample (the sliding window size)
SAMPLES_PER_WORD = 50 # how many sequences to collect per word
DATA_DIR = 'lstm_data' # folder to save data

os.makedirs(DATA_DIR, exist_ok=True)

# ── Feature extraction (same as final_record.py) ───────────────
def extract_robust_features(hand_landmarks):
    raw_coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark])
    wrist = raw_coords[0]
    centered_coords = raw_coords - wrist

    max_val = np.max(np.abs(centered_coords))
    if max_val == 0: max_val = 1e-5
    normalized_coords = centered_coords / max_val
    features = normalized_coords.flatten().tolist()  # 63 values

    tip_ids = [4, 8, 12, 16, 20]
    for tip_id in tip_ids:
        tip_coord = normalized_coords[tip_id]
        distance = float(np.linalg.norm(tip_coord))
        features.append(distance)

    return features  # 68 values per hand

# ── Main recording loop ────────────────────────────────────────
while True:
    label = input("\nEnter word to record (or 'exit' to quit): ").strip().lower()
    if label == 'exit':
        break

    # create folder for this word
    word_dir = os.path.join(DATA_DIR, label)
    os.makedirs(word_dir, exist_ok=True)

    # check how many samples already exist for this word
    existing = len(os.listdir(word_dir))
    print(f"📁 Found {existing} existing samples for '{label}'")
    print(f"🎯 Collecting {SAMPLES_PER_WORD} new samples...")
    print("Get ready — signing will start after countdown!")

    sample_count = 0

    while sample_count < SAMPLES_PER_WORD:

        # ── Countdown before each sample ──────────────────────
        for i in range(3, 0, -1):
            ret, frame = cap.read()
            if ret:
                frame = cv2.flip(frame, 1)
                cv2.putText(frame, f"GET READY: {label}", (50, 200),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
                cv2.putText(frame, f"Starting in {i}...", (50, 260),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
                cv2.putText(frame, f"Sample {sample_count+1}/{SAMPLES_PER_WORD}", (50, 320),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                cv2.imshow('Recording', frame)
                cv2.waitKey(500)  # 0.5 second per countdown step

        # ── Collect SEQUENCE_LENGTH frames for this sample ────
        sequence = []  # will hold 20 frames of 136 numbers each

        while len(sequence) < SEQUENCE_LENGTH:
            ret, frame = cap.read()
            if not ret:
                continue

            frame = cv2.flip(frame, 1)
            results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

            # build 136 feature array — left + right hand
            left_features  = [0.0] * 68
            right_features = [0.0] * 68

            if results.multi_hand_landmarks:
                for idx, hand_lms in enumerate(results.multi_hand_landmarks):
                    handedness = results.multi_handedness[idx].classification[0].label
                    features = extract_robust_features(hand_lms)
                    if handedness == 'Left':
                        left_features = features
                    else:
                        right_features = features

                # draw skeleton
                for hand_lms in results.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(frame, hand_lms, mp_hands.HAND_CONNECTIONS)

            # combine both hands → 136 values
            frame_features = left_features + right_features
            sequence.append(frame_features)

            # show progress bar
            progress = int((len(sequence) / SEQUENCE_LENGTH) * 200)
            cv2.rectangle(frame, (20, 60), (220, 80), (50, 50, 50), -1)
            cv2.rectangle(frame, (20, 60), (20 + progress, 80), (0, 255, 0), -1)
            cv2.putText(frame, f"Recording: {label}", (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(frame, f"Frame {len(sequence)}/{SEQUENCE_LENGTH}", (20, 110),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(frame, f"Sample {sample_count+1}/{SAMPLES_PER_WORD}", (20, 140),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.imshow('Recording', frame)
            cv2.waitKey(1)

        # ── Save this sequence as one numpy file ──────────────
        sequence_array = np.array(sequence)  # shape (20, 136)
        save_path = os.path.join(word_dir, f"{existing + sample_count}.npy")
        np.save(save_path, sequence_array)

        sample_count += 1
        print(f"✅ Saved sample {sample_count}/{SAMPLES_PER_WORD} for '{label}'")

    print(f"\n🎉 Done! Collected {SAMPLES_PER_WORD} samples for '{label}'")
    print(f"📁 Saved in: {DATA_DIR}/{label}/")

cap.release()
cv2.destroyAllWindows()
hands.close()
print("\n✅ Recording session complete!")