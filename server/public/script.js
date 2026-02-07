// ============================================================
// USER MODE SELECTION
// ============================================================

let userMode = null; // 'signer' or 'speaker'

function selectMode(mode) {
    userMode = mode;
    
    // Update UI
    document.getElementById('signerMode').classList.remove('selected');
    document.getElementById('speakerMode').classList.remove('selected');
    
    if (mode === 'signer') {
        document.getElementById('signerMode').classList.add('selected');
        updateStatus('You selected: Sign Language User - Your signs will be interpreted');
        
        // Show detection indicator on local video
        document.getElementById('localDetection').style.display = 'flex';
    } else {
        document.getElementById('speakerMode').classList.add('selected');
        updateStatus('You selected: Verbal Speaker - You\'ll see subtitles of signs');
        
        // Show subtitles on remote video
        document.getElementById('remoteSubtitles').style.display = 'block';
    }
    
    console.log('User mode set to:', mode);
}

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
    if (!userMode) {
        alert('Please select your communication mode first!');
        return;
    }
    
    if (isCallStarted) {
        updateStatus('Call already started!');
        return;
    }
    
    isCallStarted = true;
    document.getElementById('startCallBtn').disabled = true;
    
    // Send mode to other user
    socket.emit('user-mode', {
        roomId: roomId,
        mode: userMode
    });
    
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

// Receive remote user's mode
socket.on('remote-user-mode', (data) => {
    console.log('Remote user mode:', data.mode);
    
    // If they're a signer, we should show subtitles
    if (data.mode === 'signer' && userMode === 'speaker') {
        document.getElementById('remoteSubtitles').style.display = 'block';
    }
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

// ============================================
// RECEIVE REMOTE USER'S SIGN PREDICTION
// ============================================

socket.on('remote-sign-prediction', (data) => {
    console.log('📥 Received sign from remote user:', data.prediction);
    
    // Only display if we're a speaker (we want to see their signs)
    if (userMode === 'speaker') {
        displayRemoteSubtitles(data.prediction);
        addToTranscript(data.prediction.sign);
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
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
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
    
    // Match canvas size to video size
    const video = document.getElementById('localVideo');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the hand landmarks if detected
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label;
            
            // Draw connections between landmarks (ALWAYS draw, regardless of mode)
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
                color: '#00FF00',
                lineWidth: 2
            });
            
            // Draw the landmark points (ALWAYS draw, regardless of mode)
            drawLandmarks(ctx, landmarks, {
                color: '#FF0000',
                lineWidth: 1,
                radius: 3
            });
            
            // Only process for interpretation if user is a signer
            if (userMode === 'signer') {
                // Update detection indicator
                const indicator = document.getElementById('localDetection');
                indicator.classList.remove('inactive');
                indicator.innerHTML = '<span class="pulse-dot"></span><span>Detecting ✓</span>';
                
                // Extract landmark data
                const landmarkData = extractLandmarkData(landmarks, handedness);
                
                // Send to ML model
                sendToMLModel(landmarkData);
            }
        }
    } else {
        // No hands detected
        if (userMode === 'signer') {
            const indicator = document.getElementById('localDetection');
            indicator.classList.add('inactive');
            indicator.innerHTML = '<span class="pulse-dot"></span><span>Detecting...</span>';
        }
    }
}

// Extract landmark data
function extractLandmarkData(landmarks, handedness) {
    const data = {
        handedness: handedness,
        landmarks: [],
        flatArray: []
    };
    
    for (let i = 0; i < landmarks.length; i++) {
        const point = landmarks[i];
        data.landmarks.push({
            id: i,
            x: point.x,
            y: point.y,
            z: point.z
        });
        data.flatArray.push(point.x, point.y, point.z);
    }
    
    return data;
}

// Process video frames continuously
async function startHandDetection() {
    const video = document.getElementById('localVideo');
    
    if (!video.videoWidth || !video.videoHeight) {
        setTimeout(startHandDetection, 100);
        return;
    }
    
    console.log('🎥 Starting hand detection...');
    
    async function detectFrame() {
        if (!isMediaPipeReady) return;
        
        try {
            await hands.send({ image: video });
        } catch (error) {
            console.error('Error processing frame:', error);
        }
        
        requestAnimationFrame(detectFrame);
    }
    
    detectFrame();
}

// Initialize MediaPipe when page loads
window.addEventListener('load', () => {
    setTimeout(() => {
        if (typeof Hands !== 'undefined') {
            initializeMediaPipe();
        } else {
            console.error('MediaPipe Hands library not loaded');
        }
    }, 2000);
});

// ============================================================
// ML MODEL INTEGRATION
// ============================================================

const API_CONFIG = {
    MOCK_API: 'https://jsonplaceholder.typicode.com/posts',
    LOCAL_API: 'http://localhost:5000/predict',
    PRODUCTION_API: 'https://your-friend-ml-api.onrender.com/predict',
    ACTIVE: 'MOCK'  // Change to 'LOCAL' or 'PRODUCTION' when ready
};

function getAPIUrl() {
    switch(API_CONFIG.ACTIVE) {
        case 'MOCK': return API_CONFIG.MOCK_API;
        case 'LOCAL': return API_CONFIG.LOCAL_API;
        case 'PRODUCTION': return API_CONFIG.PRODUCTION_API;
        default: return API_CONFIG.MOCK_API;
    }
}

let lastPredictionTime = 0;
const PREDICTION_INTERVAL = 1000; // 1 prediction per second
let currentPrediction = null;
let apiCallCount = 0;
let successfulCalls = 0;
let failedCalls = 0;

// Send landmarks to ML model
async function sendToMLModel(landmarkData) {
    const now = Date.now();
    
    if (now - lastPredictionTime < PREDICTION_INTERVAL) {
        return;
    }
    
    lastPredictionTime = now;
    apiCallCount++;
    
    const landmarksArray = landmarkData.flatArray;
    
    console.log('📤 Sending to ML model (Call #' + apiCallCount + ')');
    
    try {
        const requestPayload = {
            landmarks: landmarksArray,
            handedness: landmarkData.handedness,
            timestamp: now
        };
        
        const response = await fetch(getAPIUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const predictionData = await response.json();
        const prediction = parseFriendResponse(predictionData, landmarkData.handedness);
        
        console.log('✅ Prediction received:', prediction);
        successfulCalls++;
        
        // Send to remote user
        sendPredictionToRemote(prediction);
        
        // Also display on OWN screen (signer sees their own interpretation)
        displayLocalSubtitles(prediction);
        
        // Add to transcript
        addToTranscript(prediction.sign);
        
        currentPrediction = prediction;
        updateAPIStats();
        
    } catch (error) {
        console.error('❌ API Error:', error.message);
        failedCalls++;
        updateAPIStats();
        
        // Fallback to mock for testing
        if (API_CONFIG.ACTIVE === 'MOCK') {
            const mockPrediction = generateMockPrediction(landmarkData.handedness);
            sendPredictionToRemote(mockPrediction);
            displayLocalSubtitles(mockPrediction);
            addToTranscript(mockPrediction.sign);
        }
    }
}

// Send prediction to remote user
function sendPredictionToRemote(prediction) {
    console.log('📤 Sending prediction to remote user:', prediction);
    
    socket.emit('sign-prediction', {
        roomId: roomId,
        prediction: {
            sign: prediction.sign,
            confidence: prediction.confidence,
            handedness: prediction.handedness,
            timestamp: prediction.timestamp || Date.now()
        }
    });
}

// Display remote user's signs as subtitles
function displayRemoteSubtitles(prediction) {
    const subtitleText = document.getElementById('remoteSubtitleText');
    
    const confidencePercent = (prediction.confidence * 100).toFixed(0);
    const confidenceColor = prediction.confidence > 0.8 ? '#4CAF50' : 
                           prediction.confidence > 0.6 ? '#FFA500' : '#FF5252';
    
    const mockBadge = prediction.isMock ? ' <span style="color: #FFA500; font-size: 14px;">[TEST]</span>' : '';
    
    subtitleText.innerHTML = `
        ${prediction.sign}${mockBadge}
        <div class="subtitle-confidence" style="color: ${confidenceColor};">
            Confidence: ${confidencePercent}%
        </div>
    `;
}

// Display YOUR OWN signs as subtitles on your local screen
function displayLocalSubtitles(prediction) {
    const localSubtitles = document.getElementById('localSubtitles');
    
    // Make sure subtitles are visible
    localSubtitles.style.display = 'block';
    
    const localSubtitleText = document.getElementById('localSubtitleText');
    
    const confidencePercent = (prediction.confidence * 100).toFixed(0);
    const confidenceColor = prediction.confidence > 0.8 ? '#4CAF50' : 
                           prediction.confidence > 0.6 ? '#FFA500' : '#FF5252';
    
    const mockBadge = prediction.isMock ? ' <span style="color: #FFA500; font-size: 14px;">[TEST]</span>' : '';
    
    localSubtitleText.innerHTML = `
        ${prediction.sign}${mockBadge}
        <div class="subtitle-confidence" style="color: ${confidenceColor};">
            Confidence: ${confidencePercent}%
        </div>
    `;
}

// Parse response from ML API
function parseFriendResponse(responseData, handedness) {
    let sign = 'Unknown';
    let confidence = 0.0;
    
    if (responseData.sign && responseData.confidence !== undefined) {
        sign = responseData.sign;
        confidence = responseData.confidence;
    } else if (responseData.prediction && responseData.score) {
        sign = responseData.prediction;
        confidence = responseData.score;
    } else if (responseData.label && responseData.probability) {
        sign = responseData.label;
        confidence = responseData.probability;
    } else if (typeof responseData === 'string') {
        sign = responseData;
        confidence = 1.0;
    } else {
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

// Generate mock predictions for testing
function generateMockPrediction(handedness) {
    const signs = [
        'Hello', 'Thank You', 'Yes', 'No', 'Please', 
        'Sorry', 'Help', 'Stop', 'Good', 'Bad'
    ];
    
    const randomSign = signs[Math.floor(Math.random() * signs.length)];
    const randomConfidence = 0.7 + Math.random() * 0.3;
    
    return {
        sign: randomSign,
        confidence: randomConfidence,
        handedness: handedness,
        timestamp: Date.now(),
        isMock: true
    };
}

// API statistics
function updateAPIStats() {
    const successRate = apiCallCount > 0 
        ? ((successfulCalls / apiCallCount) * 100).toFixed(1) 
        : 0;
    
    console.log('📊 API Statistics:');
    console.log('  Total:', apiCallCount);
    console.log('  Success:', successfulCalls);
    console.log('  Failed:', failedCalls);
    console.log('  Rate:', successRate + '%');
}

// ============================================
// TRANSCRIPT
// ============================================

let transcript = [];

function addToTranscript(sign) {
    const timestamp = new Date().toLocaleTimeString();
    transcript.push({ sign, timestamp });
    updateTranscriptDisplay();
}

function updateTranscriptDisplay() {
    const content = document.getElementById('transcriptContent');
    
    if (transcript.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: #999;">Sign language translations will appear here...</p>';
        return;
    }
    
    content.innerHTML = transcript.slice(-20).map(entry => `
        <div class="transcript-entry">
            <strong>${entry.sign}</strong>
            <span class="timestamp">${entry.timestamp}</span>
        </div>
    `).join('');
    
    content.scrollTop = content.scrollHeight;
}

function clearTranscript() {
    transcript = [];
    updateTranscriptDisplay();
}

// ============================================
// TESTING UTILITIES
// ============================================

window.testMLAPI = async function() {
    console.log('🧪 Testing ML API...');
    console.log('Endpoint:', getAPIUrl());
    
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
        console.log('✅ Success!', data);
        return data;
    } catch (error) {
        console.error('❌ Failed!', error);
        return null;
    }
};

window.switchAPIMode = function(mode) {
    const validModes = ['MOCK', 'LOCAL', 'PRODUCTION'];
    if (validModes.includes(mode)) {
        API_CONFIG.ACTIVE = mode;
        console.log('✅ Switched to', mode);
        console.log('Endpoint:', getAPIUrl());
    } else {
        console.error('❌ Invalid mode. Use: MOCK, LOCAL, or PRODUCTION');
    }
};