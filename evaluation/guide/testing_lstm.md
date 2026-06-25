# LSTM Evaluation

## Model

* Architecture: 2-layer LSTM
* Input Size: 136
* Hidden Size: 64
* Sequence Length: 20

## Run Evaluation

```bash
cd evaluation
python evaluate_lstm.py
```

## Metrics

The evaluation script reports:

* Accuracy
* Macro F1 Score
* Average Inference Latency
* Throughput (samples/sec)

## Benchmark Method

Inference is performed on the entire test tensor in a single forward pass:

```python
outputs = model(X_tensor)
```

This minimizes Python overhead and reflects true model inference performance.

## Latest Results

Accuracy: 97.60%

Macro F1: 0.9750

Latency: 0.042 ms/sample

Throughput: 23,846 samples/sec
