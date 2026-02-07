// --- ROOM ID MANAGEMENT ---
function generateRoomID() {
    const part = () => Math.random().toString(36).substring(2, 6);
    return `${part()}-${part()}-${part()}`;
}

function getRoomFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('room');
}

function setRoomInURL(roomId) {
    const newUrl = `${window.location.pathname}?room=${roomId}`;
    window.history.replaceState({}, '', newUrl);
}

// Get or create room ID
let roomId = getRoomFromURL();
if (!roomId) {
    roomId = generateRoomID();
    setRoomInURL(roomId);
}

// Display room ID
document.getElementById('roomIdDisplay').textContent = roomId;

// Copy link function
function copyRoomLink() {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

// --- SOCKET.IO CONNECTION ---
const socket = io();

// Join the room
socket.emit('join-room', roomId);
updateStatus('Connected to server. Room: ' + roomId);

// --- WEBRTC SETUP ---
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

let pc = new RTCPeerConnection(configuration);
let localStream;
let isCallStarted = false;

// --- GET USER MEDIA ---
async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        document.getElementById('localVideo').srcObject = localStream;
        
        // Add tracks to peer connection
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
        
        updateStatus('Camera and microphone ready!');
    } catch (error) {
        console.error('Error accessing media devices:', error);
        updateStatus('Error: Could not access camera/microphone');
    }
}

// Initialize media on page load
initializeMedia();

// --- WEBRTC EVENT HANDLERS ---

// Handle incoming remote stream
pc.ontrack = (event) => {
    console.log('Received remote track');
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        updateStatus('Connected! Video call active.');
    }
};

// Handle ICE candidates
pc.onicecandidate = (event) => {
    if (event.candidate) {
        console.log('Sending ICE candidate');
        socket.emit('ice-candidate', {
            candidate: event.candidate,
            roomId: roomId
        });
    }
};

// Monitor connection state
pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    updateStatus(`Connection: ${pc.connectionState}`);
    
    if (pc.connectionState === 'connected') {
        updateStatus('✅ Connected! Video call is active.');
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        updateStatus('❌ Connection failed or disconnected.');
    }
};

// --- START CALL FUNCTION ---
async function startCall() {
    if (isCallStarted) {
        updateStatus('Call already started!');
        return;
    }
    
    isCallStarted = true;
    document.getElementById('startCallBtn').disabled = true;
    
    try {
        updateStatus('Creating offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        console.log('Sending offer to room:', roomId);
        socket.emit('offer', {
            offer: offer,
            roomId: roomId
        });
        
        updateStatus('Offer sent. Waiting for friend to join...');
    } catch (error) {
        console.error('Error creating offer:', error);
        updateStatus('Error starting call');
        isCallStarted = false;
        document.getElementById('startCallBtn').disabled = false;
    }
}

// --- SOCKET EVENT HANDLERS ---

// When another user connects to the room
socket.on('user-connected', (userId) => {
    console.log('User connected to room:', userId);
    updateStatus('Friend joined the room!');
});

// Handle incoming offer
socket.on('offer', async (data) => {
    console.log('Received offer from:', data.senderId);
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        updateStatus('Received offer. Creating answer...');
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('answer', {
            answer: answer,
            roomId: roomId
        });
        
        updateStatus('Answer sent. Establishing connection...');
    } catch (error) {
        console.error('Error handling offer:', error);
        updateStatus('Error processing offer');
    }
});

// Handle incoming answer
socket.on('answer', async (data) => {
    console.log('Received answer from:', data.senderId);
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        updateStatus('Answer received. Connecting...');
    } catch (error) {
        console.error('Error handling answer:', error);
        updateStatus('Error processing answer');
    }
});

// Handle incoming ICE candidates
socket.on('ice-candidate', async (candidate) => {
    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate');
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// --- UTILITY FUNCTIONS ---
function updateStatus(message) {
    document.getElementById('status').textContent = message;
    console.log('Status:', message);
}

// ============================================================
// MEDIAPIPE HANDS DETECTION
// ============================================================

let hands;
let isMediaPipeReady = false;

// Initialize MediaPipe Hands
function initializeMediaPipe() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    // Configure MediaPipe settings
    hands.setOptions({
        maxNumHands: 2,              // Detect up to 2 hands
        modelComplexity: 1,          // 0=lite, 1=full (balanced)
        minDetectionConfidence: 0.5, // Minimum confidence to detect hand
        minTrackingConfidence: 0.5   // Minimum confidence to track hand
    });

    // Set up the callback when hands are detected
    hands.onResults(onHandsDetected);

    isMediaPipeReady = true;
    console.log('✅ MediaPipe Hands initialized');
    
    // Start processing frames
    startHandDetection();
}

// Callback function when MediaPipe detects hands
function onHandsDetected(results) {
    const canvas = document.getElementById('localCanvas');
    const ctx = canvas.getContext('2d');
    
    console.log('🖐️ onHandsDetected called, hands found:', results.multiHandLandmarks?.length || 0);
    
    // Match canvas size to video size
    const video = document.getElementById('localVideo');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    console.log('Canvas size:', canvas.width, 'x', canvas.height);
    
    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the hand landmarks if detected
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        console.log('✅ Drawing', results.multiHandLandmarks.length, 'hand(s)');
        
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label; // "Left" or "Right"
            
            console.log('Drawing hand', i, '- Handedness:', handedness, '- Landmarks:', landmarks.length);
            
            // Draw connections between landmarks
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
                color: '#00FF00',
                lineWidth: 2
            });
            
            // Draw the landmark points
            drawLandmarks(ctx, landmarks, {
                color: '#FF0000',
                lineWidth: 1,
                radius: 3
            });
            
            // Extract and log the landmark data (21 points)
            const landmarkData = extractLandmarkData(landmarks, handedness);
            
            // ============================================
            // SEND TO ML MODEL (NEW!)
            // ============================================
            sendToMLModel(landmarkData);
            
            // Note: updateHandInfo() is commented out so predictions show instead
            // If you want to see landmark debug info, uncomment the line below:
            // updateHandInfo(landmarkData, handedness);
        }
    } else {
        // No hands detected
        console.log('❌ No hands detected in this frame');
        document.getElementById('localHandInfo').textContent = 'No hands detected';
        clearPredictionDisplay();
    }
}

// Extract landmark data in a format ready for ML model
function extractLandmarkData(landmarks, handedness) {
    // landmarks is an array of 21 points
    // Each point has x, y, z coordinates
    
    const data = {
        handedness: handedness, // "Left" or "Right"
        landmarks: [],
        flatArray: [] // Flattened array for ML model
    };
    
    // Extract each of the 21 landmarks
    for (let i = 0; i < landmarks.length; i++) {
        const point = landmarks[i];
        
        // Store as object (easier to read)
        data.landmarks.push({
            id: i,
            x: point.x,
            y: point.y,
            z: point.z
        });
        
        // Store as flat array (what ML models typically need)
        data.flatArray.push(point.x, point.y, point.z);
    }
    
    return data;
}

// Update the hand info display
function updateHandInfo(landmarkData, handedness) {
    const infoDiv = document.getElementById('localHandInfo');
    const numPoints = landmarkData.landmarks.length;
    
    // Show basic info
    infoDiv.innerHTML = `
        <strong>${handedness} Hand Detected</strong><br>
        Points: ${numPoints} | 
        Wrist: (${landmarkData.landmarks[0].x.toFixed(2)}, ${landmarkData.landmarks[0].y.toFixed(2)})
    `;
}

// Process video frames continuously
async function startHandDetection() {
    const video = document.getElementById('localVideo');
    const canvas = document.getElementById('processingCanvas');
    
    // Wait for video to be ready
    if (!video.videoWidth || !video.videoHeight) {
        setTimeout(startHandDetection, 100);
        return;
    }
    
    console.log('🎥 Starting hand detection...');
    
    // Process frames continuously
    async function detectFrame() {
        if (!isMediaPipeReady) return;
        
        try {
            // Send the video frame to MediaPipe
            await hands.send({ image: video });
        } catch (error) {
            console.error('Error processing frame:', error);
        }
        
        // Process next frame (runs continuously)
        requestAnimationFrame(detectFrame);
    }
    
    detectFrame();
}

// Initialize MediaPipe when page loads
// We'll call this after the camera is ready
window.addEventListener('load', () => {
    // Wait a bit for video to start, then initialize
    setTimeout(() => {
        if (typeof Hands !== 'undefined') {
            initializeMediaPipe();
        } else {
            console.error('MediaPipe Hands library not loaded');
        }
    }, 2000);
});

// ============================================================
// ML MODEL INTEGRATION (Python API)
// ============================================================

// ============================================
// CONFIGURATION - UPDATE THESE WHEN BACKEND IS READY
// ============================================

const API_CONFIG = {
    // PHASE 1: Development (Mock API for testing)
    MOCK_API: 'https://jsonplaceholder.typicode.com/posts',  // Placeholder
    
    // PHASE 2: Local Testing (Friend's API on localhost)
    LOCAL_API: 'http://localhost:5000/predict',
    
    // PHASE 3: Production (Friend's deployed API)
    PRODUCTION_API: 'https://your-friend-ml-api.onrender.com/predict',
    
    // Current active endpoint
    // Change this as you progress through phases
    ACTIVE: 'MOCK'  // Options: 'MOCK', 'LOCAL', 'PRODUCTION'
};

// Get the active API URL
function getAPIUrl() {
    switch(API_CONFIG.ACTIVE) {
        case 'MOCK':
            return API_CONFIG.MOCK_API;
        case 'LOCAL':
            return API_CONFIG.LOCAL_API;
        case 'PRODUCTION':
            return API_CONFIG.PRODUCTION_API;
        default:
            return API_CONFIG.MOCK_API;
    }
}

let lastPredictionTime = 0;
const PREDICTION_INTERVAL = 500; // Predict every 500ms (2 predictions per second)
let currentPrediction = null;
let apiCallCount = 0;
let successfulCalls = 0;
let failedCalls = 0;

// ============================================
// A. SEND LANDMARKS TO FRIEND'S BACKEND
// ============================================

async function sendToMLModel(landmarkData) {
    const now = Date.now();
    
    // Throttle predictions - don't predict every single frame
    if (now - lastPredictionTime < PREDICTION_INTERVAL) {
        return; // Skip this frame
    }
    
    lastPredictionTime = now;
    apiCallCount++;
    
    // The flat array your friend's model needs
    const landmarksArray = landmarkData.flatArray; // [x1, y1, z1, x2, y2, z2, ...] (63 numbers)
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 SENDING TO BACKEND (Call #' + apiCallCount + ')');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Endpoint:', getAPIUrl());
    console.log('Landmark count:', landmarksArray.length, 'values');
    console.log('Handedness:', landmarkData.handedness);
    console.log('Sample data:', landmarksArray.slice(0, 9), '...');
    
    try {
        // Prepare the request payload
        const requestPayload = {
            landmarks: landmarksArray,           // 63 numbers - FRIEND WILL USE THIS
            handedness: landmarkData.handedness, // "Left" or "Right"
            timestamp: now                        // When captured
        };
        
        console.log('Request payload:', requestPayload);
        
        // Make HTTP POST request to friend's backend
        const response = await fetch(getAPIUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // ============================================
        // B. RECEIVE INTERPRETED TEXT FROM FRIEND
        // ============================================
        
        const predictionData = await response.json();
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📥 RECEIVED FROM BACKEND');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Raw response:', predictionData);
        
        // Parse friend's response
        // Expected format: { sign: "Hello", confidence: 0.95 }
        const prediction = parseFriendResponse(predictionData, landmarkData.handedness);
        
        console.log('Parsed prediction:', prediction);
        console.log('✅ Success! API call completed.');
        
        successfulCalls++;
        
        // Display the prediction on screen
        displayPrediction(prediction);
        
        // Store current prediction
        currentPrediction = prediction;
        
        // Update statistics
        updateAPIStats();
        
    } catch (error) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ API ERROR');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Error details:', error.message);
        console.error('Full error:', error);
        
        failedCalls++;
        
        // Show error in UI
        displayError(error.message);
        
        // Update statistics
        updateAPIStats();
        
        // Optional: Fallback to mock prediction for testing UI
        if (API_CONFIG.ACTIVE === 'MOCK') {
            console.log('📝 Using mock prediction for testing...');
            const mockPrediction = generateMockPrediction(landmarkData.handedness);
            displayPrediction(mockPrediction);
        }
    }
}

// ============================================
// PARSE FRIEND'S RESPONSE
// ============================================

function parseFriendResponse(responseData, handedness) {
    /*
    This function handles different response formats your friend might send.
    Adapt this based on their actual API response structure.
    */
    
    // Expected format from friend:
    // { "sign": "Hello", "confidence": 0.95 }
    
    let sign = 'Unknown';
    let confidence = 0.0;
    
    // Handle different possible response formats
    if (responseData.sign && responseData.confidence !== undefined) {
        // Standard format
        sign = responseData.sign;
        confidence = responseData.confidence;
    } else if (responseData.prediction && responseData.score) {
        // Alternative format 1
        sign = responseData.prediction;
        confidence = responseData.score;
    } else if (responseData.label && responseData.probability) {
        // Alternative format 2
        sign = responseData.label;
        confidence = responseData.probability;
    } else if (typeof responseData === 'string') {
        // If they just send the sign as a string
        sign = responseData;
        confidence = 1.0;
    } else {
        // Mock API response (JSONPlaceholder returns different structure)
        sign = 'Mock-' + (responseData.id || 'Test');
        confidence = 0.85;
    }
    
    return {
        sign: sign,
        confidence: parseFloat(confidence),
        handedness: handedness,
        timestamp: Date.now()
    };
}

// ============================================
// MOCK PREDICTION (For Testing UI)
// ============================================

function generateMockPrediction(handedness) {
    /*
    This generates fake predictions for testing the UI
    while waiting for friend's backend.
    */
    const signs = [
        'Hello', 'Thank You', 'Yes', 'No', 'Please', 
        'Sorry', 'Help', 'Stop', 'Good', 'Bad'
    ];
    
    const randomSign = signs[Math.floor(Math.random() * signs.length)];
    const randomConfidence = 0.7 + Math.random() * 0.3; // 0.7 to 1.0
    
    return {
        sign: randomSign,
        confidence: randomConfidence,
        handedness: handedness,
        timestamp: Date.now(),
        isMock: true
    };
}

// ============================================
// DISPLAY PREDICTION ON SCREEN
// ============================================

function displayPrediction(prediction) {
    const infoDiv = document.getElementById('localHandInfo');
    
    const confidencePercent = (prediction.confidence * 100).toFixed(0);
    const confidenceColor = prediction.confidence > 0.8 ? '#4CAF50' : 
                           prediction.confidence > 0.6 ? '#FFA500' : '#FF5252';
    
    const mockBadge = prediction.isMock ? ' <span style="color: #FFA500;">[MOCK]</span>' : '';
    
    infoDiv.innerHTML = `
        <strong style="color: ${confidenceColor}; font-size: 16px;">
            ${prediction.sign}${mockBadge}
        </strong><br>
        <small>
            Confidence: ${confidencePercent}% | 
            Hand: ${prediction.handedness}
        </small>
    `;
}

// ============================================
// DISPLAY ERROR
// ============================================

function displayError(errorMessage) {
    const infoDiv = document.getElementById('localHandInfo');
    
    infoDiv.innerHTML = `
        <strong style="color: #FF5252;">⚠️ API Error</strong><br>
        <small>${errorMessage}</small>
    `;
}

// Clear prediction display when no hands detected
function clearPredictionDisplay() {
    currentPrediction = null;
    document.getElementById('localHandInfo').textContent = 'No hands detected';
}

// ============================================
// API STATISTICS (For Monitoring)
// ============================================

function updateAPIStats() {
    const successRate = apiCallCount > 0 
        ? ((successfulCalls / apiCallCount) * 100).toFixed(1) 
        : 0;
    
    console.log('📊 API Statistics:');
    console.log('  Total calls:', apiCallCount);
    console.log('  Successful:', successfulCalls);
    console.log('  Failed:', failedCalls);
    console.log('  Success rate:', successRate + '%');
}

// ============================================
// TESTING UTILITIES
// ============================================

// Test API connectivity (call this manually from console)
window.testMLAPI = async function() {
    console.log('🧪 Testing ML API connection...');
    console.log('Current endpoint:', getAPIUrl());
    
    const testLandmarks = Array(63).fill(0).map(() => Math.random());
    
    try {
        const response = await fetch(getAPIUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                landmarks: testLandmarks,
                handedness: 'Right',
                timestamp: Date.now()
            })
        });
        
        const data = await response.json();
        console.log('✅ API Test Successful!');
        console.log('Response:', data);
        return data;
    } catch (error) {
        console.error('❌ API Test Failed!');
        console.error('Error:', error.message);
        return null;
    }
};

// Switch between API modes (call from console)
window.switchAPIMode = function(mode) {
    const validModes = ['MOCK', 'LOCAL', 'PRODUCTION'];
    if (validModes.includes(mode)) {
        API_CONFIG.ACTIVE = mode;
        console.log('✅ Switched to', mode, 'mode');
        console.log('Current endpoint:', getAPIUrl());
    } else {
        console.error('❌ Invalid mode. Use: MOCK, LOCAL, or PRODUCTION');
    }
};

// ============================================
// INTEGRATION GUIDE FOR YOUR FRIEND
// ============================================
/*

STEP 1: Your friend creates their ML model function
-------------------------------------------------------
// File: ml-model.js (your friend creates this)

function predictSign(landmarkArray) {
    // landmarkArray is an array of 63 numbers:
    // [x1, y1, z1, x2, y2, z2, ..., x21, y21, z21]
    
    // Your friend's ML model code here
    // Example with TensorFlow.js:
    
    const tensor = tf.tensor2d([landmarkArray], [1, 63]);
    const prediction = model.predict(tensor);
    const predictedClass = prediction.argMax(-1).dataSync()[0];
    const confidence = prediction.max().dataSync()[0];
    
    const signLabels = ['Hello', 'Thank You', 'Yes', 'No', ...];
    
    return {
        sign: signLabels[predictedClass],
        confidence: confidence
    };
}


STEP 2: Import their model file in index.html
-------------------------------------------------------
<!-- Add before script.js -->
<script src="ml-model.js"></script>
<script src="script.js"></script>


STEP 3: Replace mockMLModel with their function
-------------------------------------------------------
In sendToMLModel() function above, change:

    const prediction = mockMLModel(inputArray, landmarkData.handedness);

To:

    const prediction = predictSign(inputArray);


STEP 4: Test!
-------------------------------------------------------
- Make a hand gesture
- See the predicted sign appear
- Check confidence level

*/