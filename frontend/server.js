const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Static Assets
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Lobby Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'lobby.html'));
});

// Video Call Page
app.get('/video', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'call.html'));
});

// =====================
// Socket.IO Signaling
// =====================

io.on('connection', (socket) => {

    console.log(`User Connected: ${socket.id}`);

    socket.on('join-room', (roomId) => {

        socket.join(roomId);

        console.log(
            `Socket ${socket.id} joined room ${roomId}`
        );

        const clients =
            Array.from(io.sockets.adapter.rooms.get(roomId) || []);

        if (clients.length > 1) {

            socket.to(roomId).emit(
                'user-connected',
                socket.id
            );
        }
    });

    // WebRTC Offer
    socket.on('offer', ({ roomId, offer }) => {

        socket.to(roomId).emit('offer', {
            offer,
            sender: socket.id
        });

    });

    // WebRTC Answer
    socket.on('answer', ({ roomId, answer }) => {

        socket.to(roomId).emit('answer', {
            answer,
            sender: socket.id
        });

    });

    // ICE Candidates
    socket.on('ice-candidate', ({ roomId, candidate }) => {

        socket.to(roomId).emit('ice-candidate', {
            candidate,
            sender: socket.id
        });

    });

    // Sign Predictions
    socket.on('sign-prediction', (data) => {

        socket.to(data.roomId).emit(
            'sign-prediction',
            data
        );

    });

    socket.on('disconnect', () => {

        console.log(
            `User Disconnected: ${socket.id}`
        );

        socket.broadcast.emit(
            'user-disconnected',
            socket.id
        );

    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log('🚀 ASL Video Call Server Running');
    console.log(`📡 Signaling Server: http://localhost:${PORT}`);

});