const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS so your friend can connect from a different URL/IP
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve your HTML/JS files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Now these routes will finally work:
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'start.html'));
});

app.get('/video', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // --- ROOM LOGIC ---
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`📍 User ${socket.id} joined room: ${roomId}`);
        
        // Notify others in the room that a new person joined
        socket.to(roomId).emit('user-connected', socket.id);
    });

    // --- USER MODE HANDLER (NEWLY ADDED) ---
    socket.on('user-mode', (payload) => {
        console.log(`👤 User ${socket.id} selected mode: ${payload.mode} in room ${payload.roomId}`);
        
        // Relay to other users in the room
        socket.to(payload.roomId).emit('remote-user-mode', {
            mode: payload.mode,
            senderId: socket.id
        });
    });

    // --- WEBRTC SIGNALING ---
    // 1. Relay the Offer
    socket.on('offer', (payload) => {
        console.log(`📞 Offer from ${socket.id} to room ${payload.roomId}`);
        // payload should contain { offer, roomId }
        socket.to(payload.roomId).emit('offer', {
            offer: payload.offer,
            senderId: socket.id
        });
    });

    // 2. Relay the Answer
    socket.on('answer', (payload) => {
        console.log(`📞 Answer from ${socket.id} to room ${payload.roomId}`);
        // payload should contain { answer, roomId }
        socket.to(payload.roomId).emit('answer', {
            answer: payload.answer,
            senderId: socket.id
        });
    });

    // 3. Relay ICE Candidates (Network info)
    socket.on('ice-candidate', (payload) => {
        // payload should contain { candidate, roomId }
        socket.to(payload.roomId).emit('ice-candidate', payload.candidate);
    });

    // --- SIGN LANGUAGE PREDICTION RELAY ---
    // Relay sign predictions to the other user
    socket.on('sign-prediction', (payload) => {
        // payload: { roomId, prediction: { sign, confidence, handedness } }
        console.log(`🤟 Sign detected in room ${payload.roomId}: ${payload.prediction.sign} (${(payload.prediction.confidence * 100).toFixed(0)}%)`);
        
        // Send to everyone ELSE in the room (not the sender)
        socket.to(payload.roomId).emit('remote-sign-prediction', {
            prediction: payload.prediction,
            senderId: socket.id
        });
    });

    // --- CLEANUP ---
    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 ASL Video Call Server Running`);
    console.log(`📡 Signaling Server: http://localhost:${PORT}`);
    console.log(`🌐 Share with friends: http://localhost:${PORT}\n`);
});