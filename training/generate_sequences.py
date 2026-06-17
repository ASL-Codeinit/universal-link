"""
generate_sequences.py

Converts a frame-level landmark dataset (my_data_v2.csv) into a sequence dataset suitable for LSTM training.

Pipeline:
    Frame dataset -> Recording reconstruction -> Sequence generation -> X, y arrays

"""

import pickle # for saving label_map
import numpy as np # for numerical operations and saving arrays
import pandas as pd # for reading CSV and manipulating dataframes

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
INPUT_CSV = "my_data_v2.csv"
SEQUENCE_LENGTH = 20

OUT_X = "X.npy"
OUT_Y = "y.npy"
OUT_LABEL_MAP = "label_map.pkl"

METADATA_COLS = ["signer_id", "recording_id", "label", "frame_number"]


def load_dataset(path: str) -> pd.DataFrame:
    """Load dataset into pandas.
    """
    df = pd.read_csv(path, header=0) # first row contains column names

    df["frame_number"] = df["frame_number"].astype(int)  # ensure frame_number is integer for sorting
    return df




def get_feature_columns(df: pd.DataFrame) -> list:
    """Step -2  Separate metadata from features.(Everything that is not a metadata column is treated as a feature.)
    """
    feature_cols = [c for c in df.columns if c not in METADATA_COLS]
    return feature_cols


def build_label_map(df: pd.DataFrame) -> dict:
    """Step 7 — Encode labels (build mapping, deterministic order)."""
    unique_labels = sorted(df["label"].unique())
    label_map = {label: idx for idx, label in enumerate(unique_labels)}
    return label_map


def generate_sequences(df: pd.DataFrame, feature_cols: list, label_map: dict,
                        sequence_length: int = SEQUENCE_LENGTH):
    """Steps 3-8: Group by recording, sort frames, slide window, assign labels."""
    X_list = []
    y_list = []

    # Step 3 — Group by recording_id
    for recording_id, group in df.groupby("recording_id"):

        # Step 4 — Sort frames by frame_number (defensive, in case of shuffling)
        group = group.sort_values("frame_number")

        features = group[feature_cols].to_numpy(dtype=np.float32)
        num_frames = features.shape[0]

        if num_frames < sequence_length:
            # Not enough frames in this recording to form a single sequence.
            continue

        label = group["label"].iloc[0]
        encoded_label = label_map[label]

        # Step 5 — Sliding window sequence generation (never crosses recordings,
        # since `features` here only contains frames from this one recording_id)
        for start in range(0, num_frames - sequence_length + 1):
            end = start + sequence_length
            window = features[start:end]  # shape: (sequence_length, num_features)
            X_list.append(window)
            y_list.append(encoded_label)  # Step 6 — assign label to sequence

    # Step 8 — Build final arrays
    X = np.stack(X_list, axis=0) if X_list else np.empty((0, sequence_length, len(feature_cols)), dtype=np.float32)
    y = np.array(y_list, dtype=np.int64)

    return X, y


def save_outputs(X: np.ndarray, y: np.ndarray, label_map: dict):
    """Step 9 — Save X, y, and label_map to disk."""
    np.save(OUT_X, X)
    np.save(OUT_Y, y)
    with open(OUT_LABEL_MAP, "wb") as f:
        pickle.dump(label_map, f)


def main():
    df = load_dataset(INPUT_CSV)
    feature_cols = get_feature_columns(df)
    label_map = build_label_map(df)

    X, y = generate_sequences(df, feature_cols, label_map, SEQUENCE_LENGTH)

    save_outputs(X, y, label_map)

    print(f"Feature columns: {len(feature_cols)}")
    print(f"Label map: {label_map}")
    print(f"X.shape: {X.shape}")
    print(f"y.shape: {y.shape}")


if __name__ == "__main__":
    main()

"""
REGRADING THE OUTPUT

X.npy
------
Shape: (1810, 20, 136). Contains the training sequences.

Example:
X[0] =

[
  Frame 1  -> [136 features]
  Frame 2  -> [136 features]
  Frame 3  -> [136 features]
  ...
  Frame 20 -> [136 features]
]

These 20 consecutive frames might come from:
recording_id = reja_hello_001
So X[0] represents a short motion segment of the sign "hello".


y.npy
------
Shape: (1810,). Contains the correct label for each sequence in X.npy.

Example:
label_map = {
    "father": 0,
    "hello": 1,
    "help": 2,
    ...
}

Therefore:

y[0] = 1
meaning:
X[0] → hello


How they are used
-----------------

During training:
Input:
    X[0]
    (20 frames of hand movement)
Target:
    y[0]
    (hello)

The LSTM sees:
20-frame motion sequence
        ↓
Predict sign
        ↓
hello

and gradually learns the motion patterns associated with each sign.
"""