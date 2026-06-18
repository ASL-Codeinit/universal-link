# Training Guide

## 1. Create Environment

```
python3.11 -m venv venv311
source venv311/bin/activate
pip install -r requirements-training.txt
```

---

## 2. Generate Sequences

```
python generate_sequences.py
```

This creates:

```
X.npy
y.npy
label_map.pkl
```

---

## 3. Verify Generated Dataset

```
python scripts-used/seq-gen_test.py
```

Confirm:

* Correct sequence shape
* Correct feature count
* No NaN values
* Valid class distribution

---

## 4. Train Model

```
python lstm_train.py
```

Training output includes:

* Training loss
* Training accuracy
* Test accuracy

---

## 5. Output

After training:

```
lstm_model.pt
```

is generated and ready for inference.

