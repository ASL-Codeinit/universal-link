# SignLink Data Collection Instructions

## Environment Setup

From the repository root, create and activate a Python 3.11 virtual environment and install dependencies:

```
cd training
python3.11 -m venv venv311
source venv311/bin/activate
pip install -r requirements-training.txt
```

1. Run the data collection script from the `training` folder:
   cd training
   source venv311/bin/activate
   python collect_data.py

2. Enter your signer ID when prompted.
   Example:alice, friend1

3. Enter the word to record.
   - **Tip**: After recording a word, just press Enter (without typing) to repeat the same word again. Type a new word to switch to a different word.

4. Wait for the countdown to finish.

5. Perform the sign naturally and repeatedly until recording reaches 20/20.

6. Keep your hand(s) fully visible in the camera frame throughout the recording.

7. Record each word multiple times(and try to have each word be repeated the same number of times), preferably under slightly different conditions: 
   - Different speeds
   - Slightly different positions
   - Different lighting
   - Different camera distances

8. Complete the entire 200-frame recording before moving to the next word.

9. Repeat for all assigned words.

10. Type "exit" when finished.

Notes:
- Use the same signer ID for all recordings by the same person.
- Each recording session automatically receives a unique recording ID.
- Do not intentionally exaggerate signs; perform them as naturally as possible.
- If tracking fails or the sign is performed incorrectly, delete that recording and record it again.