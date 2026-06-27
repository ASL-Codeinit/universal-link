# Model Testing Guide

This folder contains instructions for evaluating the trained models.

## Available Models

1. Random Forest (frame-based)
2. LSTM (sequence-based)

## Prerequisites

Install dependencies:

```bash
pip install pandas numpy scikit-learn torch matplotlib joblib
```

## Required Files

Before running the evaluation scripts, ensure the `evaluation` directory contains the following files:

```text
evaluation/
│
├── evaluate_frame_based.py
├── evaluate_lstm.py
├── frame_based_model.pkl
├── lstm_model.pt
├── label_map.pkl
├── my_data_v2.csv
├── X.npy
├── y.npy 

```

## Evaluation Scripts

### Random Forest

```bash
cd evaluation
python evaluate_frame_based.py
```

Outputs:

* Accuracy
* Macro F1 Score
* Average Latency
* Throughput (samples/sec)
* Confusion Matrix

### LSTM

```bash
cd evaluation
python evaluate_lstm.py
```

Outputs:

* Accuracy
* Macro F1 Score
* Average Latency
* Throughput (samples/sec)
* Confusion Matrix

## Result Summary

Refer to `results/model_comparison.md` for a detailed comparison between the models.
