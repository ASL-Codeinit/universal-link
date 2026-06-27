import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib

# Load
df = pd.read_csv('my_data_v2.csv')

# Label column
y = df['label']

# Feature columns only
X = df.iloc[:, 4:]  # f0 to f135

# Split
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# Train
print(f"Training on {len(X)} samples...")
model = RandomForestClassifier(
    n_estimators=200,
    random_state=42
)

model.fit(X_train, y_train)

# Evaluate
preds = model.predict(X_test)

acc = accuracy_score(y_test, preds)
print(f"\nModel Accuracy: {acc*100:.2f}%")
print("\nWord Breakdown:\n")
print(classification_report(y_test, preds))

# Save
joblib.dump(model, 'frame_based_model.pkl')
print("Model saved as frame_based_model.pkl")