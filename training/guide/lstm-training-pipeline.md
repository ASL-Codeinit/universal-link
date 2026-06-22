# LSTM Training Pipeline 

## Environment Setup

Before running any dataset or training scripts, create and activate a Python 3.11 virtual environment and install dependencies:

```
cd training
python3.11 -m venv venv311
source venv311/bin/activate
pip install -r requirements-training.txt
```

Then run the scripts from the activated environment.

The LSTM training pipeline uses the unified frame-level dataset (`my_data_v2.csv`) as the single source of truth. Each row in the dataset represents one frame and contains metadata (`signer_id`, `recording_id`, `label`, `frame_number`) along with 136 landmark-based features extracted from MediaPipe.

## Sequence Generation

Before training, `generate_sequences.py` reconstructs recordings by grouping rows using `recording_id` and sorting them by `frame_number`. A sliding window of length 20 is then applied to generate fixed-length motion sequences. Each sequence therefore has shape `(20, 136)` representing 20 consecutive frames of hand landmark features. The generated sequences are stored in:

* `X.npy` → sequence tensor of shape `(num_sequences, 20, 136)`
* `y.npy` → encoded class labels
* `label_map.pkl` → mapping between sign names and numeric class IDs

This preprocessing step ensures that temporal information is preserved while maintaining a consistent training format regardless of the original recording source.


## Train/Test Split

Sequences are loaded from `X.npy` and `y.npy` and split into training and testing sets using an 80/20 split:

* Training Set: 80%
* Test Set: 20%

The split uses stratified sampling (`stratify=y`) to preserve class distributions across both sets and a fixed random seed (`random_state=42`) for reproducibility.

## Model Architecture

The classifier is a sequence-based LSTM implemented in PyTorch.

Input:

* Sequence Length: 20 frames
* Features per Frame: 136

Architecture:

1. Two-layer LSTM

   * Input Size: 136
   * Hidden Size: 64
   * Number of Layers: 2
   * Dropout: 0.3
2. Fully Connected Classification Layer

   * Input: 64-dimensional final hidden representation
   * Output: Number of sign classes

During inference, the LSTM processes all 20 frames sequentially and produces a hidden representation for each frame. The final time-step output is used as a compact summary of the entire gesture and is passed through the classification layer to obtain class scores.

## Training Configuration

* Optimizer: Adam
* Learning Rate: 0.001
* Loss Function: CrossEntropyLoss
* Batch Size: 32
* Epochs: 50

Training is performed using mini-batch gradient descent. For each batch:

1. Forward pass through the LSTM
2. Compute classification loss
3. Backpropagate gradients
4. Update model parameters using Adam

Training accuracy is computed during each epoch. Test accuracy is evaluated every 10 epochs using a held-out test set with gradients disabled.

## Model Output

After training, the following information is saved:

* Learned model parameters (`model_state_dict`)
* Architecture configuration

  * input size
  * hidden size
  * number of layers
  * number of classes
* Class label mapping

The final model is exported as `lstm_model.pt`.

## Motivation for LSTM

The previous Random Forest classifier operated on individual frames and therefore learned static hand poses only. The LSTM processes a sequence of frames and can learn temporal motion patterns, making it more suitable for sign language recognition where movement and transitions between poses carry significant semantic information.
