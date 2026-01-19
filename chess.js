// Chess Game with AI - Main JavaScript
class ChessGame {
    constructor() {
        this.board = [];
        this.currentPlayer = 'white';
        this.myColor = 'white'; // 'white', 'black', or null (for local)
        this.selectedSquare = null;
        this.validMoves = [];
        this.moveHistory = [];
        this.capturedPieces = { white: [], black: [] };
        this.isGameOver = false;
        this.enPassantTarget = null;
        this.castlingRights = { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } };
        this.lastMove = null;
        this.gameMode = 'two-player';
        this.difficulty = 1;
        this.isAIThinking = false;
        this.roomId = null;
        this.socket = null;
        this.socket = null;
        // SVG pieces now handled by getPieceSVG() method
        this.pieceValues = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000 };
        this.selectedTime = 120; // Default 2 minutes
        this.init();
    }

    init() {
        this.setupMenuListeners();
        this.setupTimeSelectionListeners();
        this.setupVoiceRecognition(); // Initialize Voice Cheat
        this.setupSocket();
    }

    setupVoiceRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.log("Voice recognition not supported in this browser.");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'tr-TR';
        this.recognition.continuous = true;
        this.recognition.interimResults = false;

        this.recognition.onresult = (event) => {
            const lastResult = event.results[event.results.length - 1];
            const command = lastResult[0].transcript.trim().toLowerCase();
            console.log("Voice Command Detected:", command);

            if (command.includes('şafak')) {
                // Secret Command Triggered!
                const cheatBtn = document.getElementById('cheat-btn');
                if (cheatBtn) {
                    cheatBtn.classList.remove('hidden');
                    alert("🔓 Gizli Hile Modu Aktif Edildi! (Şafak)");
                }
            }
        };

        this.recognition.onerror = (event) => {
            console.log("Voice recognition error", event.error);
        };

        // Start listening when the game is initialized
        try {
            this.recognition.start();
        } catch (e) {
            console.log("Mic detection started");
        }
    }

    setupTimeSelectionListeners() {
        const timeBtns = document.querySelectorAll('.time-btn');
        timeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update UI
                timeBtns.forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');

                // Update Value
                const minutes = parseInt(e.target.dataset.time);
                this.selectedTime = minutes * 60;
            });
        });
    }

    setupSocket() {
        try {
            // If running on local, use local. If moved to Vercel, need to point to Render URL.
            // You can replace 'null' with your Render URL, e.g., 'https://your-app.onrender.com'
            const productionUrl = 'https://satranc-server.onrender.com';
            const socketUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                ? window.location.origin
                : (productionUrl || window.location.origin);

            this.socket = io(socketUrl);

            console.log('Connecting to socket at:', socketUrl);

            this.socket.on('room_created', (data) => {
                this.roomId = data.roomId;
                this.myColor = data.color;
                document.getElementById('display-room-id').textContent = this.roomId;
                document.getElementById('room-wait-status').classList.remove('hidden');
                document.getElementById('create-room-btn').classList.add('hidden');
                document.querySelector('.join-room-section').classList.add('hidden');
                document.querySelector('.time-selection').classList.add('hidden'); // Hide time selection
            });

            this.socket.on('game_start', (data) => {
                // Robustly set color based on socket ID matches
                if (this.socket.id === data.white) {
                    this.myColor = 'white';
                } else if (this.socket.id === data.black) {
                    this.myColor = 'black';
                }

                // Set Time Limit from Server
                if (data.timeLimit !== undefined && data.timeLimit !== null) {
                    this.timeRemaining = { white: data.timeLimit, black: data.timeLimit };
                } else {
                    this.timeRemaining = { white: 120, black: 120 }; // Fallback
                }

                this.startGame('online');
                document.getElementById('online-lobby').classList.add('hidden');
                document.getElementById('modal').classList.add('hidden'); // Close any end game modal
            });

            this.socket.on('game_restart', () => {
                this.newGame(true); // true = force local reset without emitting
            });

            this.socket.on('player_joined', (data) => {
                this.myColor = data.color;
            });

            this.socket.on('opponent_move', (move) => {
                // Sync opponent's timer
                if (move.timeLeft !== undefined) {
                    this.timeRemaining[move.color] = move.timeLeft;
                    this.updateClockDisplay(move.color);
                }

                // Log for debugging
                console.log('Received opponent move:', move, 'Time Left:', move.timeLeft);

                this.makeMove(move.from.row, move.from.col, move.to.row, move.to.col, true);
            });

            this.socket.on('receive_interaction', ({ type, fromColor }) => {
                if (type === 'tea') {
                    this.showTeaAnimation();
                }
            });

            this.socket.on('game_over_timeout', (data) => {
                this.endGame(`Süre Bitti! ${data.winner === 'white' ? 'Beyaz' : 'Siyah'} kazandı.`);
            });

            this.socket.on('player_left', () => {
                alert('Rakip oyundan ayrıldı.');
                this.goToMainMenu();
            });

            this.socket.on('opponent_disconnected', () => {
                alert('Rakip oyundan ayrıldı!');
                this.goToMainMenu();
            });

            this.socket.on('error_message', (msg) => {
                alert(msg);
            });

            this.socket.on('connect_error', (err) => {
                console.error('Socket connection error:', err);
                if (socketUrl === window.location.origin && window.location.hostname !== 'localhost') {
                    alert("Sunucuya bağlanılamadı. Eğer Vercel'deyseniz, Render URL ayarını yapmanız gerekebilir.");
                }
            });

        } catch (e) {
            console.log('Socket.io not found, running in offline mode');
        }
    }

    setupMenuListeners() {
        document.getElementById('two-player-btn').addEventListener('click', () => this.startGame('two-player'));
        document.getElementById('vs-computer-btn').addEventListener('click', () => this.showDifficultySelection());
        document.getElementById('back-to-modes').addEventListener('click', () => this.showModeSelection());

        // Listener for the new Online Lobby back button
        const backToModesOnline = document.getElementById('back-to-modes-online');
        if (backToModesOnline) {
            backToModesOnline.addEventListener('click', () => {
                // If in a room, leave it first
                if (this.roomId) {
                    this.socket.emit('leave_room', this.roomId);
                    this.roomId = null;
                }
                this.showModeSelection();
                // Ensure time selection is visible again for next time
                const timeSelection = document.querySelector('.time-selection');
                if (timeSelection) timeSelection.classList.remove('hidden');
            });
        }


        document.getElementById('online-btn').addEventListener('click', () => {
            document.querySelector('.mode-selection').classList.add('hidden');
            document.getElementById('online-lobby').classList.remove('hidden');
            document.getElementById('room-wait-status').classList.add('hidden');
            document.getElementById('create-room-btn').classList.remove('hidden');
            document.querySelector('.join-room-section').classList.remove('hidden');
        });

        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.socket.emit('create_room', { timeLimit: this.selectedTime });
        });

        document.getElementById('join-room-btn').addEventListener('click', () => {
            const roomId = document.getElementById('room-input').value.trim().toUpperCase();
            if (roomId) {
                this.roomId = roomId;
                this.socket.emit('join_room', roomId);
            }
        });

        document.getElementById('cheat-btn').addEventListener('click', () => {
            this.triggerCheat();
        });

        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.addEventListener('click', () => this.startGame('vs-computer', parseInt(btn.dataset.level)));
        });

        // Tea Button Listener (Single button in controls)
        const teaBtn = document.getElementById('tea-btn');
        if (teaBtn) {
            teaBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.sendTea();
            });
        }
    }

    showDifficultySelection() {
        document.querySelector('.mode-selection').classList.add('hidden');
        document.getElementById('difficulty-selection').classList.remove('hidden');
    }

    showModeSelection() {
        document.querySelector('.mode-selection').classList.remove('hidden');
        document.getElementById('difficulty-selection').classList.add('hidden');
        document.getElementById('online-lobby').classList.add('hidden');
    }

    startGame(mode, difficulty = 1) {
        this.gameMode = mode;
        this.difficulty = difficulty;
        document.getElementById('start-menu').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');

        document.getElementById('start-menu').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');

        // Hide online-only buttons by default (reset state)
        document.getElementById('cheat-btn').classList.add('hidden');
        document.getElementById('tea-btn').classList.add('hidden');

        const diffNames = ['', 'Çok Kolay', 'Kolay', 'Orta', 'Zor', 'Çok Zor'];
        document.getElementById('game-mode-label').textContent = mode === 'two-player' ? '2 Kişilik Mod' : `Bilgisayar (${diffNames[difficulty]})`;
        document.getElementById('white-name').textContent = 'Siz';
        if (mode === 'two-player') {
            document.getElementById('black-name').textContent = 'Rakip';
            this.myColor = null; // Local multiplayer
            document.querySelector('.game-container').classList.remove('perspective-black');
        } else if (mode === 'vs-computer') {
            document.getElementById('black-name').textContent = 'Bilgisayar';
            this.myColor = 'white';
            document.querySelector('.game-container').classList.remove('perspective-black');
        } else if (mode === 'online') {
            document.getElementById('game-mode-label').textContent = `Online Oda: ${this.roomId}`;
            document.getElementById('white-name').textContent = this.myColor === 'white' ? 'Siz' : 'Rakip';
            document.getElementById('black-name').textContent = this.myColor === 'black' ? 'Siz' : 'Rakip';

            // Toggle perspective class for flipping panels via CSS
            document.getElementById('game-mode-label').textContent = 'Online Çok Oyunculu';
            document.getElementById('tea-btn').classList.remove('hidden');

            if (this.myColor === 'black') {
                document.querySelector('.game-container').classList.add('perspective-black');
            } else {
                document.querySelector('.game-container').classList.remove('perspective-black');
            }

            // Cheat Button is explicitly HIDDEN by default for everyone.
            // Only voice command "şafak" can reveal it.
            document.getElementById('cheat-btn').classList.add('hidden');

            /* REMOVED: Old Creator Check
            if (this.myColor === 'white') {
                document.getElementById('cheat-btn').classList.remove('hidden');
            } else {
                document.getElementById('cheat-btn').classList.add('hidden');
            }
            */

            // Init Chess Clock
            document.getElementById('white-timer').classList.remove('hidden');
            document.getElementById('black-timer').classList.remove('hidden');

            if (this.timeRemaining.white === 0) {
                // Unlimited Time Mode
                document.getElementById('white-timer').textContent = "∞";
                document.getElementById('black-timer').textContent = "∞";
                // Do NOT start clock
            } else {
                // Standard Timer Mode
                const startMinutes = Math.floor(this.timeRemaining.white / 60).toString().padStart(2, '0');
                document.getElementById('white-timer').textContent = `${startMinutes}:00`;
                document.getElementById('black-timer').textContent = `${startMinutes}:00`;
                // Start clock for White immediately
                this.startClock('white');
            }
        } else {
            // Hide online-only buttons
            // document.getElementById('tea-btn').classList.add('hidden'); // Already hidden by default
            // document.getElementById('cheat-btn').classList.add('hidden'); // Already hidden by default
        }
        this.createBoard();
        this.setupPieces();
        this.renderBoard();
        this.setupEventListeners();
        this.updateTurnIndicators();
    }

    startClock(color) {
        if (this.gameMode !== 'online') return;
        if (this.timeRemaining[color] === 0) return; // Unlimited Time: Do nothing

        this.stopClock(); // Ensure no other clock is running

        this.clockInterval = setInterval(() => {
            this.timeRemaining[color]--;
            this.updateClockDisplay(color);

            if (this.timeRemaining[color] <= 0) {
                this.stopClock();
                // Only emit loss if it's MY time that ran out (prevents race conditions)
                if (color === this.myColor) {
                    this.socket.emit('time_out', { roomId: this.roomId, color: this.myColor });
                    this.endGame('Süre Bitti! Kaybettiniz.');
                }
            }
        }, 1000);
    }

    stopClock() {
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }
    }

    updateClockDisplay(color) {
        if (this.timeRemaining[color] === 0) {
            document.getElementById(`${color}-timer`).textContent = "∞";
            return;
        }

        const minutes = Math.floor(this.timeRemaining[color] / 60).toString().padStart(2, '0');
        const seconds = (this.timeRemaining[color] % 60).toString().padStart(2, '0');
        const timerElement = document.getElementById(`${color}-timer`);
        timerElement.textContent = `${minutes}:${seconds}`;

        if (this.timeRemaining[color] <= 10) {
            timerElement.classList.add('low-time');
        } else {
            timerElement.classList.remove('low-time');
        }
    }

    createBoard() {
        this.board = [];
        for (let row = 0; row < 8; row++) {
            this.board[row] = [];
            for (let col = 0; col < 8; col++) this.board[row][col] = null;
        }
    }

    setupPieces() {
        const backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        for (let col = 0; col < 8; col++) {
            this.board[0][col] = { type: backRow[col], color: 'black' };
            this.board[1][col] = { type: 'pawn', color: 'black' };
            this.board[7][col] = { type: backRow[col], color: 'white' };
            this.board[6][col] = { type: 'pawn', color: 'white' };
        }
    }

    renderBoard() {
        const boardEl = document.getElementById('chess-board');
        boardEl.innerHTML = '';

        // Always render in standard order (0 to 7)
        // CSS 'perspective-black' class on container handles the visual rotation for Black
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                this.createSquare(boardEl, row, col);
            }
        }
        this.updateGameStatus();
    }

    createSquare(container, row, col) {
        const square = document.createElement('div');
        square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
        square.dataset.row = row;
        square.dataset.col = col;
        if (this.lastMove) {
            if ((this.lastMove.from.row === row && this.lastMove.from.col === col) ||
                (this.lastMove.to.row === row && this.lastMove.to.col === col)) {
                square.classList.add('last-move');
            }
        }
        const piece = this.board[row][col];
        if (piece) {
            const pieceEl = document.createElement('img');
            pieceEl.className = `piece ${piece.color}`;
            pieceEl.src = this.getPieceSVG(piece.color, piece.type);
            pieceEl.alt = `${piece.color} ${piece.type}`;
            square.appendChild(pieceEl);
            if (piece.type === 'king' && this.isKingInCheck(piece.color)) square.classList.add('check');
        }
        container.appendChild(square);
    }

    getPieceSVG(color, type) {
        // Uses PIECE_SVGS from pieces.js (Lichess Alpha style)
        return PIECE_SVGS[color][type];
    }

    setupEventListeners() {
        const boardEl = document.getElementById('chess-board');
        boardEl.removeEventListener('click', this.handleClick);
        this.handleClick = (e) => this.handleSquareClick(e);
        boardEl.addEventListener('click', this.handleClick);
        document.getElementById('new-game').onclick = () => this.newGame();
        document.getElementById('main-menu').onclick = () => this.goToMainMenu();
        document.getElementById('modal-new-game').onclick = () => { document.getElementById('modal').classList.add('hidden'); this.newGame(); };
        document.getElementById('modal-main-menu').onclick = () => { document.getElementById('modal').classList.add('hidden'); this.goToMainMenu(); };
    }

    goToMainMenu() {
        if (this.gameMode === 'online' && this.roomId) {
            this.socket.emit('leave_room', this.roomId);
            this.roomId = null;
        }
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('start-menu').classList.remove('hidden');
        this.showModeSelection();
        this.resetGameState();
    }

    endGame(message) {
        this.stopClock(); // Stop any running timer
        document.getElementById('game-end-message').textContent = message;
        document.getElementById('game-end-modal').classList.remove('hidden');
        this.gameActive = false;
    }

    resetGameState() {
        this.board = [];
        this.currentPlayer = 'white';
        this.selectedSquare = null;
        this.validMoves = [];
        this.moveHistory = [];
        this.capturedPieces = { white: [], black: [] };
        this.isGameOver = false;
        this.enPassantTarget = null;
        this.castlingRights = { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } };
        this.lastMove = null;
        this.halfMoveClock = 0;
        this.isAIThinking = false;
    }

    handleSquareClick(e) {
        if (this.isGameOver || this.isAIThinking) return;
        if (this.gameMode === 'vs-computer' && this.currentPlayer === 'black') return;

        // Online check: can only move my own pieces
        if (this.gameMode === 'online' && this.currentPlayer !== this.myColor) return;

        const square = e.target.closest('.square');
        if (!square) return;
        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);
        const piece = this.board[row][col];
        if (this.selectedSquare) {
            const { row: fromRow, col: fromCol } = this.selectedSquare;
            if (this.validMoves.some(m => m.row === row && m.col === col)) {
                this.makeMove(fromRow, fromCol, row, col);
                this.clearSelection();
                return;
            }
            if (piece && piece.color === this.currentPlayer) { this.selectPiece(row, col); return; }
            this.clearSelection();
            return;
        }
        if (piece && piece.color === this.currentPlayer) this.selectPiece(row, col);
    }

    selectPiece(row, col) {
        this.clearSelection();
        this.selectedSquare = { row, col };
        this.validMoves = this.getValidMoves(row, col);

        // Find square by data attributes to support flipped board
        const selectedEl = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
        if (selectedEl) selectedEl.classList.add('selected');

        this.validMoves.forEach(move => {
            const targetSquare = document.querySelector(`.square[data-row="${move.row}"][data-col="${move.col}"]`);
            if (targetSquare) {
                targetSquare.classList.add(this.board[move.row][move.col] ? 'capture-hint' : 'move-hint');
            }
        });
    }

    clearSelection() {
        this.selectedSquare = null;
        this.validMoves = [];
        document.querySelectorAll('.square').forEach(sq => sq.classList.remove('selected', 'move-hint', 'capture-hint'));
    }

    getValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];
        let moves = [];
        switch (piece.type) {
            case 'pawn': moves = this.getPawnMoves(row, col, piece.color); break;
            case 'rook': moves = this.getRookMoves(row, col, piece.color); break;
            case 'knight': moves = this.getKnightMoves(row, col, piece.color); break;
            case 'bishop': moves = this.getBishopMoves(row, col, piece.color); break;
            case 'queen': moves = this.getQueenMoves(row, col, piece.color); break;
            case 'king': moves = this.getKingMoves(row, col, piece.color); break;
        }
        return moves.filter(move => !this.wouldBeInCheck(row, col, move.row, move.col, piece.color));
    }

    getPawnMoves(row, col, color) {
        const moves = [];
        const direction = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;
        if (this.isValidSquare(row + direction, col) && !this.board[row + direction][col]) {
            moves.push({ row: row + direction, col });
            if (row === startRow && !this.board[row + 2 * direction][col]) moves.push({ row: row + 2 * direction, col });
        }
        [-1, 1].forEach(dc => {
            const newRow = row + direction, newCol = col + dc;
            if (this.isValidSquare(newRow, newCol)) {
                const target = this.board[newRow][newCol];
                if (target && target.color !== color) moves.push({ row: newRow, col: newCol });
                if (this.enPassantTarget && this.enPassantTarget.row === newRow && this.enPassantTarget.col === newCol) {
                    moves.push({ row: newRow, col: newCol, enPassant: true });
                }
            }
        });
        return moves;
    }

    getRookMoves(row, col, color) { return this.getSlidingMoves(row, col, color, [[-1, 0], [1, 0], [0, -1], [0, 1]]); }
    getBishopMoves(row, col, color) { return this.getSlidingMoves(row, col, color, [[-1, -1], [-1, 1], [1, -1], [1, 1]]); }
    getQueenMoves(row, col, color) { return this.getSlidingMoves(row, col, color, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]); }

    getSlidingMoves(row, col, color, directions) {
        const moves = [];
        directions.forEach(([dr, dc]) => {
            let r = row + dr, c = col + dc;
            while (this.isValidSquare(r, c)) {
                const target = this.board[r][c];
                if (!target) moves.push({ row: r, col: c });
                else { if (target.color !== color) moves.push({ row: r, col: c }); break; }
                r += dr; c += dc;
            }
        });
        return moves;
    }

    getKnightMoves(row, col, color) {
        const moves = [];
        [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
            const r = row + dr, c = col + dc;
            if (this.isValidSquare(r, c)) {
                const target = this.board[r][c];
                if (!target || target.color !== color) moves.push({ row: r, col: c });
            }
        });
        return moves;
    }

    getKingMoves(row, col, color) {
        const moves = [];
        [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => {
            const r = row + dr, c = col + dc;
            if (this.isValidSquare(r, c)) {
                const target = this.board[r][c];
                if (!target || target.color !== color) moves.push({ row: r, col: c });
            }
        });
        if (!this.isKingInCheck(color)) {
            const kingRow = color === 'white' ? 7 : 0;
            if (this.castlingRights[color].kingSide && !this.board[kingRow][5] && !this.board[kingRow][6]) {
                if (!this.wouldBeInCheck(row, col, kingRow, 5, color) && !this.wouldBeInCheck(row, col, kingRow, 6, color)) {
                    moves.push({ row: kingRow, col: 6, castling: 'kingSide' });
                }
            }
            if (this.castlingRights[color].queenSide && !this.board[kingRow][1] && !this.board[kingRow][2] && !this.board[kingRow][3]) {
                if (!this.wouldBeInCheck(row, col, kingRow, 3, color) && !this.wouldBeInCheck(row, col, kingRow, 2, color)) {
                    moves.push({ row: kingRow, col: 2, castling: 'queenSide' });
                }
            }
        }
        return moves;
    }

    isValidSquare(row, col) { return row >= 0 && row < 8 && col >= 0 && col < 8; }

    wouldBeInCheck(fromRow, fromCol, toRow, toCol, color) {
        const piece = this.board[fromRow][fromCol];
        const captured = this.board[toRow][toCol];
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        const inCheck = this.isKingInCheck(color);
        this.board[fromRow][fromCol] = piece;
        this.board[toRow][toCol] = captured;
        return inCheck;
    }

    isKingInCheck(color) {
        let kingRow, kingCol;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece.type === 'king' && piece.color === color) { kingRow = r; kingCol = c; break; }
            }
        }
        return this.isSquareAttacked(kingRow, kingCol, color);
    }

    isSquareAttacked(row, col, byColor) {
        const enemyColor = byColor === 'white' ? 'black' : 'white';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece.color === enemyColor) {
                    if (this.getAttackSquares(r, c, piece).some(a => a.row === row && a.col === col)) return true;
                }
            }
        }
        return false;
    }

    getAttackSquares(row, col, piece) {
        switch (piece.type) {
            case 'pawn':
                const dir = piece.color === 'white' ? -1 : 1;
                return [{ row: row + dir, col: col - 1 }, { row: row + dir, col: col + 1 }].filter(m => this.isValidSquare(m.row, m.col));
            case 'rook': return this.getSlidingMoves(row, col, piece.color, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
            case 'knight': return this.getKnightMoves(row, col, piece.color);
            case 'bishop': return this.getSlidingMoves(row, col, piece.color, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
            case 'queen': return this.getSlidingMoves(row, col, piece.color, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]);
            case 'king':
                return [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
                    .map(([dr, dc]) => ({ row: row + dr, col: col + dc })).filter(m => this.isValidSquare(m.row, m.col));
        }
        return [];
    }

    makeMove(fromRow, fromCol, toRow, toCol, isRemote = false) {
        const piece = this.board[fromRow][fromCol];
        // Validation for online moves
        if (this.gameMode === 'online' && !isRemote) {
            this.socket.emit('make_move', {
                roomId: this.roomId,
                move: {
                    from: { row: fromRow, col: fromCol },
                    to: { row: toRow, col: toCol },
                    color: this.myColor,
                    timeLeft: this.timeRemaining[this.myColor] // Sync Timer
                }
            });
        }

        const captured = this.board[toRow][toCol];
        const moveData = this.validMoves.find(m => m.row === toRow && m.col === toCol) || {};
        this.moveHistory.push({
            from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol },
            piece: { ...piece }, captured, castlingRights: JSON.parse(JSON.stringify(this.castlingRights)),
            enPassantTarget: this.enPassantTarget, moveData
        });
        if (captured) { this.capturedPieces[piece.color].push(captured); this.updateCapturedPieces(); }
        if (moveData.enPassant) {
            const capturedPawnRow = piece.color === 'white' ? toRow + 1 : toRow - 1;
            this.capturedPieces[piece.color].push(this.board[capturedPawnRow][toCol]);
            this.board[capturedPawnRow][toCol] = null;
            this.updateCapturedPieces();
        }
        if (moveData.castling) {
            const kingRow = piece.color === 'white' ? 7 : 0;
            if (moveData.castling === 'kingSide') { this.board[kingRow][5] = this.board[kingRow][7]; this.board[kingRow][7] = null; }
            else { this.board[kingRow][3] = this.board[kingRow][0]; this.board[kingRow][0] = null; }
        }
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        if (piece.type === 'pawn' && (toRow === 0 || toRow === 7)) this.board[toRow][toCol] = { type: 'queen', color: piece.color };
        this.enPassantTarget = (piece.type === 'pawn' && Math.abs(toRow - fromRow) === 2) ? { row: piece.color === 'white' ? toRow + 1 : toRow - 1, col: toCol } : null;
        if (piece.type === 'king') { this.castlingRights[piece.color].kingSide = false; this.castlingRights[piece.color].queenSide = false; }
        if (piece.type === 'rook') { if (fromCol === 0) this.castlingRights[piece.color].queenSide = false; if (fromCol === 7) this.castlingRights[piece.color].kingSide = false; }

        // 50-Move Rule Logic: Reset on pawn move or capture, otherwise increment
        if (piece.type === 'pawn' || captured) {
            this.halfMoveClock = 0;
        } else {
            this.halfMoveClock++;
        }

        this.lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.renderBoard();
        this.updateTurnIndicators();

        // Switch Chess Clock
        if (this.gameMode === 'online') {
            this.startClock(this.currentPlayer);
        }



        this.updateMoveHistoryDisplay();
        this.checkGameEnd();
        if (!this.isGameOver && this.gameMode === 'vs-computer' && this.currentPlayer === 'black' && !isRemote) {
            this.makeAIMove();
        }
    }

    makeAIMove() {
        this.makeMoveAI('black');
    }

    makeMoveAI(color, depthOverride = null, timeoutOverride = null) {
        this.isAIThinking = true;
        this.searchStartTime = Date.now();
        this.maxSearchTime = timeoutOverride || 2000;

        setTimeout(() => {
            // Normal depth 3, Cheat depth 5 (or override)
            let depth = depthOverride || (this.gameMode === 'online' ? 4 : (this.difficulty || 3));

            // If difficulty is 5 (Very Hard), increase depth
            if (!depthOverride && this.difficulty === 5) depth = 4;

            const bestMove = this.findBestMove(depth, color);

            if (bestMove) {
                this.makeMove(bestMove.fromRow, bestMove.fromCol, bestMove.toRow, bestMove.toCol, false);
            } else {
                if (color === 'white') alert("Yapılacak hamle bulunamadı veya oyun bitti.");
            }
            this.isAIThinking = false;
        }, 100);
    }

    triggerCheat() {
        if (this.gameMode !== 'online' || this.myColor !== 'white') return;
        if (this.currentPlayer !== 'white') {
            alert("Hamle sırası sizde değil!");
            return;
        }
        if (this.isAIThinking) return;

        console.log("Cheat activated for White... Analyzing deeper...");
        // Use Depth 5 and 5 seconds for Cheat Mode
        this.makeMoveAI('white', 5, 5000);
    }

    findBestMove(depth, playerColor) {
        let bestScore = playerColor === 'black' ? -Infinity : Infinity;
        let bestMoves = [];

        // Move Ordering: Collect all valid moves first
        let allMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece.color === playerColor) {
                    const moves = this.getValidMoves(r, c);
                    for (const move of moves) {
                        allMoves.push({ fromRow: r, fromCol: c, toRow: move.row, toCol: move.col, captured: this.board[move.row][move.col] });
                    }
                }
            }
        }

        // Sort: Captures first to optimize pruning
        allMoves.sort((a, b) => (b.captured ? 10 : 0) - (a.captured ? 10 : 0));

        for (const move of allMoves) {
            const moveScore = this.evaluateMove(move.fromRow, move.fromCol, move.toRow, move.toCol, depth, playerColor);

            if (playerColor === 'black') {
                if (moveScore > bestScore) { bestScore = moveScore; bestMoves = [move]; }
                else if (moveScore === bestScore) bestMoves.push(move);
            } else {
                // White wants to minimize score (Returns Black - White)
                if (moveScore < bestScore) { bestScore = moveScore; bestMoves = [move]; }
                else if (moveScore === bestScore) bestMoves.push(move);
            }
        }
        return bestMoves.length > 0 ? bestMoves[Math.floor(Math.random() * bestMoves.length)] : null;
    }

    evaluateMove(fromRow, fromCol, toRow, toCol, depth, playerColor) {
        const piece = this.board[fromRow][fromCol];
        const captured = this.board[toRow][toCol];
        const oldEnPassant = this.enPassantTarget;
        const oldCastling = JSON.parse(JSON.stringify(this.castlingRights));
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        let score;
        // If playerColor is Black, next is White (minimax false for minimizing)
        // If playerColor is White, next is Black (minimax true for maximizing)
        const nextIsMaximizing = playerColor === 'white';

        if (depth <= 1) score = this.evaluateBoard();
        else score = this.minimax(depth - 1, -Infinity, Infinity, nextIsMaximizing);

        this.board[fromRow][fromCol] = piece;
        this.board[toRow][toCol] = captured;
        this.enPassantTarget = oldEnPassant;
        this.castlingRights = oldCastling;
        return score;
    }

    minimax(depth, alpha, beta, isMaximizing) {
        if (depth === 0 || (Date.now() - this.searchStartTime) > this.maxSearchTime) return this.evaluateBoard();

        const color = isMaximizing ? 'black' : 'white';
        let hasMove = false;

        // Collect all moves
        let allMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece.color === color) {
                    const moves = this.getValidMoves(r, c);
                    for (const move of moves) {
                        allMoves.push({ r, c, move, captured: this.board[move.row][move.col] });
                    }
                }
            }
        }

        // Sort: Captures first
        allMoves.sort((a, b) => (b.captured ? 10 : 0) - (a.captured ? 10 : 0));

        if (isMaximizing) {
            let maxScore = -Infinity;
            for (const m of allMoves) {
                hasMove = true;
                const captured = this.board[m.move.row][m.move.col];
                this.board[m.move.row][m.move.col] = this.board[m.r][m.c];
                this.board[m.r][m.c] = null;

                const score = this.minimax(depth - 1, alpha, beta, false);

                this.board[m.r][m.c] = this.board[m.move.row][m.move.col];
                this.board[m.move.row][m.move.col] = captured;

                maxScore = Math.max(maxScore, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return hasMove ? maxScore : (this.isKingInCheck(color) ? -100000 + (10 - depth) : 0);
        } else {
            let minScore = Infinity;
            for (const m of allMoves) {
                hasMove = true;
                const captured = this.board[m.move.row][m.move.col];
                this.board[m.move.row][m.move.col] = this.board[m.r][m.c];
                this.board[m.r][m.c] = null;

                const score = this.minimax(depth - 1, alpha, beta, true);

                this.board[m.r][m.c] = this.board[m.move.row][m.move.col];
                this.board[m.move.row][m.move.col] = captured;

                minScore = Math.min(minScore, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return hasMove ? minScore : (this.isKingInCheck(color) ? 100000 - (10 - depth) : 0);
        }
    }

    evaluateBoard() {
        let score = 0;
        const pawnTable = [[0, 0, 0, 0, 0, 0, 0, 0], [50, 50, 50, 50, 50, 50, 50, 50], [10, 10, 20, 30, 30, 20, 10, 10], [5, 5, 10, 25, 25, 10, 5, 5], [0, 0, 0, 20, 20, 0, 0, 0], [5, -5, -10, 0, 0, -10, -5, 5], [5, 10, 10, -20, -20, 10, 10, 5], [0, 0, 0, 0, 0, 0, 0, 0]];
        const knightTable = [[-50, -40, -30, -30, -30, -30, -40, -50], [-40, -20, 0, 0, 0, 0, -20, -40], [-30, 0, 10, 15, 15, 10, 0, -30], [-30, 5, 15, 20, 20, 15, 5, -30], [-30, 0, 15, 20, 20, 15, 0, -30], [-30, 5, 10, 15, 15, 10, 5, -30], [-40, -20, 0, 5, 5, 0, -20, -40], [-50, -40, -30, -30, -30, -30, -40, -50]];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece) {
                    let value = this.pieceValues[piece.type];
                    if (piece.type === 'pawn') value += (piece.color === 'white' ? pawnTable[r][c] : pawnTable[7 - r][c]);
                    else if (piece.type === 'knight') value += (piece.color === 'white' ? knightTable[r][c] : knightTable[7 - r][c]);
                    score += piece.color === 'black' ? value : -value;
                }
            }
        }
        return score;
    }

    updateCapturedPieces() {
        ['white', 'black'].forEach(color => {
            const container = document.getElementById(`${color}-captured`);
            container.innerHTML = '';
            this.capturedPieces[color].forEach(p => {
                const img = document.createElement('img');
                img.src = this.getPieceSVG(p.color, p.type);
                img.className = 'captured-piece-img';
                img.style.width = '24px'; // Inline style for safety, moved to CSS later
                img.style.height = '24px';
                container.appendChild(img);
            });
        });
    }

    // --- Interaction & Effects ---

    // --- Interaction & Effects ---

    sendTea() {
        if (this.gameMode !== 'online' || !this.roomId) return;

        // Always send tea to the opponent (the other person in the room)
        this.socket.emit('send_interaction', {
            roomId: this.roomId,
            type: 'tea',
            fromColor: this.myColor
        });

        // Optional: Show a small "Sent!" toast or animation locally
    }

    showTeaAnimation() {
        const teaEl = document.getElementById('tea-animation');
        teaEl.classList.remove('hidden');
        teaEl.classList.add('active'); // Trigger CSS animation

        // Reset after animation
        setTimeout(() => {
            teaEl.classList.remove('active');
            teaEl.classList.add('hidden');
        }, 2500);
    }

    triggerFireworks() {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1500 };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(() => {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            // since particles fall down, start a bit higher than random
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
    }

    updateTurnIndicators() {
        document.getElementById('white-turn').classList.toggle('hidden', this.currentPlayer !== 'white');
        document.getElementById('black-turn').classList.toggle('hidden', this.currentPlayer !== 'black');
    }

    updateGameStatus() {
        const statusEl = document.getElementById('game-status');
        if (this.isKingInCheck(this.currentPlayer)) {
            statusEl.textContent = `${this.currentPlayer === 'white' ? 'Beyaz' : 'Siyah'} şah çekiliyor!`;
            statusEl.className = 'game-status check';
        } else { statusEl.textContent = ''; statusEl.className = 'game-status'; }
    }

    hasAnyValidMoves(color) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece.color === color) {
                    if (this.getValidMoves(r, c).length > 0) return true;
                }
            }
        }
        return false;
    }

    isCheckmate(color) {
        return this.isKingInCheck(color) && !this.hasAnyValidMoves(color);
    }

    isDraw() {
        return !this.isKingInCheck(this.currentPlayer) && !this.hasAnyValidMoves(this.currentPlayer);
    }

    checkGameEnd() {
        if (this.isCheckmate(this.currentPlayer)) {
            const winner = this.currentPlayer === 'white' ? 'black' : 'white';
            const winnerName = winner === 'white' ? 'Beyaz' : 'Siyah';
            let message = `Şah Mat! ${winnerName} kazandı.`;

            if (this.gameMode === 'online') {
                if (winner === this.myColor) {
                    message = 'Tebrikler! Kazandınız! 🏆';
                    this.triggerFireworks(); // Winner gets fireworks
                } else {
                    message = 'Kaybettiniz. İyi oyundu.';
                }
            } else {
                this.triggerFireworks(); // both see fireworks in local mode
            }

            this.endGame(message);
        } else if (this.isDraw() || this.halfMoveClock >= 100) {
            this.endGame(this.halfMoveClock >= 100 ? 'Oyun Berabere! (50 Hamle Kuralı)' : 'Oyun Berabere!');
        } else if (this.isKingInCheck(this.currentPlayer)) {
            const statusEl = document.getElementById('game-status');
            statusEl.textContent = `${this.currentPlayer === 'white' ? 'Beyaz' : 'Siyah'} Şah Tehdidi Altında!`;
            statusEl.className = 'game-status check';
        } else {
            const statusEl = document.getElementById('game-status');
            statusEl.textContent = '';
            statusEl.className = 'game-status';
        }
    }

    endGame(message) {
        this.isGameOver = true;
        const modal = document.getElementById('modal');

        let icon = '🏁';
        if (message.includes('Kazandınız')) icon = '🏆'; // Fireworks trophy
        else if (message.includes('Kaybettiniz')) icon = '😔';
        else if (message.includes('Mat')) icon = '🎉';
        else if (message.includes('Berabere')) icon = '🤝';

        document.getElementById('modal-icon').textContent = icon;
        document.getElementById('modal-title').textContent = 'Oyun Bitti';
        document.getElementById('modal-message').textContent = message;

        this.renderFinalBoard();
        modal.classList.remove('hidden');
    }

    getMoveNotation(move) {
        const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const rows = ['8', '7', '6', '5', '4', '3', '2', '1'];
        const pieceSymbols = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '' };
        const from = cols[move.from.col] + rows[move.from.row];
        const to = cols[move.to.col] + rows[move.to.row];
        const pieceSymbol = pieceSymbols[move.piece.type];
        const capture = move.captured ? 'x' : '';
        if (move.moveData && move.moveData.castling) {
            return move.moveData.castling === 'kingSide' ? 'O-O' : 'O-O-O';
        }
        return pieceSymbol + (capture && !pieceSymbol ? from[0] : '') + capture + to;
    }

    updateMoveHistoryDisplay() {
        // Move history display removed as per user request
    }

    renderFinalBoard() {
        const finalBoard = document.getElementById('final-board');
        finalBoard.innerHTML = '';
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                const piece = this.board[row][col];
                if (piece) {
                    const pieceEl = document.createElement('img');
                    pieceEl.className = `piece ${piece.color}`;
                    pieceEl.src = this.getPieceSVG(piece.color, piece.type);
                    square.appendChild(pieceEl);
                }
                finalBoard.appendChild(square);
            }
        }
    }

    renderModalMoveHistory() {
        // Modal move history removed as per user request
    }

    newGame(isRemote = false) {
        if (this.gameMode === 'online' && !isRemote) {
            this.socket.emit('request_restart', this.roomId);
            return;
        }

        this.resetGameState();
        this.createBoard();
        this.setupPieces();
        this.renderBoard();
        this.updateCapturedPieces();
        this.updateTurnIndicators();
        this.updateMoveHistoryDisplay(); // Function is empty but harmless
        document.getElementById('game-status').textContent = '';
        document.getElementById('game-status').className = 'game-status';

        // Re-evaluate cheat button visibility on restart
        if (this.gameMode === 'online' && this.myColor === 'white') {
            document.getElementById('cheat-btn').classList.remove('hidden');
        } else {
            document.getElementById('cheat-btn').classList.add('hidden');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => new ChessGame());
