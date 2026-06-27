import time
import joblib
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    confusion_matrix,
    ConfusionMatrixDisplay
)


# Load dataset
df = pd.read_csv("my_data_v2.csv")

y = df["label"]
X = df.iloc[:, 4:]

# Same split used during training
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# Load model
model = joblib.load("frame_based_model.pkl")

start = time.perf_counter()

predictions = model.predict(X_test)

end = time.perf_counter()

total_time = end - start

avg_latency_ms = (
    total_time / len(X_test)
) * 1000

print(
    f"Avg Latency: {avg_latency_ms:.6f} ms"
)

print(
    f"Samples/sec: {len(X_test)/total_time:.2f}"
)

# Metrics
acc = accuracy_score(y_test, predictions)
f1 = f1_score(y_test, predictions, average="macro")

print(f"\nAccuracy: {acc:.4f}")
print(f"Macro F1: {f1:.4f}")
# print(f"Avg Latency: {np.mean(latencies):.3f} ms")

# Confusion Matrix
cm = confusion_matrix(y_test, predictions)

disp = ConfusionMatrixDisplay(
    confusion_matrix=cm,
    display_labels=sorted(y.unique())
)

disp.plot(xticks_rotation=45)

plt.tight_layout()

plt.savefig(
    "confusion_matrices/frame_based_cm.png"
)

print("Saved confusion matrix.")

