import pandas as pd

# Load old dataset
df = pd.read_csv("my_data.csv", header=None)

new_rows = []

current_label = None
frame_number = 0
recording_number = 0

signer_id = "rachel"  # Change if needed

for _, row in df.iterrows():

    label = str(row[0])

    # New recording starts whenever label changes
    if label != current_label:
        current_label = label
        recording_number += 1
        frame_number = 1

        recording_id = f"{signer_id}_{label}_{recording_number:03d}"

    else:
        frame_number += 1

    new_row = [
        signer_id,
        recording_id,
        label,
        frame_number
    ]

    new_row.extend(row[1:].tolist())

    new_rows.append(new_row)

new_df = pd.DataFrame(new_rows)

new_df.to_csv("my_data_v2.csv", index=False, header=False)

print("✅ Created my_data_v2.csv")
print(f"Rows: {len(new_df)}")
print(f"Columns: {len(new_df.columns)}")