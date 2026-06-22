# SignLink LSTM Training Pipeline

## Overview

This directory contains the complete machine learning pipeline used for SignLink's sequence-based sign language recognition system.

The pipeline converts MediaPipe hand landmarks into fixed-length motion sequences and trains a PyTorch LSTM classifier capable of recognizing dynamic sign gestures from temporal hand movement.

Unlike the previous Random Forest implementation, which operated on individual frames, this pipeline learns patterns across multiple consecutive frames and therefore captures motion information that is essential for sign language recognition.

## Project Structure

### `collect_data.py
To generate datasets. Records sign language samples using a webcam and MediaPipe hand tracking. Each recording is stored in the dataset as a sequence of frames with metadata and extracted hand features.

**Input:** Webcam video + signer label
**Output:** `my_data_v2.csv`

---

### `my_data_v2.csv`

Main dataset used by the training pipeline. Each row represents one frame and contains metadata plus extracted hand features.


---

### `generate_sequences.py`

Converts the frame-level dataset into fixed-length motion sequences suitable for LSTM training. Frames are grouped into recordings and converted into 20-frame sequences.

**Input:** `my_data_v2.csv`
**Output:** `X.npy`, `y.npy`, `label_map.pkl`

---

### `lstm_train.py`

The training script: Trains the LSTM model on generated sequences and exports the final trained model checkpoint.

**Input:** `X.npy`, `y.npy`, `label_map.pkl`
**Output:** `lstm_model.pt`

---

### `lstm_test.py`

For testing, post-training: Loads the trained model and performs real-time sign recognition using the webcam. Uses a rolling sequence buffer to continuously classify gestures.

---

### `requirements-training.txt`

Python dependencies required for data collection, preprocessing, training and testing.

---

## scripts-used/
> Just the scripts used mid process, saved for documentation purposes mostly

### `convert_dataset.py`

Converts the original dataset format into the newer metadata-aware dataset format.

### `add_headers.py`

Adds column headers to an existing dataset file.

### `convert_lstm_data.py`

Imports external `.npy` sign recordings and appends them into the main dataset.

### `seq-gen_test.py`

Checks whether sequence generation completed successfully and validates the generated dataset.

---

# Technical Description

## Dataset Design

The training pipeline uses `my_data_v2.csv` as the single source of truth. Each row corresponds to a single video frame and contains:

* `signer_id`
* `recording_id`
* `label`
* `frame_number`
* 136 landmark-based features

The metadata allows reconstruction of complete recordings, supports multiple signers, and prevents sequence boundaries from crossing recordings.

---

## Feature Extraction

Each frame contains 136 features:

### Left Hand (68 features)

* 63 normalized landmark coordinates

  * 21 landmarks
  * x, y, z coordinates
* 5 fingertip distance features

### Right Hand (68 features)

* Same structure as left hand

Missing hands are represented using zeros, allowing a fixed-size feature vector regardless of whether one or two hands are visible.

---

## Landmark Normalization

For each hand:

1. Wrist landmark is used as the origin.
2. All landmarks are translated relative to the wrist.
3. Coordinates are normalized using the maximum absolute coordinate magnitude.
4. Fingertip-to-wrist distances are appended as additional features.

This reduces sensitivity to:

* Hand position
* Camera distance
* Hand size

while preserving gesture shape information.

---

## Sequence Generation

The dataset is transformed into temporal samples using a sliding window.

- Sequence length: 20 frames

Example:
```
Frames 1–20
Frames 2–21
Frames 3–22
...
```

Windows are generated independently for each recording and never cross recording boundaries. Labels are assigned at the sequence level.

Generated outputs:

```
X.npy -> (num_sequences, 20, 136)
y.npy -> (num_sequences,)
label_map.pkl
```

---

## LSTM Architecture

Input:

```
Sequence Length = 20
Features / Frame = 136
```

Model:

```
LSTM Layer 1
    Hidden Size = 64

LSTM Layer 2
    Hidden Size = 64

Dropout = 0.3

Fully Connected Layer
    64 -> num_classes
```

The final timestep output is used as a compact representation of the complete gesture and is passed to the classifier.

---

## Training Configuration

```
Optimizer      : Adam
Learning Rate  : 0.001
Loss Function  : CrossEntropyLoss
Batch Size     : 32
Epochs         : 50
Train/Test     : 80/20
Random Seed    : 42
```

Class distributions are preserved during splitting using stratified sampling.

---

## Model Export

The final checkpoint stores:

```
model_state_dict
input_size
hidden_size
num_layers
num_classes
classes
```

The inference script reconstructs the architecture and loads the stored weights from the checkpoint.

---

## Real-Time Inference

The test pipeline maintains a rolling sequence buffer containing the most recent 20 frames.

```
New Frame
    ↓
Append To Buffer
    ↓
Keep Latest 20 Frames
    ↓
LSTM Prediction
```

If no hands are detected, the buffer is cleared to avoid combining unrelated gesture fragments. Predictions are displayed only when confidence exceeds a configurable threshold.

---

## Motivation

The previous Random Forest classifier treated each frame independently and learned only static hand poses.

The LSTM processes sequences of frames and learns temporal motion patterns, allowing recognition of dynamic gestures where movement is essential to meaning.

---

## Documentation

### User Guides

* [Data Collection Guide](guide/data-collection-instructions.md)

* [Training Guide](guide/training-guide.md)
 
* [Testing Guide](guide/testing-guide.md)
 

### Technical Documentation

* [LSTM Dataset Generation](guide/lstm-dataset-generation.md)

* [LSTM Training Pipeline](guide/lstm-training-pipeline.md)


These documents cover the complete SignLink ML workflow from data collection through training and deployment-ready inference.

