import numpy as np
import os
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader


# ── Settings ───────────────────────────────────────────────────

MODEL_SAVE_PATH = 'lstm_model.pt'
SEQUENCE_LENGTH = 20
INPUT_SIZE = 136
HIDDEN_SIZE = 64
NUM_LAYERS = 2
BATCH_SIZE = 32
EPOCHS = 50
LEARNING_RATE = 0.001

# ── Load Data ──────────────────────────────────────────────────
print("Loading data...")

X = np.load("X.npy")
y = np.load("y.npy")

print(X.shape)
print(y.shape)

# ── Load Label Map ──────────────────────────────────────────────
import pickle

with open("label_map.pkl", "rb") as f:
    label_map = pickle.load(f)

num_classes = len(label_map)

# ── Test/Train Split ─────────────────────────────────────────────
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

np.save("X_test.npy", X_test)
np.save("y_test.npy", y_test)

print(f"Train samples: {len(X_train)}")
print(f"Test samples: {len(X_test)}")
print(f"Classes: {num_classes}")
# ── PyTorch Dataset ────────────────────────────────────────────
class ASLDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.FloatTensor(X)  # (samples, 20, 136)
        self.y = torch.LongTensor(y)   # (samples,)
    
    def __len__(self):
        return len(self.X)
    
    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]

train_dataset = ASLDataset(X_train, y_train)
test_dataset  = ASLDataset(X_test, y_test)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
test_loader  = DataLoader(test_dataset,  batch_size=BATCH_SIZE, shuffle=False)

# ── LSTM Model ─────────────────────────────────────────────────
# PyTorch model saving/loading approaches:
#
# 1. Save only the model's state_dict (learned weights).
#    During inference, the model architecture (ASLModel) must be
#    recreated exactly and then populated using load_state_dict().
#    This approach is more portable, robust, and commonly used.
#
#    Save:
#       torch.save(model.state_dict(), "model.pt")
#
#    Load:
#       model = ASLModel(...)
#       model.load_state_dict(torch.load("model.pt"))
#
# 2. Alternative: Save the entire model object.
#    This removes the need to redefine the architecture during
#    inference, but is less portable and can break if code changes.
#
#    Save:
#       torch.save(model, "model.pt")
#
#    Load:
#       model = torch.load("model.pt")
#
# In this project, a checkpoint dictionary is used. It stores the
# state_dict along with metadata such as input_size, hidden_size,
# num_layers, num_classes, and class names, allowing the inference
# script to reconstruct the model automatically.
# ───────────────────────────────────────────────────────────────
class ASLModel(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, num_classes):
        super(ASLModel, self).__init__()
        
        self.lstm = nn.LSTM(
            input_size=input_size,   # 136 features per frame
            hidden_size=hidden_size, # 64 memory units
            num_layers=num_layers,   # 2 stacked LSTM layers
            batch_first=True,        # input shape: (batch, sequence, features)
            dropout=0.3              # prevent overfitting
        )
        
        self.fc = nn.Linear(hidden_size, num_classes)  # final classification layer
    
    def forward(self, x):
        # x shape: (batch, 20, 136)
        out, _ = self.lstm(x)        # out shape: (batch, 20, 64)
        out = out[:, -1, :]          # take last frame's output → (batch, 64)
        out = self.fc(out)           # → (batch, num_classes)
        return out

model = ASLModel(INPUT_SIZE, HIDDEN_SIZE, NUM_LAYERS, num_classes)
print(f"\nModel created!")
print(f"   Classes: {num_classes}")
print(f"   Parameters: {sum(p.numel() for p in model.parameters()):,}")

# ── Training ───────────────────────────────────────────────────
criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

print(f"\nTraining for {EPOCHS} epochs...")

for epoch in range(EPOCHS):
    # training phase
    model.train()
    train_loss = 0
    correct = 0
    total = 0
    
    for X_batch, y_batch in train_loader:
        optimizer.zero_grad()
        outputs = model(X_batch)
        loss = criterion(outputs, y_batch)
        loss.backward()
        optimizer.step()
        
        train_loss += loss.item()
        _, predicted = torch.max(outputs, 1)
        correct += (predicted == y_batch).sum().item()
        total += y_batch.size(0)
    
    train_acc = correct / total * 100
    
    # print every 10 epochs
    if (epoch + 1) % 10 == 0:
        # test phase
        model.eval()
        test_correct = 0
        test_total = 0
        
        with torch.no_grad():
            for X_batch, y_batch in test_loader:
                outputs = model(X_batch)
                _, predicted = torch.max(outputs, 1)
                test_correct += (predicted == y_batch).sum().item()
                test_total += y_batch.size(0)
        
        test_acc = test_correct / test_total * 100
        print(f"Epoch {epoch+1:3d}/{EPOCHS} | "
              f"Loss: {train_loss/len(train_loader):.4f} | "
              f"Train Acc: {train_acc:.1f}% | "
              f"Test Acc: {test_acc:.1f}%")

# ── Save Model ─────────────────────────────────────────────────
torch.save({
    'model_state_dict': model.state_dict(),
    'input_size': INPUT_SIZE,
    'hidden_size': HIDDEN_SIZE,
    'num_layers': NUM_LAYERS,
    'num_classes': num_classes,
    'classes': list(label_map.keys())
}, MODEL_SAVE_PATH)

print(f"\nModel saved to {MODEL_SAVE_PATH}!")
print(f"Label encoder saved to lstm_label_encoder.pkl!")
print(f"\nTraining complete!")