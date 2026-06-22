import pandas as pd

# Load existing file (NO headers currently)
df = pd.read_csv("my_data_v2.csv", header=None)

# Create column names
columns = (
    ["signer_id", "recording_id", "label", "frame_number"]
    + [f"f{i}" for i in range(136)]
)

# Verify column count
if len(columns) != df.shape[1]:
    raise ValueError(
        f"Expected {len(columns)} columns, found {df.shape[1]}"
    )

df.columns = columns

# Save back with headers
df.to_csv("my_data_v2.csv", index=False)

print("✅ Headers added successfully")
print(f"Rows: {len(df)}")
print(f"Columns: {len(df.columns)}")