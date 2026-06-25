# Random Forest Evaluation

## Model

* Algorithm: Random Forest Classifier
* Estimators: 200
* Input Features: 136 landmark features

## Run Evaluation

```bash
cd evaluation
python evaluate_frame_based.py
```

## Metrics

The evaluation script reports:

* Accuracy
* Macro F1 Score
* Average Inference Latency
* Throughput (samples/sec)

## Benchmark Method

Inference is performed using batch prediction:

```python
predictions = model.predict(X_test)
```

This avoids Python-loop overhead and provides a more accurate estimate of actual inference performance.

## Latest Results

Accuracy: 98.87%

Macro F1: 0.9888

Latency: 0.019 ms/sample

Throughput: 52,198 samples/sec
