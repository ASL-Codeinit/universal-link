import time
import pickle
import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    confusion_matrix,
    ConfusionMatrixDisplay
)

# Load data
X = np.load("X.npy")
y = np.load("y.npy")

# Same split used during training
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# Load label map
with open("label_map.pkl", "rb") as f:
    label_map = pickle.load(f)

idx_to_label = {
    v: k for k, v in label_map.items()
}

# Load checkpoint
checkpoint = torch.load(
    "lstm_model.pt",
    map_location="cpu"
)

INPUT_SIZE = checkpoint["input_size"]
HIDDEN_SIZE = checkpoint["hidden_size"]
NUM_LAYERS = checkpoint["num_layers"]
NUM_CLASSES = checkpoint["num_classes"]

class ASLModel(nn.Module):
    def __init__(self, input_size, hidden_size,
                 num_layers, num_classes):

        super().__init__()

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.3
        )

        self.fc = nn.Linear(
            hidden_size,
            num_classes
        )

    def forward(self, x):
        out, _ = self.lstm(x)
        out = out[:, -1, :]
        out = self.fc(out)
        return out

model = ASLModel(
    INPUT_SIZE,
    HIDDEN_SIZE,
    NUM_LAYERS,
    NUM_CLASSES
)

model.load_state_dict(
    checkpoint["model_state_dict"]
)

model.eval()

X_tensor = torch.FloatTensor(X_test)

start = time.perf_counter()

with torch.no_grad():
    outputs = model(X_tensor)

end = time.perf_counter()

predictions = (
    torch.argmax(outputs, dim=1)
    .cpu()
    .numpy()
)

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
acc = accuracy_score(
    y_test,
    predictions
)

f1 = f1_score(
    y_test,
    predictions,
    average="macro"
)

print(f"\nAccuracy: {acc:.4f}")
print(f"Macro F1: {f1:.4f}")
# print(f"Avg Latency: {np.mean(latencies):.3f} ms")

# Confusion matrix
cm = confusion_matrix(
    y_test,
    predictions
)

labels = [
    idx_to_label[i]
    for i in range(NUM_CLASSES)
]

disp = ConfusionMatrixDisplay(
    confusion_matrix=cm,
    display_labels=labels
)

disp.plot(xticks_rotation=45)

plt.tight_layout()

plt.savefig(
    "confusion_matrices/lstm_cm.png"
)

print("Saved confusion matrix.")