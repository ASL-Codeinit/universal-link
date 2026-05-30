// ============================================================
// USER MODE SETUP FROM SESSION STORAGE
// ============================================================

// Global variables
let userMode = 'speaker';
let roomId = null;
let socket = null;

// Control button states
let isMicMuted = false;
let isCameraMuted = false;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Get user mode from sessionStorage (set in start.html)
    userMode = sessionStorage.getItem('userMode') || 'speaker';
    console.log('User mode:', userMode);

    // Get or create room ID
    roomId = getRoomFromURL();
    if (!roomId) {
        roomId = generateRoomID();
        setRoomInURL(roomId);
    }

    // Display room ID
    const roomIdDisplay = document.getElementById('roomIdDisplay');
    if (roomIdDisplay) {
        roomIdDisplay.textContent = roomId;
    }

    // Initialize socket connection
    socket = io();
    
    // Join the room
    socket.emit('join-room', roomId);
    console.log('Joined room:', roomId);
    
    // Set up socket event handlers
    setupSocketHandlers();

    // Show appropriate UI based on mode
    const localDetection = document.getElementById('localDetection');
    const localSubtitles = document.getElementById('localSubtitles');
    const remoteSubtitles = document.getElementById('remoteSubtitles');
    
    if (userMode === 'signer') {
        if (localDetection) localDetection.style.display = 'flex';
        if (localSubtitles) localSubtitles.style.display = 'block';
    } else {
        if (remoteSubtitles) remoteSubtitles.style.display = 'block';
    }
    
    // Initialize media after DOM is ready
    initializeMedia();
});

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

// Copy link function
function copyRoomLink() {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
        const btn = document.querySelector('.copy-btn-small');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    });
}

// Update status function
function updateStatus(message) {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = message;
    }
    console.log('Status:', message);
}

// Update status function
function updateStatus(message) {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = message;
    }
    console.log('Status:', message);
}

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
        
        // Initialize MediaPipe if user is a signer
        if (userMode === 'signer') {
            setTimeout(() => {
                if (typeof Hands !== 'undefined') {
                    initializeMediaPipe();
                } else {
                    console.error('MediaPipe Hands library not loaded');
                }
            }, 1000);
        }
        
        // Auto-start call
        setTimeout(() => startCall(), 1000);
    } catch (error) {
        console.error('Error accessing media devices:', error);
        updateStatus('Error: Could not access camera/microphone');
    }
}

// NOTE: initializeMedia() is called from DOMContentLoaded listener above

// --- WEBRTC EVENT HANDLERS ---

// Handle incoming remote stream
pc.ontrack = (event) => {
    console.log('📹 Received remote track:', event.track.kind);
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        console.log('✅ Remote video stream attached');
        updateStatus('Connected! Video call active.');
        
        // Hide status message
        const statusMsg = document.getElementById('statusMessage');
        if (statusMsg) {
            statusMsg.style.display = 'none';
        }
        
        // Update remote name
        const remoteName = document.getElementById('remoteName');
        if (remoteName) {
            remoteName.textContent = 'Friend';
        }
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
    }
}

// --- SOCKET EVENT HANDLERS ---
function setupSocketHandlers() {
    // When another user connects to the room
    socket.on('user-connected', (userId) => {
        console.log('✅ User connected to room:', userId);
        updateStatus('Friend joined the room!');
        
        // Update remote name
        const remoteName = document.getElementById('remoteName');
        if (remoteName) {
            remoteName.textContent = 'Friend Connected';
        }
    });

    // Receive remote user's mode
    socket.on('remote-user-mode', (data) => {
        console.log('👤 Remote user mode:', data.mode);
        
        // If they're a signer, we should show subtitles
        if (data.mode === 'signer' && userMode === 'speaker') {
            const remoteSubtitles = document.getElementById('remoteSubtitles');
            if (remoteSubtitles) {
                remoteSubtitles.style.display = 'block';
                console.log('📺 Showing remote subtitles for signer');
            }
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

    // Handle remote sign predictions
    socket.on('remote-sign-prediction', (data) => {
        console.log('🤟 Received remote sign prediction:', data.prediction);
        
        // Make sure remote subtitles are visible
        const remoteSubtitles = document.getElementById('remoteSubtitles');
        if (remoteSubtitles) {
            remoteSubtitles.style.display = 'block';
        }
        
        displayRemoteSubtitles(data.prediction);
        addToTranscript(data.prediction.sign);
    });
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
    
    const video = document.getElementById('localVideo');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        
        // always draw skeleton for all detected hands
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
                color: '#00FF00', lineWidth: 2
            });
            drawLandmarks(ctx, landmarks, {
                color: '#FF0000', lineWidth: 1, radius: 3
            });
        }

        // only process for ML if user is signer
        if (userMode === 'signer') {
            const indicator = document.getElementById('localDetection');
            indicator.classList.remove('inactive');
            indicator.innerHTML = '<span class="pulse-dot"></span><span>Detecting ✓</span>';

            // build 136 feature array — left hand + right hand
            let leftFeatures  = new Array(68).fill(0);  // default zeros
            let rightFeatures = new Array(68).fill(0);  // default zeros

            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks  = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i].label;
                const features   = extractRobustFeatures(landmarks);

                if (handedness === 'Left') {
                    leftFeatures = features;
                } else if (handedness === 'Right') {
                    rightFeatures = features;
                }
            }

            // combine both hands into 136 values
            const allFeatures = [...leftFeatures, ...rightFeatures];

            // send to ML model
            sendToMLModel({
                flatArray: allFeatures,
                handedness: 'Both'
            });
        }

    } else {
        if (userMode === 'signer') {
            const indicator = document.getElementById('localDetection');
            indicator.classList.add('inactive');
            indicator.innerHTML = '<span class="pulse-dot"></span><span>Detecting...</span>';
        }
    }
}

// Extract landmark data
// Extract robust features matching Python training format
function extractRobustFeatures(landmarks) {
    // step 1 - center on wrist
    const wrist = landmarks[0];
    let centered = landmarks.map(lm => ({
        x: lm.x - wrist.x,
        y: lm.y - wrist.y,
        z: lm.z - wrist.z
    }));

    // step 2 - find max value (normalise by hand size)
    let maxVal = Math.max(...centered.flatMap(p => 
        [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)]
    ));
    if (maxVal === 0) maxVal = 1e-5;

    // step 3 - divide everything by max
    let normalised = centered.map(p => ({
        x: p.x / maxVal,
        y: p.y / maxVal,
        z: p.z / maxVal
    }));

    // step 4 - flatten to 63 values
    let features = normalised.flatMap(p => [p.x, p.y, p.z]);

    // step 5 - add 5 fingertip distances (total 68)
    const tipIds = [4, 8, 12, 16, 20];
    for (const tipId of tipIds) {
        const tip = normalised[tipId];
        const distance = Math.sqrt(tip.x**2 + tip.y**2 + tip.z**2);
        features.push(distance);
    }

    return features; // 68 values per hand
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

// ============================================================
// ML MODEL INTEGRATION
// ============================================================

// 🔥 UPDATED API CONFIGURATION
const API_CONFIG = {
    MOCK_API: 'https://jsonplaceholder.typicode.com/posts',
    LOCAL_API: 'http://localhost:5000/predict',
    
    // 👇 REPLACE THIS WITH YOUR ACTUAL RENDER URL AFTER DEPLOYMENT
    PRODUCTION_API: 'https://your-app-name.onrender.com/predict',
    
    // 👇 SET TO 'PRODUCTION' AFTER DEPLOYING TO RENDER
    // Options: 'MOCK' (for testing without API), 'LOCAL' (localhost), 'PRODUCTION' (Render)
    ACTIVE: 'LOCAL'
};

function getAPIUrl() {
    switch(API_CONFIG.ACTIVE) {
        case 'MOCK': return API_CONFIG.MOCK_API;
        case 'LOCAL': return API_CONFIG.LOCAL_API;
        case 'PRODUCTION': return API_CONFIG.PRODUCTION_API;
        default: return API_CONFIG.MOCK_API;
    }
}

// Log current configuration on page load
console.log('🔗 API Configuration:');
console.log('  Mode:', API_CONFIG.ACTIVE);
console.log('  Endpoint:', getAPIUrl());

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
    const content = document.getElementById('chatMessages');
    
    if (transcript.length === 0) {
        content.innerHTML = '<div class="chat-empty">Sign language translations will appear here...</div>';
        return;
    }
    
    content.innerHTML = transcript.slice(-20).map(entry => `
        <div class="chat-message">
            <div class="chat-message-sign">${entry.sign}</div>
            <div class="chat-message-time">${entry.timestamp}</div>
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

// ============================================
// CONTROL BUTTON FUNCTIONS
// ============================================

window.toggleMic = function() {
    isMicMuted = !isMicMuted;
    const btn = document.getElementById('micBtn');
    
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMicMuted;
        });
    }

    if (isMicMuted) {
        btn.classList.add('active');
        btn.textContent = '🔇';
        btn.setAttribute('data-tooltip', 'Unmute Audio');
    } else {
        btn.classList.remove('active');
        btn.textContent = '🎤';
        btn.setAttribute('data-tooltip', 'Mute Audio');
    }
};

window.toggleCamera = function() {
    isCameraMuted = !isCameraMuted;
    const btn = document.getElementById('cameraBtn');
    
    if (localStream) {
        localStream.getVideoTracks().forEach(track => {
            track.enabled = !isCameraMuted;
        });
    }

    if (isCameraMuted) {
        btn.classList.add('active');
        btn.textContent = '📵';
        btn.setAttribute('data-tooltip', 'Turn On Camera');
    } else {
        btn.classList.remove('active');
        btn.textContent = '📹';
        btn.setAttribute('data-tooltip', 'Turn Off Camera');
    }
};

window.endCall = function() {
    if (confirm('Are you sure you want to end the call?')) {
        // Stop all tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        // Close peer connection
        if (pc) {
            pc.close();
        }
        
        // Disconnect socket
        if (socket) {
            socket.disconnect();
        }
        
        // Redirect to start page
        window.location.href = '/';
    }
};