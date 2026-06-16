import numpy as np
import os
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import LabelEncoder
import joblib

# ── Settings ───────────────────────────────────────────────────
DATA_DIR = 'lstm_data'
MODEL_SAVE_PATH = 'lstm_model.pt'
SEQUENCE_LENGTH = 20
INPUT_SIZE = 136
HIDDEN_SIZE = 64
NUM_LAYERS = 2
BATCH_SIZE = 32
EPOCHS = 50
LEARNING_RATE = 0.001

# ── Load Data ──────────────────────────────────────────────────
print("📂 Loading data...")

sequences = []
labels = []

words = os.listdir(DATA_DIR)
print(f"Found words: {words}")

for word in words:
    word_dir = os.path.join(DATA_DIR, word)
    files = os.listdir(word_dir)
    print(f"  {word}: {len(files)} samples")
    
    for file in files:
        if file.endswith('.npy'):
            path = os.path.join(word_dir, file)
            sequence = np.load(path)  # shape (20, 136)
            sequences.append(sequence)
            labels.append(word)

sequences = np.array(sequences)  # shape (total_samples, 20, 136)
labels = np.array(labels)

print(f"\n✅ Total samples: {len(sequences)}")
print(f"✅ Data shape: {sequences.shape}")

# ── Encode Labels ──────────────────────────────────────────────
le = LabelEncoder()
encoded_labels = le.fit_transform(labels)
print(f"✅ Classes: {le.classes_}")

# save label encoder so api.py can decode predictions
joblib.dump(le, 'lstm_label_encoder.pkl')
print("✅ Label encoder saved!")

# ── Train/Test Split (no shuffle — keep sequences intact) ──────
split = int(0.8 * len(sequences))

X_train = sequences[:split]
X_test  = sequences[split:]
y_train = encoded_labels[:split]
y_test  = encoded_labels[split:]

print(f"\n📊 Train samples: {len(X_train)}")
print(f"📊 Test samples:  {len(X_test)}")

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

num_classes = len(le.classes_)
model = ASLModel(INPUT_SIZE, HIDDEN_SIZE, NUM_LAYERS, num_classes)
print(f"\n🧠 Model created!")
print(f"   Classes: {num_classes}")
print(f"   Parameters: {sum(p.numel() for p in model.parameters()):,}")

# ── Training ───────────────────────────────────────────────────
criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

print(f"\n🚀 Training for {EPOCHS} epochs...")

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
    'classes': le.classes_.tolist()
}, MODEL_SAVE_PATH)

print(f"\n✅ Model saved to {MODEL_SAVE_PATH}!")
print(f"✅ Label encoder saved to lstm_label_encoder.pkl!")
print(f"\n🎉 Training complete!")