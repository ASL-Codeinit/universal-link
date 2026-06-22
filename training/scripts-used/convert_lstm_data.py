import csv
from pathlib import Path
import os
import numpy as np

# --------------------------------------------------
# Configuration
# --------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
LSTM_DATA_DIR = SCRIPT_DIR / "lstm_data"
OUTPUT_CSV = SCRIPT_DIR / "my_data_v2.csv"
SIGNER_ID = "sreya"

# --------------------------------------------------

def main():
    if not OUTPUT_CSV.exists():
        raise FileNotFoundError(
            f"{OUTPUT_CSV} not found. Create the dataset first."
        )

    if not LSTM_DATA_DIR.exists():
        raise FileNotFoundError(
            f"{LSTM_DATA_DIR} not found. Place your .npy recordings under this directory."
        )

    print(f"Loading recordings from: {LSTM_DATA_DIR}")
    print(f"Appending to: {OUTPUT_CSV}")

    rows_written = 0
    recordings_processed = 0

    with OUTPUT_CSV.open("a", newline="") as csvfile:
        writer = csv.writer(csvfile)

        for label in sorted(os.listdir(LSTM_DATA_DIR)):
            label_dir = LSTM_DATA_DIR / label
            if not label_dir.is_dir():
                continue

            print(f"\nProcessing label: {label}")

            for filename in sorted(os.listdir(label_dir)):
                if not filename.endswith(".npy"):
                    continue

                npy_path = label_dir / filename
                sequence = np.load(npy_path)

                if sequence.ndim != 2:
                    print(f"Skipping {npy_path} (invalid shape: {sequence.shape})")
                    continue

                if sequence.shape[1] != 136:
                    print(
                        f"Skipping {npy_path} "
                        f"(expected 136 features, got {sequence.shape[1]})"
                    )
                    continue

                recording_id = f"{SIGNER_ID}_{label}_{npy_path.stem}"

                for frame_number, frame_features in enumerate(sequence):
                    row = [
                        SIGNER_ID,
                        recording_id,
                        label,
                        frame_number,
                        *frame_features.tolist(),
                    ]
                    writer.writerow(row)
                    rows_written += 1

                recordings_processed += 1

    print("\nConversion complete!")
    print(f"Recordings processed: {recordings_processed}")
    print(f"Frames appended: {rows_written}")
    print(f"Updated dataset: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
