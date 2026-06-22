# Backend Integration and Real-Time Inference

After the dataset preparation and LSTM model training were completed, the next step was integrating the trained model into the video calling application to enable real-time sign recognition.

---

## FastAPI Backend Integration

The previous backend was designed for a Random Forest model, where each frame was classified independently.

Since the LSTM model requires motion information instead of a single frame, the backend was redesigned to work with sequences.

### Model Loading

- Loaded the trained `lstm_model.pt` checkpoint.
- Reconstructed the LSTM architecture using the saved metadata:
  - Input size
  - Hidden size
  - Number of layers
  - Number of output classes
- Loaded the learned weights using `load_state_dict()`.
- Set the model to evaluation mode for inference.

---

## Sequence Buffer Implementation

Unlike Random Forest, the LSTM requires a sequence of frames.

A rolling buffer was implemented for each user session.

### Working

1. Every incoming frame contains 136 features.
2. New frames are appended to the buffer.
3. The buffer stores only the latest 20 frames.
4. Once 20 frames are available, they are reshaped into:

```python
(1, 20, 136)
```

5. The sequence is passed through the LSTM model.
6. Softmax probabilities are calculated.
7. The class with the highest confidence is returned.

---

## Session-Based Buffers

Since multiple users may use the application simultaneously, a separate buffer is maintained for each session.

```python
session_buffers[session_id]
```

This prevents:

- Mixing sequences from different users.
- Incorrect predictions during multi-user calls.

---

## Buffer Reset Mechanism

A major issue with continuous prediction is sequence corruption.

Example:

```
HELLO gesture
(hand disappears)
THANK YOU gesture
```

Without clearing the buffer, the model may receive:

```
HELLO + THANK YOU
```

which produces incorrect predictions.

To solve this:

- A `/reset-buffer` endpoint was added.
- Whenever MediaPipe detects no hands, the frontend calls:

```python
POST /reset-buffer
```

This clears the sequence and ensures every sign starts with a fresh buffer.

---

## Prediction Response

The API returns:

```json
{
  "sign": "want",
  "confidence": 0.99,
  "buffering": false
}
```

During the initial frames:

```json
{
  "buffering": true,
  "buffer_size": 12
}
```

which indicates that the model is still collecting frames.

---

# Frontend Modifications

The frontend was updated to match the exact preprocessing pipeline used during training.

---

## MediaPipe Landmark Extraction

For each frame:

- MediaPipe detects up to two hands.
- Robust features are extracted.
- Left hand → 68 features.
- Right hand → 68 features.

Final feature vector:

```
68 + 68 = 136 features
```

This format is identical to the training dataset.

---

## Handedness Correction

During dataset collection, frames were horizontally flipped using OpenCV.

MediaPipe in JavaScript interprets handedness differently compared to the Python pipeline.

To maintain consistency, handedness labels were swapped:

```javascript
Left → Right
Right → Left
```

This significantly improved prediction accuracy.

---

## Real-Time Communication with Backend

For every processed frame:

1. Extract features.
2. Build the 136-value vector.
3. Send it to the FastAPI backend.
4. Receive:
   - predicted sign
   - confidence score

The prediction is then displayed on the interface and transmitted to the remote participant through Socket.IO.

---

## Automatic Buffer Reset

When no hands are detected:

```javascript
resetServerBuffer()
```

is called.

This invokes:

```
POST /reset-buffer
```

and prevents old gestures from affecting new predictions.

---

## Performance Improvements

Several optimizations were introduced:

### Request Throttling

Reduced excessive prediction requests to avoid overloading the backend.

### Stable Sequence Handling

Maintained a rolling 20-frame window identical to the training setup.

### Multi-User Support

Used room IDs as session IDs so each participant maintains an independent sequence history.

---

# Overall Real-Time Pipeline

```
Webcam
      ↓
MediaPipe Hands
      ↓
136 Feature Extraction
      ↓
Frontend
      ↓
FastAPI Backend
      ↓
20-Frame Session Buffer
      ↓
LSTM Model
      ↓
Softmax Probabilities
      ↓
Predicted Sign + Confidence
      ↓
Socket.IO
      ↓
Remote User Display
```

---

## Technologies Used

- Python
- FastAPI
- PyTorch
- MediaPipe Hands
- JavaScript
- Socket.IO
- WebRTC
- Groq API

---

## Contribution Summary

- Migrated backend from Random Forest inference to LSTM inference.
- Implemented sequence-based prediction.
- Added session-specific rolling buffers.
- Added buffer reset endpoint.
- Updated frontend feature extraction to match training.
- Corrected handedness mismatch between Python and JavaScript pipelines.
- Integrated real-time prediction into the video call system.
- Improved prediction stability and reduced sequence corruption.