import os
import numpy as np
from collections import Counter

SEQUENCE_LENGTH = 20
FEATURES_PER_FRAME = 136

X_PATH = "../X.npy"
Y_PATH = "../y.npy"

print("Checking generated sequence dataset...\n")

# --------------------------------------------------
# File existence
# --------------------------------------------------
if not os.path.exists(X_PATH):
    raise FileNotFoundError(f"Missing {X_PATH}")

if not os.path.exists(Y_PATH):
    raise FileNotFoundError(f"Missing {Y_PATH}")

# --------------------------------------------------
# Load data
# --------------------------------------------------
X = np.load(X_PATH)
y = np.load(Y_PATH)

print(f"X shape: {X.shape}")
print(f"y shape: {y.shape}")

# --------------------------------------------------
# Basic checks
# --------------------------------------------------
assert len(X) == len(y), (
    f"Sample mismatch: X={len(X)} y={len(y)}"
)

assert X.ndim == 3, (
    f"Expected X shape (samples, seq_len, features), got {X.shape}"
)

assert y.ndim == 1, (
    f"Expected y shape (samples,), got {y.shape}"
)

assert X.shape[1] == SEQUENCE_LENGTH, (
    f"Expected sequence length {SEQUENCE_LENGTH}, got {X.shape[1]}"
)

assert X.shape[2] == FEATURES_PER_FRAME, (
    f"Expected {FEATURES_PER_FRAME} features/frame, got {X.shape[2]}"
)

# --------------------------------------------------
# Data sanity checks
# --------------------------------------------------
if np.isnan(X).any():
    raise ValueError("NaN values detected in X")

if np.isinf(X).any():
    raise ValueError("Infinite values detected in X")

# --------------------------------------------------
# Statistics
# --------------------------------------------------
print("\nDataset Summary")
print("-" * 40)
print(f"Samples: {len(X)}")
print(f"Sequence Length: {X.shape[1]}")
print(f"Features Per Frame: {X.shape[2]}")

print(f"\nFeature Range:")
print(f"Min: {X.min():.4f}")
print(f"Max: {X.max():.4f}")
print(f"Mean: {X.mean():.4f}")

# --------------------------------------------------
# Class distribution
# --------------------------------------------------
print("\nClass Distribution")
print("-" * 40)

counts = Counter(y)

for label, count in sorted(counts.items()):
    print(f"Class {label}: {count}")

print("\nAll checks passed.")
