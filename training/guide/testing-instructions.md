# Testing Guide

## Prerequisites

Ensure:

```
lstm_model.pt
```
exists in the training directory.

Install dependencies:

```
pip install -r requirements-training.txt
```

---

## Run Inference

```
python lstm_test.py
```

---

## How It Works

1. Webcam starts.
2. MediaPipe tracks hands.
3. Features are extracted.
4. Frames are stored in a 20-frame rolling buffer.
5. Once the buffer is full, the LSTM predicts the sign.


---

## Exit

Press: Q to terminate the application.
