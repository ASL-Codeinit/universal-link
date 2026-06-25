# Model Evaluation Report

## Experimental Setup

Two models were evaluated for ASL classification:

1. Random Forest Classifier

   * 200 estimators
   * Trained on 136 engineered landmark features

2. LSTM Network

   * Input size: 136
   * Hidden size: 64
   * Number of layers: 2
   * Sequence length: 20 frames

All evaluations were performed on CPU using the same train-test split.

---

## Performance Results

| Metric          |    Random Forest |             LSTM |
| --------------- | ---------------: | ---------------: |
| Accuracy        |           98.87% |           97.60% |
| Macro F1        |           0.9888 |           0.9750 |
| Average Latency |         0.019 ms |         0.042 ms |
| Throughput      | 52,198 samples/s | 23,846 samples/s |

---

## Benchmarking Methodology

Initial latency measurements were obtained by performing inference on individual samples inside a Python loop. This approach introduced significant overhead from DataFrame slicing, repeated function calls, and input validation.

To obtain a fair comparison, inference was benchmarked using batch prediction:

* Random Forest: `model.predict(X_test)`
* LSTM: single forward pass on the full test tensor

This reduced measurement overhead and better reflected actual model inference performance.

---

## Discussion

The Random Forest model achieved both higher accuracy and lower inference latency than the LSTM model.

The results indicate that the extracted landmark features are highly discriminative and can be effectively classified using a tree-based ensemble without requiring temporal sequence modeling.

The Random Forest achieved approximately 52k predictions per second, while the LSTM achieved approximately 24k predictions per second on the evaluation hardware.

---

## Future Work

Although the Random Forest performed best in the current experiments, sequence-based models such as LSTMs remain relevant for future extensions.

The current dataset uses fixed-length feature representations where temporal information may not be critical. However, for larger datasets involving:

* longer gesture sequences
* continuous sign language recognition
* variable-duration gestures
* more complex temporal dependencies

LSTM-based architectures may provide advantages due to their ability to model temporal context and sequential relationships between frames.

Therefore, the Random Forest is currently the preferred model for deployment because of its superior accuracy and inference speed, while LSTM-based approaches remain promising candidates for future scalability and sequence-oriented tasks.
