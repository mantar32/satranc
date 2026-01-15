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
        this.init();
    }

    init() {
        this.setupMenuListeners();
        this.setupSocket();
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
            });

            this.socket.on('game_start', (data) => {
                // Robustly set color based on socket ID matches
                if (this.socket.id === data.white) {
                    this.myColor = 'white';
                } else if (this.socket.id === data.black) {
                    this.myColor = 'black';
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
                this.makeMove(move.from.row, move.from.col, move.to.row, move.to.col, true);
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


        document.getElementById('online-btn').addEventListener('click', () => {
            document.querySelector('.mode-selection').classList.add('hidden');
            document.getElementById('online-lobby').classList.remove('hidden');
            document.getElementById('room-wait-status').classList.add('hidden');
            document.getElementById('create-room-btn').classList.remove('hidden');
            document.querySelector('.join-room-section').classList.remove('hidden');
        });

        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.socket.emit('create_room');
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

        // Hide cheat button by default (only enabled for Online White)
        document.getElementById('cheat-btn').classList.add('hidden');

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
            if (this.myColor === 'black') {
                document.querySelector('.game-container').classList.add('perspective-black');
            } else {
                document.querySelector('.game-container').classList.remove('perspective-black');
            }

            // Show Cheat Button for White player (Creator)
            if (this.myColor === 'white') {
                document.getElementById('cheat-btn').classList.remove('hidden');
            } else {
                document.getElementById('cheat-btn').classList.add('hidden');
            }
        } else {
            document.getElementById('cheat-btn').classList.add('hidden');
        }
        this.createBoard();
        this.setupPieces();
        this.renderBoard();
        this.setupEventListeners();
        this.updateTurnIndicators();
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

        const isBlack = this.gameMode === 'online' && this.myColor === 'black'; // Check if perspective should be flipped

        if (isBlack) {
            // Correct Flipped Loop:
            for (let row = 7; row >= 0; row--) {
                for (let col = 7; col >= 0; col--) {
                    this.createSquare(boardEl, row, col);
                }
            }
        } else {
            // Standard Loop: Row 0 (Top) -> 7 (Bottom), Col 0 (Left) -> 7 (Right)
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    this.createSquare(boardEl, row, col);
                }
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
        const svgs = {
            white: {
                king: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjIuNSAxMS42M2MzLjUgMCA2IDMuMTggNiA3LjQzIDAgMy41NS0xLjU3IDYuNjItNC4yIDcuNDN2OS4xM2g4LjI1djYuMThjMCAxLjYzLTEuMzcgMi45Ni0yLjk4IDIuOTZIOS45NmMtMS42MyAwLTIuOTYtMS4zMy0yLjk2LTIuOTZ2LTYuMThoOC4yNXYtOS4xM0MxMi41NyAxOC4yNSAxMSAxNS4xOCAxMSAxMS42M2MwLTQuMjUgMi41LTcuNDMgNi03LjQzek0yMi41IDI1czIuMjUgMCA0LTIuMSAyLjUtNC45IDIuNS02LjlhNi41MiA2LjUyIDAgMCAwLTYuNS02LjUgNi41MiA2LjUyIDAgMCAwLTYuNSA2LjVjMCAyIDIuNSA0LjggNC41IDYuOSAxLjc1IDIuMSA0IDIuMSA0IDIuMXptLTIzIDEwLjV2NGg0NnYtNGgtNDZ6IiBzdHJva2U9IiMwMDAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0xMS41IDMwLjVjNi44MyAzLjkxIDE1LjE3IDMuOTEgMjIgMHY0LjIzSDExLjV6IiBzdHJva2U9Im5vbmUiLz48cGF0aCBkPSJNMTEuNSAzMC41YzYuODMgMy45MSAxNS4xNyAzLjkxIDIyIDB2NC4yM0gxMS41eiIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0yMi41IDhWMi41Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTIwIDU1aDUiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjIuNSA4VjIuNSIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0yMCA1LjVoNSIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIvPjwvZz48L3N2Zz4=',
                queen: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOCAyNmMwLTIgMS41LTIgMi41LTQgMS0yLjUgMS00IDEtNCA1LjUgMyA3LjUgNi43NSAxMSA2Ljc1czUuNS0zLjc1IDExLTYuNzVjMCAwIDAtMS41IDEtNCAxLTIgMi41LTIgMi41LTRzMiA1LjUgMyA5Yy0xLjUgMi0yLjc1IDQtMi43NSA3aC0zMFYyN2MtMS41LTItMi41LTQtMi41LTlsMy04em0zNSA5LjVjMCAyLjgyLTIuMTggNS01IDVoLTI2Yy0yLjgyIDAtNS0yLjE4LTUtNXMuMTgtNSAzLTVoMjRjMi44MiAwIDMuIDIuMTggMyA1em0tMzMtMGMwIDIuODIgMi4xOCA1IDUgNWgyNmMyLjgyIDAgNS0yLjE4IDUtNXMuMTgtNS0zLTVoLTI0Yy0yLjgyIDAtNSAyLjE4LTUgNXoiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTExIDM4LjVjMS45MiAyLjU3IDQuODQgMTAuMyA3LjUgMTMuNWg4YzIuNjYtMy4yIDUuNTgtMTAuOTMgNy41LTEzLjUiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTExIDM4LjVjMS45MiAyLjU3IDQuODQgMTAuMyA3LjUgMTMuNWg4YzIuNjYtMy4yIDUuNTgtMTAuOTMgNy41LTEzLjUiIHN0cm9rZT0ibm9uZSIvPjxwYXRoIGQ9Ik0xMiAzN2MwIDEuNS0xLjIgMy0zIDNzLTMtMS41LTMtMyAxLjItMyAzLTMgMyAxLjUgMyAzem0xNCAwYzAgMS41LTEuMiAzLTMgM3MtMy0xLjUtMy0zIDEuMi0zIDMtMyAzIDEuNSAzIDN6bTE0IDBjMCAxLjUtMS4yIDMtMyAzcy0zLTEuNS0zLTMgMS4yLTMgMy0zIDMgMS41IDMgM3oiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJNOSAyNmMwLTIgMS41LTIgMi41LTQgMS0yLjUgMS00IDEtNCA1LjUgMyA3LjUgNi43NSAxMSA2Ljc1czUuNS0zLjc1IDExLTYuNzVjMCAwIDAtMS41IDEtNCAxLTIgMi41LTIgMi41LTRzMiA1LjUgMyA5IiBzdHJva2U9Im5vbmUiLz48cGF0aCBkPSJNOCAyNmMwLTIgMS41LTIgMi41LTQgMS0yLjUgMS00IDEtNCA1LjUgMyA3LjUgNi43NSAxMSA2Ljc1czUuNS0zLjc1IDExLTYuNzVjMCAwIDAtMS41IDEtNCAxLTIgMi41LTIgMi41LTRzMiA1LjUgMyA5Yy0xLjUgMi0yLjc1IDQtMi43NSA3aC0zMFYyN2MtMS41LTItMi41LTQtMi41LTl6IiBzdHJva2U9IiMwMDAiIGZpbGw9Im5vbmUiLz48L2c+PC9zdmc+',
                rook: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSAzOWgyN3YtM0g5djN6bTMuNS03bDQuNS02LjVoMTVjMCAwIDEuNSAzLjUgNCA2LjUgMCAwLTMuNS0zLjUtMTktN3oiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTE0IDI5LjV2LTEzaDE3djEzIiBzdHJva2UtbGluZWNhcD0iYnV0dCIvPjxwYXRoIGQ9Ik0xNCAxNi41TDExIDE0aDIzbC0zIDIuNUgxNHoiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTEyIDE0VjlIODJ2NUgxMnpNMjAgOXYtM2g1djNIMjB6IiBzdHJva2UtbGluZWNhcD0iYnV0dCIvPjxwYXRoIGQ9Ik0xMiAxNFY5SDgydjVIMTJ6IiBzdHJva2U9Im5vbmUiLz48cGF0aCBkPSJNMTEgMTVjMi44MyAwIDUuNS0xLjI4IDUuNS0zTDE3IDYgMzIgMTZsLTQuMjUtMi41QzI3LjI3IDEzLjcyIDMwLjE3IDE1IDMzIDE1IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTEyIDE0bDE3LTUgMTUgNSIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik05IDQyaDI3IiBzdHJva2UtbGluZWNhcD0iYnV0dCIvPjxwYXRoIGQ9Ik0zMSAzMHY5TSAxNCAzMHY5IiBmaWxsPSJub25lIi8+PC9nPjwvc3ZnPg==',
                bishop: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSAzNmMzLjM5LS45NyA5LjExLTEuNDUgMTMuNS0xLjQ1IDQuMzkgMCAxMC4xMS40OCAxMy41IDEuNDVWNDFIOXYtNXptMy41LTcuNWMxLjMzIDQuMTkgMy41IDYuMyA1LjUgNi4zIDIuNTUgMCA1LjAxLS41MyA3LTIuNTMteC40OCA2LjUtNCA2LjUtNSA2LjVoLTEyem00LjUtMTEuNUMxNy41IDE1IDIxLjU5IDEwIDI4IDEyLjI4Yy42Ny0uMzIgMS41NS0uNjYgMi4xMy0xLjAxIDIuMjYtMS4zNyAyLTQuNjktLjQ0LTUuNzQtMi0uODYtNC4yLjIyLTQuNzQgMS4zMy0yLjg4Ljg4LTQuMDQgMy4wNS02Ljk1IDQuMTl2My41em00LTIwYzAgMi4yMS0xLjc5IDQtNCA0cy00LTEuNzktNC00IDEuNzktNCA0LTQgNCAxLjc5IDQgNHoiLz48cGF0aCBkPSJNMTEuNSAzNi41YzIuMjYtMi40MyA1LjE5LTQuNDMgOC41LTQuNDMgNC4xNCAwIDYuODIgMi40NyA3LjUgNi40MyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiLz48cGF0aCBkPSJNMjIgOWMtMi4yMSAwLTQgMS43OS00IDRzMS43OSA0IDQgNCA0LTEuNzkgNC00LTEuNzktNC00LTR6IiBmaWxsPSJub25lIiBzdHJva2U9Im5vbmUiLz48cGF0aCBkPSJNMzEgMjlMNjIgMjIuNSIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0xNSAzMC41bDE0IDE0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTE1IDMwLjVsMTQgMTQiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PC9nPjwvc3ZnPg==',
                knight: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGw9IiNmZmYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjIgMTBjOC4yNS0xLjggMTAuMjUgMi43NiAxMC4yNSA4LjMyIDAgNS41NS02LjUgOS4zMy04LjUgMTMuNjggMTEuMjUgMTEuMjUgMi41IDE3IDIuNSAxNyAzLjU4LS40NSA2LTIuODggNi01LjQ1cTMuNDItMy4yNSA1LjQtNmMuODItMy42MiAzLjg4LTExIDMuODgtMTFzMy4zLTMuOTUgMy4zLTguNy0xNi41LTMuODgtMTYuNS0zLjg4em0tNC41IDEwLjVjLjc1IDAgMi4yNS0uOTggMi4yNS0yLjUzIDAtOS44LTMtMS45NS0zLTEuOTVzLTMgMC0zIDEuOTUgMi4yNSAyLjUzIDMgMi41M3oiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTkuNSAyNS41YzAgMS41IDEuNSAyLjUgNCAyLjVzNC0xIDQtMi41YzAtMS41LTEuNS0yLjUtNC0yLjVzLTQgMS00IDIuNXptOC41LTdjLTEgMS41LTMuNSAyLjUtNiAydjFjMyAuNSAzLjUgMS41IDUgNHoiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJNMjQgMThsLTQuNSAyNyIgc3Ryb2tlPSJub25lIi8+PHBhdGggZD0iTTI1LjUgMzBMMjQgMTgiIGZpbGw9Im5vbmUiLz48L2c+PC9zdmc+',
                pawn: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxwYXRoIGQ9Ik0yMi41IDljLTEuOTcgMC0zLjc0Ljk4LTQuOTUgMi42My0xLjMzIDEuODItMS44OCA0LjM4LS42IDYuMzZsLS43NCAzLjg4Yy0uMzMtLjA3LS42Ny0uMS0xLjAyLS4xLTEuODUgMC0zLjQyIDEuMzItMy40MiAzLjUgMCAuOTYuMzcgMS44Mi45OCAyLjQ2LS42OC43Mi0xLjEgMS42OC0xLjEgMi43NiAwIDEuNzIgMS4wOCAzLjIgMi42NSAzLjk2Yy0uNDUuNzMtMS4xMyAxLjkxLTEuMTMgMy4wMSAwIDEuNzkgMS41IDMuNSAzLjQ2IDMuNWguNTJjMS45OCAwIDMuNDYtMS43MSAzLjQ2LTMuNSAwLTEuMS0uNjktMi4yOC0xLjE0LTMuMDFBMi4xOCAyLjE4IDAgMCAwIDI1LjggMzVjMS41Ny0uNzYgMi42NS0yLjI0IDIuNjUtMy45NiAwLTEuMDgtLjQyLTIuMDQtMS4xLTIuNzUuNi0uNjQuOTgtMS41Ljk4LTIuNDYgMC0yLjE4LTEuNTctMy41LTMuNDItMy41LS4zNiAwLS43LjAzLTEuMDIuMWwtLjc1LTMuODhDLjYgMTMuMzggMy4wNSAxNiAzMy41IDE2Yy0xLjIxLTEuNjUtMi45OS0yLjYzLTQuOTUtMi42M3oiIGZpbGw9IiNmZmYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg=='
            },
            black: {
                king: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjIuNSAxMS42M2MzLjUgMCA2IDMuMTggNiA3LjQzIDAgMy41NS0xLjU3IDYuNjItNC4yIDcuNDN2OS4xM2g4LjI1djYuMThjMCAxLjYzLTEuMzcgMi45Ni0yLjk4IDIuOTZIOS45NmMtMS42MyAwLTIuOTYtMS4zMy0yLjk2LTIuOTZ2LTYuMThoOC4yNXYtOS4xM0MxMi41NyAxOC4yNSAxMSAxNS4xOCAxMSAxMS42M2MwLTQuMjUgMi41LTcuNDMgNi03LjQzek0yMi41IDI1czIuMjUgMCA0LTIuMSAyLjUtNC45IDIuNS02LjlhNi41MiA2LjUyIDAgMCAwLTYuNS02LjUgNi41MiA2LjUyIDAgMCAwLTYuNSA2LjVjMCAyIDIuNSA0LjggNC41IDYuOSAxLjc1IDIuMSA0IDIuMSA0IDIuMXptLTIzIDEwLjV2NGg0NnYtNGgtNDZ6IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBmaWxsPSJub25lIiBkPSJNMTEuNSAzMC41YzYuODMgMy45MSAxNS4xNyAzLjkxIDIyIDB2NC4yM0gxMS41eiIgc3Ryb2tlPSJub25lIi8+PHBhdGggZD0iTTExLjUgMzAuNWM2LjgzIDMuOTEgMTUuMTcgMy45MSAyMiAwdjQuMjNIMTEuNXoiLz48cGF0aCBmaWxsPSJub25lIiBkPSJNMjIuNSA4VjIuNSIvPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0yMCA1NWg1Ii8+PHBhdGggZmlsbD0ibm9uZSIgZD0iTTIyLjUgOFYyLjUiIHN0cm9rZS1saW5lY2FwPSJidXR0IiBzdHJva2UtbGluZWpvaW49Im1pdGVyIi8+PHBhdGggZmlsbD0ibm9uZSIgZD0iTTIwIDUuNWg1IiBzdHJva2UtbGluZWNhcD0iYnV0dCIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIvPjwvZz48L3N2Zz4=',
                queen: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOCAyNmMwLTIgMS41LTIgMi41LTQgMS0yLjUgMS00IDEtNCA1LjUgMyA3LjUgNi43NSAxMSA2Ljc1czUuNS0zLjc1IDExLTYuNzVjMCAwIDAtMS41IDEtNCAxLTIgMi41LTIgMi41LTRzMiA1LjUgMyA5Yy0xLjUgMi0yLjc1IDQtMi43NSA3aC0zMFYyN2MtMS41LTItMi41LTQtMi41LTl6bTM1IDkuNWMwIDIuODItMi4xOCA1LTUgNWgtMjZjLTIuODIgMC01LTIuMTgtNS01cy4xOC01IDMtNWgyNGMyLjgyIDAgMy4gMi4xOCAzIDV6bS0zMy0wYzAgMi44MiAyLjE4IDUgNSA1aDI2YzIuODIgMCA1LTIuMTggNS01cy4xOC01LTMtNWgtMjRjLTIuODIgMC01IDIuMTgtNSA1eiIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiLz48cGF0aCBkPSJNMTEgMzguNWMxLjkyIDIuNTcgNC44NCAxMC4zIDcuNSAxMy41aDhjMi42Ni0zLjIgNS41OC0xMC45MyA3LjUtMTMuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiLz48cGF0aCBkPSJNMTEgMzguNWMxLjkyIDIuNTcgNC44NCAxMC4zIDcuNSAxMy41aDhjMi42Ni0zLjIgNS41OC0xMC45MyA3LjUtMTMuNSIgc3Ryb2tlPSJub25lIi8+PHBhdGggZD0iTTEyIDM3YzAgMS41LTEuMiAzLTMgM3MtMy0xLjUtMy0zIDEuMi0zIDMtMyAzIDEuNSAzIDN6bTE0IDBjMCAxLjUtMS4yIDMtMyAzcy0zLTEuNS0zLTMgMS4yLTMgMy0zIDMgMS41IDMgM3ptMTQgMGMwIDEuNS0xLjIgMy0zIDNzLTMtMS41LTMtMyAxLjItMyAzLTMgMyAxLjUgMyAzeiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik05IDI2YzAtMiAxLjUtMiAyLjUtNCAxLTIuNSAxLTQgMS00IDUuNSAzIDcuNSA2Ljc1IDExIDYuNzVzNS41LTMuNzUgMTEtNi43NWMwIDAgMC0xLjUgMS00IDEtMiAyLjUtMiAyLjUtNHMyIDUuNSAzIDkiIHN0cm9rZT0ibm9uZSIvPjxwYXRoIGQ9Ik04IDI2YzAtMiAxLjUtMiAyLjUtNCAxLTIuNSAxLTQgMS00IDUuNSAzIDcuNSA2Ljc1IDExIDYuNzVzNS41LTMuNzUgMTEtNi43NWMwIDAgMC0xLjUgMS00IDEtMiAyLjUtMiAyLjUtNHMyIDUuNSAzIDljLTEuNSAyLTIuNzUgNC0yLjc1IDdoLTMwVjI3Yy0xLjUtMi0yLjUtNC0yLjUtOXoiIHN0cm9rZT0iIzAwMCIgZmlsbD0ibm9uZSIvPjwvZz48L3N2Zz4=',
                rook: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSAzOWgyN3YtM0g5djN6bTMuNS03bDQuNS02LjVoMTVjMCAwIDEuNSAzLjUgNCA2LjUgMCAwLTMuNS0zLjUtMTktN3oiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTE0IDI5LjV2LTEzaDE3djEzIiBzdHJva2UtbGluZWNhcD0iYnV0dCIvPjxwYXRoIGQ9Ik0xNCAxNi41TDExIDE0aDIzbC0zIDIuNUgxNHoiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTEyIDE0VjlIODJ2NUgxMnpNMjAgOXYtM2g1djNIMjB6IiBzdHJva2UtbGluZWNhcD0iYnV0dCIvPjxwYXRoIGQ9Ik0xMiAxNFY5SDgydjVIMTJ6IiBzdHJva2U9Im5vbmUiLz48cGF0aCBkPSJNMTEgMTVjMi44MyAwIDUuNS0xLjI4IDUuNS0zTDE3IDYgMzIgMTZsLTQuMjUtMi41QzI3LjI3IDEzLjcyIDMwLjE3IDE1IDMzIDE1IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTEyIDE0bDE3LTUgMTUgNSIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik05IDQyaDI3IiBzdHJva2UtbGluZWNhcD0iYnV0dCIvPjxwYXRoIGQ9Ik0zMSAzMHY5TSAxNCAzMHY5IiBmaWxsPSJub25lIi8+PC9nPjwvc3ZnPg==',
                bishop: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSAzNmMzLjM5LS45NyA5LjExLTEuNDUgMTMuNS0xLjQ1IDQuMzkgMCAxMC4xMS40OCAxMy41IDEuNDVWNDFIOXYtNXptMy41LTcuNWMxLjMzIDQuMTkgMy41IDYuMyA1LjUgNi4zIDIuNTUgMCA1LjAxLS41MyA3LTIuNTMteC40OCA2LjUtNCA2LjUtNSA2LjVoLTEyem00LjUtMTEuNUMxNy41IDE1IDIxLjU5IDEwIDI4IDEyLjI4Yy42Ny0uMzIgMS41NS0uNjYgMi4xMy0xLjAxIDIuMjYtMS4zNyAyLTQuNjktLjQ0LTUuNzQtMi0uODYtNC4yLjIyLTQuNzQgMS4zMy0yLjg4Ljg4LTQuMDQgMy4wNS02Ljk1IDQuMTl2My41em00LTIwYzAgMi4yMS0xLjc5IDQtNCA0cy00LTEuNzktNC00IDEuNzktNCA0LTQgNCAxLjc5IDQgNHoiLz48cGF0aCBkPSJNMTEuNSAzNi41YzIuMjYtMi40MyA1LjE5LTQuNDMgOC41LTQuNDMgNC4xNCAwIDYuODIgMi40NyA7LjUgNi40MyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiLz48cGF0aCBkPSJNMjIgOWMtMi4yMSAwLTQgMS43OS00IDRzMS43OSA0IDQgNCA0LTEuNzkgNC00LTEuNzktNC00LTR6IiBmaWxsPSJub25lIiBzdHJva2U9Im5vbmUiLz48cGF0aCBkPSJNMzEgMjlMNjIgMjIuNSIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0xNSAzMC41bDE0IDE0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTE1IDMwLjVsMTQgMTQiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PC9nPjwvc3ZnPg==',
                knight: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxnIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjIgMTBjOC4yNS0xLjggMTAuMjUgMi43NiAxMC4yNSA4LjMyIDAgNS41NS02LjUgOS4zMy04LjUgMTMuNjggMTEuMjUgMTEuMjUgMi41IDE3IDIuNSAxNyAzLjU4LS40NSA2LTIuODggNi01LjQ1cTMuNDItMy4yNSA1LjQtNmMuODItMy42MiAzLjg4LTExIDMuODgtMTFzMy4zLTMuOTUgMy4zLTguNy0xNi41LTMuODgtMTYuNS0zLjg4em0tNC41IDEwLjVjLjc1IDAgMi4yNS0uOTggMi4yNS0yLjUzIDAtOS44LTMtMS45NS0zLTEuOTVzLTMgMC0zIDEuOTUgMi4yNSAyLjUzIDMgMi41M3oiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTkuNSAyNS41YzAgMS41IDEuNSAyLjUgNCAyLjVzNC0xIDQtMi41YzAtMS41LTEuNS0yLjUtNC0yLjVzLTQgMS00IDIuNXptOC41LTdjLTEgMS41LTMuNSAyLjUtNiAydjFjMyAuNSAzLjUgMS41IDUgNHoiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJNMjQgMThsLTQuNSAyNyIgc3Ryb2tlPSJub25lIi8+PHBhdGggZD0iTTI1LjUgMzBMMjQgMTgiIGZpbGw9Im5vbmUiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNOTUgNDBoLTUiIHN0cm9rZT0ibm9uZSIvPjwvZz48L3N2Zz4=',
                pawn: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NSA0NSIgY2xhc3M9ImNnLWljb24iPjxwYXRoIGQ9Ik0yMi41IDljLTEuOTcgMC0zLjc0Ljk4LTQuOTUgMi42My0xLjMzIDEuODItMS44OCA0LjM4LS42IDYuMzZsLS43NCAzLjg4Yy0uMzMtLjA3LS42Ny0uMS0xLjAyLS4xLTEuODUgMC0zLjQyIDEuMzItMy40MiAzLjUgMCAuOTYuMzcgMS44Mi45OCAyLjQ2LS42OC43Mi0xLjEgMS42OC0xLjEgMi43NiAwIDEuNzIgMS4wOCAzLjIgMi42NSAzLjk2Yy0uNDUuNzMtMS4xMyAxLjkxLTEuMTMgMy4wMSAwIDEuNzkgMS41IDMuNSAzLjQ2IDMuNWguNTJjMS45OCAwIDMuNDYtMS43MSAzLjQ2LTMuNSAwLTEuMS0uNjktMi4yOC0xLjE0LTMuMDFBMi4xOCAyLjE4IDAgMCAwIDI1LjggMzVjMS41Ny0uNzYgMi42NS0yLjI0IDIuNjUtMy45NiAwLTEuMDgtLjQyLTIuMDQtMS4xLTIuNzUuNi0uNjQuOTgtMS41Ljk4LTIuNDYgMC0yLjE4LTEuNTctMy41LTMuNDItMy41LS4zNiAwLS43LjAzLTEuMDIuMWwtLjc1LTMuODhDLjYgMTMuMzggMy4wNSAxNiAzMy41IDE2Yy0xLjIxLTEuNjUtMi45OS0yLjYzLTQuOTUtMi42M3oiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg=='
            }
        };
        return svgs[color][type];
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
        // Validation for online moves
        if (this.gameMode === 'online' && !isRemote) {
            this.socket.emit('make_move', {
                roomId: this.roomId,
                move: { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } }
            });
        }

        const piece = this.board[fromRow][fromCol];
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
        this.lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.renderBoard();
        this.updateTurnIndicators();
        this.updateMoveHistoryDisplay();
        this.checkGameEnd();
        if (!this.isGameOver && this.gameMode === 'vs-computer' && this.currentPlayer === 'black' && !isRemote) {
            this.makeAIMove();
        }
    }

    makeAIMove() {
        this.makeMoveAI('black');
    }

    makeMoveAI(color) {
        this.isAIThinking = true;
        this.searchStartTime = Date.now();
        this.maxSearchTime = 2000; // Reduce time for cheat to be faster
        setTimeout(() => {
            // Use difficulty for vs-computer, but depth 4 (smart) for online cheat
            const depth = this.gameMode === 'online' ? 4 : (this.difficulty || 3);
            const bestMove = this.findBestMove(depth, color);
            if (bestMove) {
                // For cheat, play the move immediately
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

        console.log("Cheat activated for White...");
        this.makeMoveAI('white');
    }

    findBestMove(depth, playerColor) {
        let bestScore = playerColor === 'black' ? -Infinity : Infinity;
        let bestMoves = [];

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece.color === playerColor) {
                    const moves = this.getValidMoves(r, c);
                    for (const move of moves) {
                        const moveScore = this.evaluateMove(r, c, move.row, move.col, depth, playerColor);

                        if (playerColor === 'black') {
                            if (moveScore > bestScore) { bestScore = moveScore; bestMoves = [{ fromRow: r, fromCol: c, toRow: move.row, toCol: move.col }]; }
                            else if (moveScore === bestScore) bestMoves.push({ fromRow: r, fromCol: c, toRow: move.row, toCol: move.col });
                        } else {
                            // White wants to minimize score (since evaluation returns Black - White)
                            if (moveScore < bestScore) { bestScore = moveScore; bestMoves = [{ fromRow: r, fromCol: c, toRow: move.row, toCol: move.col }]; }
                            else if (moveScore === bestScore) bestMoves.push({ fromRow: r, fromCol: c, toRow: move.row, toCol: move.col });
                        }
                    }
                }
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

        if (isMaximizing) {
            let maxScore = -Infinity;
            outer: for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = this.board[r][c];
                    if (piece && piece.color === color) {
                        const moves = this.getValidMoves(r, c);
                        for (const move of moves) {
                            hasMove = true;
                            const captured = this.board[move.row][move.col];
                            this.board[move.row][move.col] = piece;
                            this.board[r][c] = null;
                            const score = this.minimax(depth - 1, alpha, beta, false);
                            this.board[r][c] = piece;
                            this.board[move.row][move.col] = captured;
                            maxScore = Math.max(maxScore, score);
                            alpha = Math.max(alpha, score);
                            if (beta <= alpha) break outer;
                        }
                    }
                }
            }
            return hasMove ? maxScore : (this.isKingInCheck(color) ? -100000 : 0);
        } else {
            let minScore = Infinity;
            outer: for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = this.board[r][c];
                    if (piece && piece.color === color) {
                        const moves = this.getValidMoves(r, c);
                        for (const move of moves) {
                            hasMove = true;
                            const captured = this.board[move.row][move.col];
                            this.board[move.row][move.col] = piece;
                            this.board[r][c] = null;
                            const score = this.minimax(depth - 1, alpha, beta, true);
                            this.board[r][c] = piece;
                            this.board[move.row][move.col] = captured;
                            minScore = Math.min(minScore, score);
                            beta = Math.min(beta, score);
                            if (beta <= alpha) break outer;
                        }
                    }
                }
            }
            return hasMove ? minScore : (this.isKingInCheck(color) ? 100000 : 0);
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

    checkGameEnd() {
        let hasValidMoves = false;
        for (let r = 0; r < 8 && !hasValidMoves; r++) {
            for (let c = 0; c < 8 && !hasValidMoves; c++) {
                const piece = this.board[r][c];
                if (piece && piece.color === this.currentPlayer && this.getValidMoves(r, c).length > 0) hasValidMoves = true;
            }
        }
        if (!hasValidMoves) {
            this.isGameOver = true;
            const modal = document.getElementById('modal');
            const inCheck = this.isKingInCheck(this.currentPlayer);

            if (inCheck) {
                let winner;
                if (this.gameMode === 'two-player') winner = this.currentPlayer === 'white' ? 'Siyah' : 'Beyaz';
                else if (this.gameMode === 'vs-computer') winner = this.currentPlayer === 'white' ? 'Bilgisayar' : 'Siz';
                else if (this.gameMode === 'online') winner = this.currentPlayer === this.myColor ? 'Rakip' : 'Siz';

                document.getElementById('modal-icon').textContent = (this.gameMode === 'online' && winner === 'Rakip') ? '😔' : '🎉';
                document.getElementById('modal-title').textContent = 'Şah Mat!';
                document.getElementById('modal-message').textContent = `${winner} kazandı!`;
            } else {
                document.getElementById('modal-icon').textContent = '🤝';
                document.getElementById('modal-title').textContent = 'Pat!';
                document.getElementById('modal-message').textContent = 'Oyun berabere bitti.';
            }
            this.renderFinalBoard();
            this.renderModalMoveHistory();
            modal.classList.remove('hidden');
        }
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
