# Migration to LSTM  - logs

## 1.Inspecting the Current Data
`Dataset Size`  
- 2000 total samples (rows)
- 10 sign words/classes
- 200 frames per word

`Sample Structure`  
- Each row represents 1 frame
- Format:
  Label + 136 features

`Feature Structure (136 features total)`  
- Left hand: 68 features
  - 63 normalized landmark coordinates (21 landmarks × x,y,z)
  - 5 fingertip-to-wrist distance features
- Right hand: 68 features
  - Similar
- Missing hand is represented by 68 zeros

`Normalization`  
- Landmarks are centered relative to the wrist
- Coordinates are scaled to reduce effects of hand size and camera distance

`Temporal Information`  
- Frames are stored in chronological order
- Each word has 200 consecutive frames
- Signs were repeatedly performed throughout the recording (of 10 seconds per sign)
- Temporal information is preserved and usable for sequence models (LSTM)

`Data Collection`  
- 1 signer
- 1 recording session per word
- No neutral/no-sign class

`Current Model`  
- Random Forest classifier
- Predicts among 10 sign words

`Weaknesses`  
- Single signer
- Single recording session per word
- No neutral/no-sign class
- Current Random Forest evaluation uses random frame splitting, causing data leakage and likely inflated accuracy

> Dataset is sufficient for building a sequence dataset and training a baseline LSTM.
> The primary future challenge is generalization to new signers and recording conditions, not dataset format.

---

## 2. Dataset Upgrade

Current Format: label,f1,f2,...,f136

Example: [hello,...], [hello,...]


This works for the current dataset because there is only: 1 signer and 1 recording per word  
It does not store: Who recorded the sign, which recording session a frame belongs to and the frame's position within the recording    

Proposed Format: [signer_id,recording_id,label,frame_number,f1,...,f136] 
Example: [rachel,rachel_hello_001,hello,1,...], [rachel,rachel_hello_001,hello,1,...]

Reason for Change: To support data from multiple signers, multiple recordings per sign, LSTM sequence generation, proper train/test evaluation, future dataset scalability

`NOTE`: The model will still only use the 136 hand features. The new fields are metadata used for dataset management, sequence reconstruction, and evaluation.

using: convert_dataset.py: Created my_data_v2.csv  
Rows: 2000, Columns: 140  

### Changes Made to final_record.py
1. Added signer_id
   - Tracks who performed the sign.
   - Enables multi-signer datasets.

2. Added recording_id
   - Unique ID for every recording session.
   - Example: reja_hello_20250714_213045

3. Added frame_number
   - Tracks the order of frames within a recording.
   - Required for sequence reconstruction.
   - The order of sequeucne represents progression of hand movement and it is important to preserve it

4. Updated dataset format - usues new format

5. Changed output file to my_data_v2.csv
   
6. Reduced recording length
   - 200 frames → 75 frames
   - Encourages more recordings and variation.

7. Added save/discard workflow
   - User can approve or reject a recording.
   - Prevents bad samples entering the dataset.

8. Changed save logic
   - Frames are stored temporarily in memory.
   - Written to CSV only if approved.

Unchanged
- MediaPipe hand tracking
- Handedness detection
- Wrist-based normalization
- Feature extraction logic
- 136-feature structure (68 left hand + 68 right hand)

Goal: Make the dataset sequence-aware and scalable for LSTM training while remaining compatible with the existing feature format.

### generate_sequences.py
1. Loads my_data_v2.csv

2. Groups frames by recording_id
   - Reconstructs each recording session.

3. Sorts frames using frame_number
   - Restores correct temporal order.

4. Creates sequences using a sliding window
   - Sequence length = 20 frames.
   - Example:
     Frames 1-20
     Frames 2-21
     Frames 3-22
     ...
   - currently the windows are overlapping because our dataset is too small
   - as we record more data, we will be able to genearte a sequnce of non overlapping or less overlapping windows

5. Converts labels to numbers
   - Example:
     hello → 1
     yes → 9

6. Generates:

   X.npy
   - Shape: (1810, 20, 136)
   - Contains motion sequences.

   y.npy
   - Shape: (1810,)
   - Contains labels for each sequence.

   label_map.pkl
   - Stores label ↔ number mapping.

Goal:Convert the frame-level dataset into an LSTM-ready sequence dataset.


**FYI: DATASET INTEGRATION FROM THE BRANCH lstm-model**: S's dataset was stored as individual .npy files: each file contained a complete 20-frame sign recording with 136 features per frame. Wrote a conversion script to transform these recordings into my_data_v2.csv format. After validating the conversion, I merged the data into the main dataset and regenerated the sequence files used for LSTM training.