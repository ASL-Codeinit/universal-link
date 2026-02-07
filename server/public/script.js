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
            const handedness = results.multiHandedness[i].label; // "Left" or "Right"
            
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
            
            // Update info display
            updateHandInfo(landmarkData, handedness);
            
            // TODO: Your friend will use this data for ML model
            console.log('Landmarks for', handedness, 'hand:', landmarkData);
        }
    } else {
        // No hands detected
        document.getElementById('localHandInfo').textContent = 'No hands detected';
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