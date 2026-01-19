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

// Store room states (private rooms)
const rooms = new Map();

// Public Lobby Rooms (8 fixed rooms)
const publicRooms = {};
for (let i = 1; i <= 8; i++) {
    publicRooms[`room_${i}`] = {
        id: `room_${i}`,
        name: `Oda ${i}`,
        players: [],
        white: null,
        black: null,
        timeLimit: 0
    };
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function broadcastPublicRooms(io) {
    const roomStates = Object.values(publicRooms).map(r => ({
        id: r.id,
        name: r.name,
        playerCount: r.players.length,
        isFull: r.players.length >= 2
    }));
    io.emit('public_rooms_update', roomStates);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('create_room', (data) => {
        const roomId = generateRoomId();
        // Store room with time limit (default 120s if not provided)
        rooms.set(roomId, {
            players: [socket.id],
            white: socket.id,
            black: null,
            timeLimit: (data && data.timeLimit) ? data.timeLimit : 120
        });
        socket.join(roomId);
        socket.emit('room_created', { roomId, color: 'white' });
        console.log(`Room created: ${roomId} by ${socket.id} with timeLimit: ${rooms.get(roomId).timeLimit}`);
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
                black: room.black,
                timeLimit: room.timeLimit
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

    // === VOICE CHAT SIGNALING ===
    socket.on('voice_offer', ({ roomId, offer }) => {
        socket.to(roomId).emit('voice_offer', { offer });
    });

    socket.on('voice_answer', ({ roomId, answer }) => {
        socket.to(roomId).emit('voice_answer', { answer });
    });

    socket.on('voice_ice_candidate', ({ roomId, candidate }) => {
        socket.to(roomId).emit('voice_ice_candidate', { candidate });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up private rooms
        rooms.forEach((room, roomId) => {
            if (room.players.includes(socket.id)) {
                io.to(roomId).emit('opponent_disconnected');
                rooms.delete(roomId);
            }
        });
        // Clean up public rooms
        Object.values(publicRooms).forEach(room => {
            const idx = room.players.indexOf(socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.white === socket.id) room.white = null;
                if (room.black === socket.id) room.black = null;
                io.to(room.id).emit('opponent_disconnected');
                socket.leave(room.id);
                broadcastPublicRooms(io);
            }
        });
    });

    // === PUBLIC LOBBY EVENTS ===
    socket.on('get_public_rooms', () => {
        const roomStates = Object.values(publicRooms).map(r => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            isFull: r.players.length >= 2
        }));
        socket.emit('public_rooms_update', roomStates);
    });

    socket.on('join_public_room', (roomId) => {
        const room = publicRooms[roomId];
        if (!room) {
            socket.emit('error_message', 'Oda bulunamadı!');
            return;
        }
        if (room.players.length >= 2) {
            socket.emit('error_message', 'Oda dolu!');
            return;
        }
        if (room.players.includes(socket.id)) {
            socket.emit('error_message', 'Zaten bu odadasınız!');
            return;
        }

        room.players.push(socket.id);
        socket.join(roomId);

        if (room.players.length === 1) {
            room.white = socket.id;
            socket.emit('joined_public_room', { roomId, color: 'white', waiting: true });
        } else if (room.players.length === 2) {
            room.black = socket.id;
            socket.emit('joined_public_room', { roomId, color: 'black', waiting: false });
            // Start game for both
            io.to(roomId).emit('game_start', {
                white: room.white,
                black: room.black,
                timeLimit: room.timeLimit
            });
        }

        broadcastPublicRooms(io);
        console.log(`User ${socket.id} joined public room ${roomId} (${room.players.length}/2)`);
    });

    socket.on('leave_public_room', (roomId) => {
        const room = publicRooms[roomId];
        if (room) {
            const idx = room.players.indexOf(socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.white === socket.id) room.white = null;
                if (room.black === socket.id) room.black = null;
                socket.leave(roomId);
                io.to(roomId).emit('opponent_disconnected');
                broadcastPublicRooms(io);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
