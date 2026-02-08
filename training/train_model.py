import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib

# Load
df = pd.read_csv('my_data.csv', header=None)
X = df.iloc[:, 1:].values
y = df.iloc[:, 0].values

# Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train
print(f"Training on {len(X)} samples...")
model = RandomForestClassifier(n_estimators=200, random_state=42)
model.fit(X_train, y_train)

# Stats
acc = accuracy_score(y_test, model.predict(X_test))
print(f"\nModel Accuracy: {acc*100:.2f}%")
print("\nWord Breakdown:\n", classification_report(y_test, model.predict(X_test)))

# Save
joblib.dump(model, 'asl_model.pkl')
print("Model saved as asl_model.pkl")