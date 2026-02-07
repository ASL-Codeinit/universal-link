from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import os

app = Flask(__name__)
CORS(app)  # Allow requests from anywhere

# Load the trained model
print("Loading ML model...")
try:
    model = joblib.load('asl_model.pkl')
    print("✅ Model loaded successfully!")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    model = None

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'status': 'ASL API is running!',
        'endpoints': {
            '/predict': 'POST - Send landmarks for ASL prediction',
            '/health': 'GET - Check API health'
        }
    })

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({
            'error': 'Model not loaded. Please check server logs.'
        }), 500
    
    try:
        # Get data from frontend
        data = request.get_json()
        landmarks = data.get('landmarks')  # Array of 63 numbers
        handedness = data.get('handedness')  # "Left" or "Right"
        
        if not landmarks or len(landmarks) != 63:
            return jsonify({
                'error': 'Invalid landmarks data. Expected 63 values.'
            }), 400
        
        # Convert to numpy array
        landmarks_array = np.array(landmarks).reshape(1, -1)
        
        # Predict
        prediction = model.predict(landmarks_array)[0]
        probabilities = model.predict_proba(landmarks_array)
        confidence = float(np.max(probabilities))
        
        # Return prediction
        return jsonify({
            'sign': prediction,
            'confidence': confidence,
            'handedness': handedness
        })
    
    except Exception as e:
        print(f"Error during prediction: {str(e)}")
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None
    })

if __name__ == '__main__':
    # Use PORT from environment variable (Render provides this)
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)