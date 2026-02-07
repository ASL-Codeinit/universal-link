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
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- ROOM LOGIC ---
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
        
        // Notify others in the room that a new person joined
        socket.to(roomId).emit('user-connected', socket.id);
    });

    // --- WEBRTC SIGNALING ---
    // 1. Relay the Offer
    socket.on('offer', (payload) => {
        // payload should contain { offer, roomId }
        socket.to(payload.roomId).emit('offer', {
            offer: payload.offer,
            senderId: socket.id
        });
    });

    // 2. Relay the Answer
    socket.on('answer', (payload) => {
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

    // --- CLEANUP ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Signaling Server running on http://localhost:${PORT}`);
});