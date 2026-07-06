// USER MODE SETUP FROM SESSION STORAGE

// ── Backend resolution — hostname-based, no probing ──────────────────────────
const IS_LOCAL   = window.location.hostname === 'localhost'
                || window.location.hostname === '127.0.0.1';

const LOCAL_BACKEND_PORT = window.ML_BACKEND_PORT || 8000;; // change if your backend runs on a different port

const ACTIVE_BASE = IS_LOCAL
    ? `http://127.0.0.1:${LOCAL_BACKEND_PORT}`
    : 'https://universal-link-backend.kindbay-309802f0.southeastasia.azurecontainerapps.io';
function getAPIUrl()         { return `${ACTIVE_BASE}/predict`; }
function getGrammarUrl()     { return `${ACTIVE_BASE}/fix-grammar`; }
function getResetBufferUrl() { return `${ACTIVE_BASE}/reset-buffer`; }
function getHealthUrl()      { return `${ACTIVE_BASE}/health`; }

console.log('🔗 Backend:', ACTIVE_BASE);

// Global variables
let userMode = 'speaker';
let roomId = null;
let socket = null;

function normalizeUserMode(mode = userMode) {
    if (!mode) return 'speaker';
    return mode === 'listener' ? 'speaker' : mode;
}

function isSignerMode(mode = userMode) {
    return normalizeUserMode(mode) === 'signer';
}

// 1. Maintain the runtime state buffer in your script scope
let wordStack = []; 
let currentBestPrediction = "";
let currentBestConfidence = 0;
let missingHandFrames = 0;
const RESET_AFTER_FRAMES = 3;

// --- Stability-based acceptance: majority vote over a sliding window ---
const HISTORY_SIZE = 5;
const MAJORITY_REQUIRED = 4;
let lastAcceptedPrediction = "";
let currentStablePrediction = "";

// Control button states
let isMicMuted = false;
let isCameraMuted = false;
let isAutoTtsEnabled = true;
let ttsQueue = [];
let isTtsPlaying = false;

// Call duration tracking
let callStartTime = null;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    userMode = normalizeUserMode(sessionStorage.getItem('userMode') || 'speaker');
    console.log('User mode:', userMode);

    roomId = getRoomFromURL();
    if (!roomId) {
        roomId = generateRoomID();
        setRoomInURL(roomId);
    }

    const roomIdDisplay = document.getElementById('roomIdDisplay');
    const chatDrawer = document.getElementById('chatDrawer');
    if (roomIdDisplay) {
        roomIdDisplay.textContent = roomId;
    }

    socket = io();
    socket.emit('join-room', roomId);
    console.log('Joined room:', roomId);
    
    setupSocketHandlers();

    const localDetection = document.getElementById('localDetection');
    const localSubtitles = document.getElementById('localSubtitles');
    const remoteSubtitles = document.getElementById('remoteSubtitles');
    const remotePanel = document.querySelector('.remote-panel');
    
    if (isSignerMode(userMode)) {
        if (localDetection) localDetection.style.display = 'flex';
        if (localSubtitles) localSubtitles.style.display = 'block';
    } else {
        if (remoteSubtitles) remoteSubtitles.style.display = 'block';
    }

    if (chatDrawer) {
        chatDrawer.classList.remove('close-drawer');
        chatDrawer.classList.add('open-drawer');
    }

    const toggleBtn = document.getElementById('chatToggleBtn');
    if (toggleBtn) toggleBtn.classList.add('active-chat-mode');

    if (remotePanel) {
        remotePanel.style.width = 'calc(100% - 350px)';
    }
    
    initializeMedia();
    updateWordBufferUI();
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

function updateStatus(message) {
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = message;
    console.log('Status:', message);
}

function logActiveVideoDimensions(stream) {
    if (!stream || !stream.getVideoTracks) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
    console.log(`📽️ Active video dimensions: ${settings.width || 'unknown'}x${settings.height || 'unknown'}`);
}

function showMediaError(message) {
    updateStatus(message);
    let alertBanner = document.getElementById('mediaErrorBanner');
    if (!alertBanner) {
        alertBanner = document.createElement('div');
        alertBanner.id = 'mediaErrorBanner';
        alertBanner.style.cssText = `
            position:fixed;top:20px;left:50%;transform:translateX(-50%);
            z-index:9999;max-width:90%;padding:14px 18px;
            background:rgba(255,80,80,0.95);color:#fff;font-size:14px;
            border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.25);
            font-family:Poppins,sans-serif;text-align:center;pointer-events:none;
        `;
        document.body.appendChild(alertBanner);
    }
    alertBanner.textContent = `Camera/Mic Error: ${message}`;
    alertBanner.style.display = 'block';
    clearTimeout(showMediaError._timeout);
    showMediaError._timeout = setTimeout(() => {
        if (alertBanner) alertBanner.style.display = 'none';
    }, 12000);
}

// --- WEBRTC SETUP ---
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

let pc = new RTCPeerConnection(configuration);
let localStream;
let isCallStarted = false;

// --- GET USER MEDIA ---
async function initializeMedia() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('This browser does not support camera/microphone access or requires HTTPS/localhost.');
        }
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        logActiveVideoDimensions(localStream);
        document.getElementById('localVideo').srcObject = localStream;
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        updateStatus('Camera and microphone ready!');
        
        if (userMode === 'signer') {
            setTimeout(() => {
                if (typeof Hands !== 'undefined') {
                    initializeMediaPipe();
                } else {
                    console.error('MediaPipe Hands library not loaded');
                }
            }, 1000);
        }
        setTimeout(() => startCall(), 1000);
    } catch (error) {
        const errorMessage = error?.message || String(error);
        console.error('Error accessing media devices:', errorMessage);
        updateStatus('Error: Could not access camera/microphone');
        showMediaError(errorMessage);
    }
}

// --- WEBRTC EVENT HANDLERS ---
pc.ontrack = (event) => {
    console.log('📹 Received remote track:', event.track.kind);
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        console.log('✅ Remote video stream attached');
        updateStatus('Connected! Video call active.');
        callStartTime = Date.now(); // ← start the clock
        const statusMsg = document.getElementById('statusMessage');
        if (statusMsg) statusMsg.style.display = 'none';
        const remoteName = document.getElementById('remoteName');
        if (remoteName) remoteName.textContent = 'Friend';
    }
};

pc.onicecandidate = (event) => {
    if (event.candidate) {
        socket.emit('ice-candidate', { candidate: event.candidate, roomId: roomId });
    }
};

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
    if (isCallStarted) { updateStatus('Call already started!'); return; }
    isCallStarted = true;
    socket.emit('user-mode', { roomId: roomId, mode: userMode });
    try {
        updateStatus('Creating offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { offer: offer, roomId: roomId });
        updateStatus('Offer sent. Waiting for friend to join...');
    } catch (error) {
        console.error('Error creating offer:', error);
        updateStatus('Error starting call');
        isCallStarted = false;
    }
}

// --- SOCKET EVENT HANDLERS ---
function setupSocketHandlers() {
    socket.on('user-connected', (userId) => {
        console.log('✅ User connected to room:', userId);
        updateStatus('Friend joined the room!');
        const remoteName = document.getElementById('remoteName');
        if (remoteName) remoteName.textContent = 'Friend Connected';
    });

    socket.on('remote-user-mode', (data) => {
        console.log('👤 Remote user mode:', data.mode);
        if (data.mode === 'signer' && !isSignerMode(userMode)) {
            const remoteSubtitles = document.getElementById('remoteSubtitles');
            if (remoteSubtitles) remoteSubtitles.style.display = 'block';
        }
    });

    socket.on('offer', async (data) => {
        console.log('Received offer from:', data.senderId);
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            updateStatus('Received offer. Creating answer...');
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { answer: answer, roomId: roomId });
            updateStatus('Answer sent. Establishing connection...');
        } catch (error) {
            console.error('Error handling offer:', error);
            updateStatus('Error processing offer');
        }
    });

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

    socket.on('ice-candidate', async (candidate) => {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    });

    socket.on('remote-sign-prediction', (data) => {
        console.log('🤟 Received remote sign prediction:', data.prediction);
        const remoteSubtitles = document.getElementById('remoteSubtitles');
        if (remoteSubtitles) remoteSubtitles.style.display = 'block';
        displayRemoteSubtitles(data.prediction);
        const remoteSubtitleText = document.getElementById('remoteSubtitleText');
        if (remoteSubtitleText && data.draftSentence) {
            remoteSubtitleText.innerHTML = `
                <span style="color:#aaa;font-size:13px;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Drafting Signs...</span>
                <span style="color:#ffffff;font-size:24px;font-weight:600;text-shadow:2px 2px 4px #000;">${data.draftSentence}</span>
            `;
        }
    });

    socket.on('receive-sentence', (data) => {
        const finalSentence = data.sentence || (data.incomingData && data.incomingData.sentence);
        if (!finalSentence) {
            console.warn('⚠️ Received a sentence event but message was empty:', data);
            return;
        }
        console.log('📩 Received completed sentence from friend:', finalSentence);
        addToTranscript(finalSentence, { source: 'remote' });
        const remoteSubtitleText = document.getElementById('remoteSubtitleText');
        if (remoteSubtitleText) {
            remoteSubtitleText.innerHTML = `
                <span style="color:#4CAF50;font-size:14px;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:600;text-shadow:1px 1px 2px #000;">✨ Friend Translation</span>
                <span style="color:#fff;font-size:24px;text-shadow:2px 2px 4px #000;">${finalSentence}</span>
            `;
        }
    });

    // When the remote peer ends the call, redirect us to the call-ended page
    socket.on('call-ended', (data) => {
        console.log('📵 Remote ended the call');
        goToCallEnded(data.duration, data.transcript || []);
    });
}

// MEDIAPIPE HANDS DETECTION

let hands;
let isMediaPipeReady = false;

function initializeMediaPipe() {
    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onHandsDetected);
    isMediaPipeReady = true;
    console.log('✅ MediaPipe Hands initialized');
    startHandDetection();
}

function setDetectionIndicatorState(isActive) {
    const indicator = document.getElementById('localDetection');
    const hudEl = document.getElementById('localLiveHUD');
    if (indicator) {
        indicator.classList.toggle('inactive', !isActive);
        indicator.classList.toggle('active', isActive);
        indicator.innerHTML = '<span class="pulse-dot"></span>';
    }
    if (hudEl) { hudEl.innerText = ''; hudEl.style.color = ''; }
}

// ── FIX: draw landmarks at the PiP's displayed pixel size, not raw stream res ──
// Previously: canvas.width = video.videoWidth  (e.g. 1280)
// MediaPipe normalised coords (0–1) × 1280 = dots drawn far outside the ~200px PiP
// Now: canvas intrinsic size = CSS layout size of the canvas element itself
function onHandsDetected(results) {
    const canvas = document.getElementById('localCanvas');
    const ctx = canvas.getContext('2d');
    const video = document.getElementById('localVideo');

    // Match intrinsic canvas resolution to its actual displayed size in the PiP
    const displayW = canvas.clientWidth  || canvas.offsetWidth  || video.clientWidth  || 200;
    const displayH = canvas.clientHeight || canvas.offsetHeight || video.clientHeight || 150;
    if (canvas.width !== displayW || canvas.height !== displayH) {
        canvas.width  = displayW;
        canvas.height = displayH;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        missingHandFrames = 0;
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
            drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });
        }

        if (userMode === 'signer') {
            noHandsStartTime = null;
            setDetectionIndicatorState(true);
            let leftFeatures  = new Array(68).fill(0);
            let rightFeatures = new Array(68).fill(0);
            const detectedHandedness = [];

            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks     = results.multiHandLandmarks[i];
                const rawHandedness = results.multiHandedness[i].label;
                const handedness    = rawHandedness === 'Left' ? 'Right' : 'Left';
                detectedHandedness.push(handedness);
                const features = extractRobustFeatures(landmarks);
                if (handedness === 'Left')       leftFeatures  = features;
                else if (handedness === 'Right') rightFeatures = features;
            }
            const allFeatures = [...leftFeatures, ...rightFeatures];
            sendToMLModel(allFeatures, detectedHandedness.length > 0 ? detectedHandedness : ['Both']);
        }
    } else {
        setDetectionIndicatorState(false);
        predictionHistory = [];
        lastAcceptedPrediction = "";
        currentStablePrediction = "";
        updateCurrentStablePredictionUI();
    }
}

let lastResetTime = 0;
function resetServerBuffer() {
    const now = Date.now();
    if (now - lastResetTime < 500) return;
    lastResetTime = now;
    fetch(getResetBufferUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: roomId })
    }).catch(err => console.error('Reset buffer failed:', err));
}

function extractRobustFeatures(landmarks) {
    const flipped = landmarks.map(lm => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));
    const wrist = flipped[0];
    let centered = flipped.map(lm => ({ x: lm.x - wrist.x, y: lm.y - wrist.y, z: lm.z - wrist.z }));
    let maxVal = Math.max(...centered.flatMap(p => [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)]));
    if (maxVal === 0) maxVal = 1e-5;
    let normalised = centered.map(p => ({ x: p.x / maxVal, y: p.y / maxVal, z: p.z / maxVal }));
    let features = normalised.flatMap(p => [p.x, p.y, p.z]);
    const tipIds = [4, 8, 12, 16, 20];
    for (const tipId of tipIds) {
        const tip = normalised[tipId];
        features.push(Math.sqrt(tip.x**2 + tip.y**2 + tip.z**2));
    }
    return features;
}

async function startHandDetection() {
    const video = document.getElementById('localVideo');
    if (!video.videoWidth || !video.videoHeight) {
        setTimeout(startHandDetection, 100);
        return;
    }
    console.log('🎥 Starting hand detection...');
    let processing = false;
    async function detectFrame() {
        if (!isMediaPipeReady) return;
        if (processing) { requestAnimationFrame(detectFrame); return; }
        processing = true;
        try { await hands.send({ image: video }); }
        finally { processing = false; }
        requestAnimationFrame(detectFrame);
    }
    detectFrame();
}

// ML MODEL INTEGRATION

let lastPredictionTime = 0;
const PREDICTION_INTERVAL = 100;
let apiCallCount = 0;
let predictionHistory = [];
let successfulCalls = 0;
let failedCalls = 0;

async function sendToMLModel(combinedLandmarks, handednessArray) {
    const now = Date.now();
    if (now - lastPredictionTime < PREDICTION_INTERVAL) return;
    lastPredictionTime = now;
    apiCallCount++;
    
    const hudEl = document.getElementById('localLiveHUD');
    if (hudEl) { hudEl.innerText = ''; hudEl.style.color = ''; }
    
    try {
        const requestPayload = {
            landmarks:  combinedLandmarks,
            handedness: handednessArray,
            session_id: roomId,
            timestamp:  now
        };
        const response = await fetch(getAPIUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(requestPayload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const predictionData = await response.json();
        if (predictionData.buffering) console.log(`⏳ Buffering: ${predictionData.buffer_size}/20 frames`);
        
        const prediction = parseFriendResponse(predictionData, handednessArray);
        successfulCalls++;
        sendPredictionToRemote(prediction);
        handleIncomingPrediction(prediction);
        displayLocalSubtitles(prediction);
        updateAPIStats();
    } catch (error) {
        if (hudEl) { hudEl.innerText = 'ML: error'; hudEl.style.color = '#ff5252'; }
        console.error('❌ API Error:', error.message);
        failedCalls++;
        updateAPIStats();
    }
}

function sendPredictionToRemote(prediction) {
    socket.emit('sign-prediction', {
        roomId: roomId,
        prediction: {
            sign:       prediction.sign,
            confidence: prediction.confidence,
            handedness: prediction.handedness,
            timestamp:  prediction.timestamp || Date.now()
        }
    });
}

function displayRemoteSubtitles(prediction) {
    const subtitleText = document.getElementById('remoteSubtitleText');
    if (!subtitleText) return;
    const mockBadge = prediction.isMock ? ' <span style="color:#FFA500;font-size:14px;">[TEST]</span>' : '';
    subtitleText.innerHTML = `${prediction.sign || 'Waiting for sign'}${mockBadge}`;
}

function updateCurrentStablePredictionUI() {
    const localSubtitles    = document.getElementById('localSubtitles');
    const localSubtitleText = document.getElementById('localSubtitleText');
    if (!localSubtitles || !localSubtitleText) return;
    localSubtitles.style.display = 'block';
    localSubtitleText.textContent = currentStablePrediction || 'Waiting for sign';
}

function handleIncomingPrediction(prediction) {
    const normalizedSign = prediction?.sign?.trim();
    if (!normalizedSign || normalizedSign.toLowerCase() === 'none' || prediction?.buffering) return;
    if (prediction.confidence <= 0.65) return;

    predictionHistory.push(normalizedSign);
    if (predictionHistory.length > HISTORY_SIZE) predictionHistory.shift();
    if (predictionHistory.length < HISTORY_SIZE) return;

    const counts = {};
    predictionHistory.forEach(sign => { counts[sign] = (counts[sign] || 0) + 1; });
    let majoritySign = predictionHistory[0];
    let majorityCount = 0;
    for (const sign in counts) {
        if (counts[sign] > majorityCount) { majorityCount = counts[sign]; majoritySign = sign; }
    }
    if (majorityCount < MAJORITY_REQUIRED) return;

    currentStablePrediction = majoritySign;
    currentBestConfidence   = prediction.confidence;
    currentBestPrediction   = majoritySign;
    updateCurrentStablePredictionUI();

    if (majoritySign === lastAcceptedPrediction) return;
    lastAcceptedPrediction = majoritySign;
    pushToStack(majoritySign);

    if (socket && roomId) {
        socket.emit('sign-prediction', {
            roomId: roomId,
            prediction: prediction,
            draftSentence: wordStack.join(' ')
        });
    }
}

function updateWordBufferUI() {
    const wordBufferBox = document.getElementById('wordBufferBox');
    userMode = normalizeUserMode(sessionStorage.getItem('userMode') || userMode || 'speaker');
    if (isSignerMode(userMode)) {
        if (!wordBufferBox) return;
        if (wordStack.length === 0) {
            wordBufferBox.innerHTML = 'Waiting for detected words...';
            return;
        }
        wordBufferBox.innerHTML = wordStack.map(word => `<span>${word}</span>`).join('');
    }
}

function clearWordBufferUI() {
    wordStack = [];
    updateWordBufferUI();
    updateStackUI();
}

function resetSentenceBuilding() {
    clearWordBufferUI();
    predictionHistory = [];
    lastAcceptedPrediction  = '';
    currentBestPrediction   = '';
    currentBestConfidence   = 0;
    currentStablePrediction = '';
    updateCurrentStablePredictionUI();
    updateStatus('Sentence building restarted');
    resetServerBuffer();
}

function pushToStack(word) {
    const cleanWord = word.trim();
    if (wordStack.slice(-3).includes(cleanWord)) return;
    wordStack.push(cleanWord);
    updateWordBufferUI();
    updateStackUI();
}

window.addEventListener('keydown', async (event) => {
    const activeElement = document.activeElement;
    const isTypingTarget = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
    );

    if (!isSignerMode(userMode) || isTypingTarget) {
        return;
    }

    if (event.key === '0') {
        event.preventDefault();
        resetSentenceBuilding();
        return;
    }

    if (event.key === 'Backspace') {
        event.preventDefault();
        if (wordStack.length === 0) return;
        wordStack.pop();
        updateWordBufferUI();
        updateStackUI();
        updateStatus('Removed last word');
        return;
    }

    if (event.key === '.') {
        event.preventDefault();
        if (wordStack.length === 0) return;
        console.log('🧠 Sending stack to Groq:', wordStack);
        try {
            const response = await fetch(getGrammarUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ words: wordStack })
            });
            const data = await response.json();
            if (data.sentence) {
                console.log('✨ Translation Result:', data.sentence);
                addToTranscript(data.sentence);
                if (socket && roomId) {
                    socket.emit('send-sentence', { roomId: roomId, sentence: data.sentence });
                }
                clearWordBufferUI();
                predictionHistory       = [];
                lastAcceptedPrediction  = '';
                currentBestPrediction   = '';
                currentBestConfidence   = 0;
                currentStablePrediction = '';
                updateCurrentStablePredictionUI();
                resetServerBuffer();
            }
        } catch (err) {
            console.error('Network communication failed:', err);
        }
    }
});

function updateStackUI() {
    const stackDisplay = document.getElementById('globalStackDisplay');
    if (stackDisplay) stackDisplay.innerText = `STACK: ${wordStack.join(' ')}`;
}

function displayLocalSubtitles(prediction) {
    const localSubtitles    = document.getElementById('localSubtitles');
    const localSubtitleText = document.getElementById('localSubtitleText');
    if (!localSubtitles || !localSubtitleText) return;
    localSubtitles.style.display = 'block';
    localSubtitleText.textContent = currentStablePrediction || prediction?.sign || 'Waiting for sign';
}

function toggleChatDrawer() {
    const drawer = document.getElementById('chatDrawer');
    const toggleBtn = document.getElementById('chatToggleBtn');
    const remote = document.querySelector('.remote-panel');

    if (drawer.classList.contains('close-drawer')) {
        drawer.classList.remove('close-drawer');
        drawer.classList.add('open-drawer');
        toggleBtn.classList.add('active-chat-mode');

        remote.style.width = "calc(100% - 350px)";
    } else {
        drawer.classList.remove('open-drawer');
        drawer.classList.add('close-drawer');
        toggleBtn.classList.remove('active-chat-mode');

        remote.style.width = "100%";
    }
}

function parseFriendResponse(responseData, handedness) {
    let sign = 'Unknown', confidence = 0.0;
    if (responseData.sign && responseData.confidence !== undefined) {
        sign = responseData.sign; confidence = responseData.confidence;
    } else if (responseData.prediction && responseData.score) {
        sign = responseData.prediction; confidence = responseData.score;
    } else if (responseData.label && responseData.probability) {
        sign = responseData.label; confidence = responseData.probability;
    } else if (typeof responseData === 'string') {
        sign = responseData; confidence = 1.0;
    } else {
        sign = 'Mock-' + (responseData.id || 'Test'); confidence = 0.85;
    }
    return { sign, confidence: parseFloat(confidence), handedness, buffering: responseData.buffering || false, timestamp: Date.now() };
}

function updateAPIStats() {
    const successRate = apiCallCount > 0 ? ((successfulCalls / apiCallCount) * 100).toFixed(1) : 0;
    console.log(`📊 API Stats — Total:${apiCallCount} OK:${successfulCalls} Fail:${failedCalls} Rate:${successRate}%`);
}

// TRANSCRIPT

function speech(text) {
    queueSpeech(text);
}

function toggleAutoSpeech() {
    isAutoTtsEnabled = !isAutoTtsEnabled;
    const button = document.getElementById('autoTtsBtn');
    if (!button) return;

    button.classList.toggle('active', isAutoTtsEnabled);
    button.textContent = isAutoTtsEnabled ? '🔊' : '🔈';
    button.setAttribute('data-tooltip', isAutoTtsEnabled ? 'Disable auto speech' : 'Enable auto speech');

    if (!isAutoTtsEnabled) {
        speechSynthesis.cancel();
        ttsQueue = [];
        isTtsPlaying = false;
    }
}

function updateAutoSpeechButton() {
    const button = document.getElementById('autoTtsBtn');
    if (!button) return;
    button.classList.toggle('active', isAutoTtsEnabled);
    button.textContent = isAutoTtsEnabled ? '🔊' : '🔈';
    button.setAttribute('data-tooltip', isAutoTtsEnabled ? 'Disable auto speech' : 'Enable auto speech');
}

function queueSpeech(text) {
    if (!text || typeof text !== 'string') return;
    const cleanText = text.trim();
    if (!cleanText || !isAutoTtsEnabled) return;

    ttsQueue.push(cleanText);
    if (!isTtsPlaying) {
        playNextTts();
    }
}

function playNextTts() {
    if (!isAutoTtsEnabled || isTtsPlaying || ttsQueue.length === 0) return;

    isTtsPlaying = true;
    const text = ttsQueue.shift();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1;
    utterance.onend = () => {
        isTtsPlaying = false;
        playNextTts();
    };
    utterance.onerror = () => {
        isTtsPlaying = false;
        playNextTts();
    };
    speechSynthesis.speak(utterance);
}

function updateTranscriptPanel() {
    userMode = normalizeUserMode(sessionStorage.getItem('userMode') || userMode || 'speaker');
    const label = document.getElementById('wordBufferLabel');
    const box = document.getElementById('wordBufferBox');
    console.log('User mode:', userMode);
    console.log('box ', box);

    if (isSignerMode(userMode)) {
        label.textContent = 'Sentence Builder';
        box.textContent = 'Waiting for detected words...';
    } else {
        label.textContent = 'Speech-to-Text';
        box.innerHTML = `
            <button class="speech-btn" onclick="startSpeechRecognition()">
                🎤 Press to Start Speech-to-Text
            </button>`;
    }
}

function startSpeechRecognition() {
    // 1. Check browser support
    const box = document.getElementById("wordBufferBox");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Your browser does not support Speech Recognition. Try Google Chrome.");
        return;
    }

    // 2. Change the box into an input field with a send button
    box.innerHTML = `
                <div class="input-wrapper">
            <input
                type="text"
                id="speech-input"
                placeholder="Listening..."
            >
            <button id="send-btn" onclick="sendMessage()">
                📩
            </button>
        </div>
    `;
    const speechInput = document.getElementById('speech-input');
    speechInput.focus();
    const recognition = new SpeechRecognition();
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;

        const speechInput = document.getElementById("speech-input");
        if (!speechInput) return;

        sendMessage();
    });
    // Configure recognition settings
    recognition.continuous = false; // Stops automatically when you finish speaking
    recognition.interimResults = true; // Shows results as you speak

    // 3. Update the input box value as you speak
    recognition.onresult = (event) => {
        let currentTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
        }
        speechInput.value = currentTranscript; // Allows user to manually edit it later
    };

    // Optional: Handle errors or end of speech
    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        speechInput.placeholder = "Error occurred. Try typing instead.";
    };

    // 4. Start listening
    recognition.start();
}

function sendMessage() {
    const box = document.getElementById("wordBufferBox");
    const speechInput = document.getElementById('speech-input');
    const message = speechInput.value.trim();

    if (message) {
        console.log(message)
        console.log("Message Sent:", message);
        addToTranscript(message, { source: 'local' });
        console.log(socket.connected);
        socket.emit("send-sentence", {
            roomId: roomId,
            sentence: message
        });
        // Reset back to the original microphone button state
        box.innerHTML = `
            <button class="speech-btn" onclick="startSpeechRecognition()">
                🎤 Press to Start Speech-to-Text
            </button>
        `;
    } else {
        alert("Please say or type something before sending!");
    }
}

let transcript = [];

function addToTranscript(text, options = {}) {
    userMode = normalizeUserMode(sessionStorage.getItem('userMode') || userMode || 'speaker');
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    const emptyPrompt = chatMessages.querySelector('.chat-empty');
    if (emptyPrompt) emptyPrompt.remove();
    const source = options.source || 'local';
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.innerHTML = `
        <div class="chat-message-sign">${text}</div>
        <div class="chat-message-time">${timestamp}</div>
    `;
    chatMessages.appendChild(messageDiv);
    if (source === 'remote') {
        queueSpeech(text);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
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

// ── Collect transcript entries from the DOM ──────────────────────────────────
function collectTranscript() {
    const msgs = document.querySelectorAll('#chatMessages .chat-message');
    const entries = [];
    msgs.forEach(msg => {
        const text = msg.querySelector('.chat-message-sign')?.textContent || '';
        const time = msg.querySelector('.chat-message-time')?.textContent || '';
        if (text) entries.push({ text, time });
    });
    return entries;
}

// ── Navigate both peers to the call-ended page ───────────────────────────────
function goToCallEnded(durationMs, transcriptEntries) {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (pc) pc.close();

    const duration = durationMs || (callStartTime ? Date.now() - callStartTime : 0);
    const entries  = transcriptEntries && transcriptEntries.length
        ? transcriptEntries
        : collectTranscript();

    sessionStorage.setItem('callDuration',  String(duration));
    sessionStorage.setItem('callTranscript', JSON.stringify(entries));

    // Do NOT call socket.disconnect() here — the page navigation naturally
    // closes the connection, and doing it synchronously kills the socket
    // before the server can relay 'call-ended' to the other peer.
    window.location.href = '/call-ended';
}

window.toggleMic = function() {
    isMicMuted = !isMicMuted;
    const btn = document.getElementById('micBtn');
    if (localStream) localStream.getAudioTracks().forEach(t => { t.enabled = !isMicMuted; });
    if (isMicMuted) {
        btn.classList.add('active'); btn.textContent = '🔇'; btn.setAttribute('data-tooltip', 'Unmute Audio');
    } else {
        btn.classList.remove('active'); btn.textContent = '🎤'; btn.setAttribute('data-tooltip', 'Mute Audio');
    }
};

window.toggleCamera = function() {
    isCameraMuted = !isCameraMuted;
    const btn = document.getElementById('cameraBtn');
    if (localStream) localStream.getVideoTracks().forEach(t => { t.enabled = !isCameraMuted; });
    if (isCameraMuted) {
        btn.classList.add('active'); btn.textContent = '📵'; btn.setAttribute('data-tooltip', 'Turn On Camera');
    } else {
        btn.classList.remove('active'); btn.textContent = '📹'; btn.setAttribute('data-tooltip', 'Turn Off Camera');
    }
};

window.endCall = function() {
    const modal = document.getElementById('endCallModal');
    if (modal) modal.style.display = 'flex';
};

window.confirmEndCall = function() {
    const modal = document.getElementById('endCallModal');
    if (modal) modal.style.display = 'none';

    const duration = callStartTime ? Date.now() - callStartTime : 0;
    const entries  = collectTranscript();

    if (socket && roomId) {
        // Emit and give the server a brief moment to relay before navigating
        socket.emit('call-ended', { roomId, duration, transcript: entries });
        setTimeout(function() { goToCallEnded(duration, entries); }, 300);
    } else {
        goToCallEnded(duration, entries);
    }
};

window.cancelEndCall = function() {
    const modal = document.getElementById('endCallModal');
    if (modal) modal.style.display = 'none';
};

window.testMLAPI = async function() {
    console.log('🧪 Testing ML API... Endpoint:', getAPIUrl());
    const testLandmarks = Array(136).fill(0).map(() => Math.random());
    try {
        const response = await fetch(getAPIUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ landmarks: testLandmarks, handedness: 'Right', timestamp: Date.now() })
        });
        const data = await response.json();
        console.log('✅ Success!', data);
        return data;
    } catch (error) {
        console.error('❌ Failed!', error);
        return null;
    }
};