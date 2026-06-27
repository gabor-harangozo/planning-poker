// ═══════════════════════════════════════════════
// networking.js — PeerJS connection manager
// ═══════════════════════════════════════════════

import { adminPeerIdFromRoom, generatePeerId, showToast } from './utils.js';

export class Networking {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> DataConnection
        this.isAdmin = false;
        this.roomId = null;
        this.onMessage = null;        // (senderId, message) => void
        this.onPeerJoined = null;     // (peerId) => void
        this.onPeerLeft = null;       // (peerId) => void
        this.onReady = null;          // () => void
        this.onError = null;          // (error) => void
        this._retryTimers = new Map();
    }

    // ── Admin: Create a room ──
    createRoom(roomId) {
        this.isAdmin = true;
        this.roomId = roomId;
        const peerId = adminPeerIdFromRoom(roomId);

        this._showOverlay('Creating room…');
        this.peer = new Peer(peerId, { debug: 0 });

        this.peer.on('open', () => {
            this._hideOverlay();
            this.onReady?.();
        });

        this.peer.on('connection', (conn) => {
            this._setupConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'unavailable-id') {
                this._hideOverlay();
                this.onError?.('Room already exists. Try a different room code.');
            } else {
                this.onError?.(err.message || 'Connection error');
            }
        });

        this.peer.on('disconnected', () => {
            if (!this.peer.destroyed) this.peer.reconnect();
        });
    }

    // ── Joiner: Connect to a room ──
    joinRoom(roomId) {
        this.isAdmin = false;
        this.roomId = roomId;
        const peerId = generatePeerId(roomId, false);
        const adminPeerId = adminPeerIdFromRoom(roomId);

        this._showOverlay('Joining room…');
        this.peer = new Peer(peerId, { debug: 0 });

        this.peer.on('open', () => {
            const conn = this.peer.connect(adminPeerId, { reliable: true });
            
            // Wait for connection to open before calling onReady
            conn.on('open', () => {
                this.onReady?.();
            });
            this._setupConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            this._hideOverlay();
            if (err.type === 'peer-unavailable') {
                this.onError?.('Room not found. The admin may have left.');
            } else {
                this.onError?.(err.message || 'Connection error');
            }
        });

        this.peer.on('disconnected', () => {
            if (!this.peer.destroyed) this.peer.reconnect();
        });
    }

    // ── Send to specific peer ──
    send(peerId, message) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            conn.send(JSON.stringify(message));
        }
    }

    // ── Broadcast to all connected peers ──
    broadcast(message) {
        const data = JSON.stringify(message);
        for (const [, conn] of this.connections) {
            if (conn.open) conn.send(data);
        }
    }

    // ── Send to admin (for joiners) ──
    sendToAdmin(message) {
        const adminId = adminPeerIdFromRoom(this.roomId);
        this.send(adminId, message);
    }

    // ── Destroy ──
    destroy() {
        for (const [, timer] of this._retryTimers) clearTimeout(timer);
        this._retryTimers.clear();
        this.connections.clear();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }

    // ── Internal ──
    _setupConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            this._hideOverlay();
            this.onPeerJoined?.(conn.peer);
        });

        conn.on('data', (raw) => {
            try {
                const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
                this.onMessage?.(conn.peer, msg);
            } catch (e) {
                console.warn('Bad message:', raw);
            }
        });

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            this.onPeerLeft?.(conn.peer);
        });

        conn.on('error', (err) => {
            console.warn('Connection error:', err);
            this.connections.delete(conn.peer);
            this.onPeerLeft?.(conn.peer);
        });
    }

    _showOverlay(text) {
        const el = document.getElementById('connecting-overlay');
        const textEl = document.getElementById('connecting-text');
        if (el) el.classList.remove('hidden');
        if (textEl) textEl.textContent = text;
    }

    _hideOverlay() {
        const el = document.getElementById('connecting-overlay');
        if (el) el.classList.add('hidden');
    }
}
