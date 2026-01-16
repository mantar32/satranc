const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors');

app.use(cors());

const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for Vercel/Render compatibility
        methods: ["GET", "POST"]
    }
});
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Store room states
const rooms = new Map();

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('create_room', () => {
        const roomId = generateRoomId();
        rooms.set(roomId, {
            players: [socket.id],
            white: socket.id,
            black: null
        });
        socket.join(roomId);
        socket.emit('room_created', { roomId, color: 'white' });
        console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    socket.on('join_room', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            room.black = socket.id;
            socket.join(roomId);

            // Tell the joiner they are black FIRST so they set color before game starts
            socket.emit('player_joined', { color: 'black' });

            // Notify both players
            io.to(roomId).emit('game_start', {
                white: room.white,
                black: room.black
            });

            console.log(`User ${socket.id} joined room ${roomId}`);
        } else {
            socket.emit('error_message', 'Oda dolu veya bulunamadı!');
        }
    });

    socket.on('make_move', ({ roomId, move }) => {
        // Relay move to other player in the room
        socket.to(roomId).emit('opponent_move', move);
    });

    socket.on('leave_room', (roomId) => {
        const room = rooms.get(roomId);
        if (room) {
            rooms.delete(roomId); // Delete room immediately to prevent reuse
            io.to(roomId).emit('opponent_disconnected');
            console.log(`Room ${roomId} deleted (user left)`);
        }
    });

    socket.on('request_restart', (roomId) => {
        io.to(roomId).emit('game_restart');
    });

    // Handle interactions (e.g., sending tea)
    socket.on('send_interaction', ({ roomId, type, fromColor }) => {
        socket.to(roomId).emit('receive_interaction', { type, fromColor });
    });

    socket.on('time_out', ({ roomId, color }) => {
        const winner = color === 'white' ? 'black' : 'white';
        io.to(roomId).emit('game_over_timeout', { winner });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up rooms
        rooms.forEach((room, roomId) => {
            if (room.players.includes(socket.id)) {
                io.to(roomId).emit('opponent_disconnected');
                rooms.delete(roomId);
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
