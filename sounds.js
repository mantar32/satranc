// Sound Effects Manager for Chess Game
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.volume = 0.5;
        this.init();
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    // Resume audio context (needed for mobile browsers)
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    // Generate move sound (soft click)
    playMove() {
        if (!this.enabled || !this.audioContext) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.05);

        gain.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

        osc.start(this.audioContext.currentTime);
        osc.stop(this.audioContext.currentTime + 0.1);
    }

    // Generate capture sound (stronger impact)
    playCapture() {
        if (!this.enabled || !this.audioContext) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const noise = this.createNoise(0.08);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.frequency.setValueAtTime(300, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.1);

        gain.gain.setValueAtTime(this.volume * 0.4, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

        osc.start(this.audioContext.currentTime);
        osc.stop(this.audioContext.currentTime + 0.15);
    }

    // Generate check sound (alert tone)
    playCheck() {
        if (!this.enabled || !this.audioContext) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(880, this.audioContext.currentTime);
        osc.frequency.setValueAtTime(660, this.audioContext.currentTime + 0.1);
        osc.frequency.setValueAtTime(880, this.audioContext.currentTime + 0.2);

        gain.gain.setValueAtTime(this.volume * 0.25, this.audioContext.currentTime);
        gain.gain.setValueAtTime(this.volume * 0.25, this.audioContext.currentTime + 0.25);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

        osc.start(this.audioContext.currentTime);
        osc.stop(this.audioContext.currentTime + 0.3);
    }

    // Generate castle sound (two clicks)
    playCastle() {
        if (!this.enabled || !this.audioContext) return;
        this.resume();

        // First click (king)
        this.playMove();

        // Second click (rook) - delayed
        setTimeout(() => this.playMove(), 100);
    }

    // Generate game end sound (victory/defeat fanfare)
    playGameEnd(isWin) {
        if (!this.enabled || !this.audioContext) return;
        this.resume();

        const notes = isWin
            ? [523, 659, 784, 1047] // C5, E5, G5, C6 (victory)
            : [392, 349, 330, 262]; // G4, F4, E4, C4 (defeat)

        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();

                osc.connect(gain);
                gain.connect(this.audioContext.destination);

                osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                gain.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

                osc.start(this.audioContext.currentTime);
                osc.stop(this.audioContext.currentTime + 0.3);
            }, i * 150);
        });
    }

    // Generate illegal move sound (error buzz)
    playIllegal() {
        if (!this.enabled || !this.audioContext) return;
        this.resume();

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.audioContext.currentTime);

        gain.gain.setValueAtTime(this.volume * 0.2, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

        osc.start(this.audioContext.currentTime);
        osc.stop(this.audioContext.currentTime + 0.1);
    }

    // Create noise burst (for capture effect)
    createNoise(duration) {
        if (!this.audioContext) return;

        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.2;
        }

        const noise = this.audioContext.createBufferSource();
        const gain = this.audioContext.createGain();

        noise.buffer = buffer;
        noise.connect(gain);
        gain.connect(this.audioContext.destination);

        gain.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        noise.start(this.audioContext.currentTime);
        noise.stop(this.audioContext.currentTime + duration);

        return noise;
    }

    // Toggle sound on/off
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
    }
}

// Create global instance
window.soundManager = new SoundManager();
