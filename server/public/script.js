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
        { urls: 'stun:stun1.l.google.com:19302' }
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