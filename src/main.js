// ═══════════════════════════════════════════════════
// main.js — Planning Poker application entry point
// ═══════════════════════════════════════════════════

import { Networking } from './networking.js';
import { animateThrow, shakeElement } from './animations.js';
import {
    generateRoomId, getAvatarColor, getInitials,
    showToast, CARD_VALUES
} from './utils.js';

// ─── App State ───
const state = {
    name: '',
    roomId: null,
    isAdmin: false,
    myPeerId: null,

    // Canonical state (admin owns, syncs to peers)
    participants: new Map(), // peerId -> { name, vote, visible, color }
    ticket: '',
    allRevealed: false,
};

const net = new Networking();
let throwCooldown = false;

// ─── DOM refs ───
const $lobby = document.getElementById('lobby');
const $room = document.getElementById('room');
const $playerName = document.getElementById('player-name');
const $btnCreate = document.getElementById('btn-create-room');
const $btnJoin = document.getElementById('btn-join-room');
const $roomCodeIn = document.getElementById('room-code-input');
const $adminCtrl = document.getElementById('admin-controls');
const $ticketInput = document.getElementById('ticket-input');
const $btnSetTicket = document.getElementById('btn-set-ticket');
const $btnReveal = document.getElementById('btn-reveal-all');
const $btnReset = document.getElementById('btn-reset-votes');
const $btnCopyLink = document.getElementById('btn-copy-link');
const $btnLeave = document.getElementById('btn-leave');
const $ticketDisp = document.getElementById('ticket-display');
const $ticketName = document.getElementById('ticket-name');
const $handCards = document.getElementById('hand-cards');
const $partRing = document.getElementById('participants-ring');
const $tableStatus = document.getElementById('table-status');
const $roomTitle = document.getElementById('room-title');

// ═══════════════════════════════════════════════
// LOBBY
// ═══════════════════════════════════════════════

function init() {
    // Check URL hash for room code
    const hash = location.hash.slice(1);
    if (hash) {
        $roomCodeIn.value = hash;
    }

    // Restore name from session
    const saved = sessionStorage.getItem('pp-name');
    if (saved) $playerName.value = saved;

    renderHand();

    // Event listeners
    $btnCreate.addEventListener('click', createRoom);
    $btnJoin.addEventListener('click', () => joinRoom($roomCodeIn.value.trim()));
    $playerName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if ($roomCodeIn.value.trim()) joinRoom($roomCodeIn.value.trim());
            else createRoom();
        }
    });
    $roomCodeIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinRoom($roomCodeIn.value.trim());
    });
    $btnSetTicket.addEventListener('click', setTicket);
    $ticketInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') setTicket();
    });
    $btnReveal.addEventListener('click', revealAll);
    $btnReset.addEventListener('click', resetVotes);
    $btnCopyLink.addEventListener('click', copyInviteLink);
    $btnLeave.addEventListener('click', leaveRoom);

    // Auto-join if hash present and name saved
    if (hash && saved) {
        joinRoom(hash);
    }
}

function getName() {
    const n = $playerName.value.trim();
    if (!n) {
        $playerName.focus();
        $playerName.style.borderColor = 'var(--danger)';
        setTimeout(() => $playerName.style.borderColor = '', 1500);
        return null;
    }
    sessionStorage.setItem('pp-name', n);
    return n;
}

function createRoom() {
    const name = getName();
    if (!name) return;
    state.name = name;
    state.roomId = generateRoomId();
    state.isAdmin = true;

    setupNetworking();
    net.createRoom(state.roomId);
}

function joinRoom(code) {
    if (!code) {
        $roomCodeIn.focus();
        return;
    }
    const name = getName();
    if (!name) return;
    state.name = name;
    state.roomId = code.toUpperCase();
    state.isAdmin = false;

    setupNetworking();
    net.joinRoom(state.roomId);
}

// ═══════════════════════════════════════════════
// NETWORKING CALLBACKS
// ═══════════════════════════════════════════════

function setupNetworking() {
    net.onReady = () => {
        state.myPeerId = net.peer.id;

        // Admin adds self to participants
        if (state.isAdmin) {
            state.participants.set(state.myPeerId, {
                name: state.name,
                vote: null,
                visible: false,
                color: getAvatarColor(state.name),
            });
        }

        showRoom();
    };

    net.onPeerJoined = (peerId) => {
        if (state.isAdmin) {
            // Wait for join message with name
        } else {
            // Joiner: send join message to admin
            net.sendToAdmin({ type: 'join', name: state.name });
        }
    };

    net.onPeerLeft = (peerId) => {
        if (state.isAdmin) {
            const p = state.participants.get(peerId);
            if (p) {
                showToast(`${p.name} left the room`);
                state.participants.delete(peerId);
                broadcastState();
                renderParticipants();
            }
        }
    };

    net.onMessage = (senderId, msg) => {
        handleMessage(senderId, msg);
    };

    net.onError = (err) => {
        showToast(`Error: ${err}`);
    };
}

function handleMessage(senderId, msg) {
    switch (msg.type) {
        // ── Admin receives ──
        case 'join':
            if (state.isAdmin) {
                state.participants.set(senderId, {
                    name: msg.name,
                    vote: null,
                    visible: false,
                    color: getAvatarColor(msg.name),
                });
                showToast(`${msg.name} joined!`);
                broadcastState();
                renderParticipants();
            }
            break;

        case 'vote':
            if (state.isAdmin) {
                const p = state.participants.get(senderId);
                if (p) {
                    p.vote = msg.value;
                    p.visible = msg.visible;
                    broadcastState();
                    renderParticipants();
                    updateTableStatus();
                }
            }
            break;

        case 'toggle-visible':
            if (state.isAdmin) {
                const p2 = state.participants.get(senderId);
                if (p2) {
                    p2.visible = msg.visible;
                    broadcastState();
                    renderParticipants();
                }
            }
            break;

        case 'throw':
            if (state.isAdmin) {
                // Relay throw to all peers (including target)
                net.broadcast({
                    type: 'throw-anim',
                    from: senderId,
                    to: msg.target,
                    fromName: state.participants.get(senderId)?.name || '?',
                });
                // Also play locally for admin
                playThrow(senderId, msg.target,
                    state.participants.get(senderId)?.name || '?');
            }
            break;

        // ── Peers receive ──
        case 'state-sync':
            if (!state.isAdmin) {
                state.participants = new Map(Object.entries(msg.participants));
                state.ticket = msg.ticket;
                state.allRevealed = msg.allRevealed;
                state.myPeerId = net.peer.id;
                renderParticipants();
                renderTicket();
                updateTableStatus();
                updateSelectedCard();
            }
            break;

        case 'throw-anim':
            if (!state.isAdmin) {
                playThrow(msg.from, msg.to, msg.fromName);
            }
            break;
    }
}

function broadcastState() {
    if (!state.isAdmin) return;
    const participants = {};
    for (const [id, p] of state.participants) {
        participants[id] = { ...p };
    }
    net.broadcast({
        type: 'state-sync',
        participants,
        ticket: state.ticket,
        allRevealed: state.allRevealed,
    });
}

// ═══════════════════════════════════════════════
// ROOM UI
// ═══════════════════════════════════════════════

function showRoom() {
    $lobby.classList.remove('active');
    $room.classList.add('active');
    location.hash = state.roomId;
    $roomTitle.textContent = `Room: ${state.roomId}`;

    if (state.isAdmin) {
        $adminCtrl.classList.remove('hidden');
    }

    renderParticipants();
    updateTableStatus();
}

function leaveRoom() {
    net.destroy();
    state.participants.clear();
    state.ticket = '';
    state.allRevealed = false;
    state.roomId = null;
    location.hash = '';
    $room.classList.remove('active');
    $lobby.classList.add('active');
    $adminCtrl.classList.add('hidden');
    $ticketDisp.classList.add('hidden');
}

function copyInviteLink() {
    const url = `${location.origin}${location.pathname}#${state.roomId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Invite link copied!');
    }).catch(() => {
        // Fallback: copy just the room code
        navigator.clipboard.writeText(state.roomId).catch(() => { });
        showToast(`Room code: ${state.roomId}`);
    });
}

// ─── Ticket ───
function setTicket() {
    const t = $ticketInput.value.trim();
    if (!t) return;
    state.ticket = t;
    renderTicket();
    broadcastState();
    $ticketInput.value = '';
}

function renderTicket() {
    if (state.ticket) {
        $ticketDisp.classList.remove('hidden');
        $ticketName.textContent = state.ticket;
    } else {
        $ticketDisp.classList.add('hidden');
    }
}

// ─── Reveal / Reset ───
function revealAll() {
    if (!state.isAdmin) return;
    state.allRevealed = true;
    for (const [, p] of state.participants) {
        p.visible = true;
    }
    broadcastState();
    renderParticipants();
    updateTableStatus();
}

function resetVotes() {
    if (!state.isAdmin) return;
    state.allRevealed = false;
    for (const [, p] of state.participants) {
        p.vote = null;
        p.visible = false;
    }
    broadcastState();
    renderParticipants();
    updateTableStatus();
    // Deselect card in hand
    document.querySelectorAll('.vote-card.selected').forEach(c => c.classList.remove('selected'));
}

// ═══════════════════════════════════════════════
// PARTICIPANTS RING
// ═══════════════════════════════════════════════

function renderParticipants() {
    const entries = [...state.participants.entries()];
    const count = entries.length;
    $partRing.innerHTML = '';

    const ringW = $partRing.clientWidth;
    const ringH = $partRing.clientHeight;
    const centerX = ringW / 2;
    const centerY = ringH / 2;
    const radiusX = Math.min(centerX - 60, 320);
    const radiusY = Math.min(centerY - 60, 220);

    entries.forEach(([peerId, p], i) => {
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        const x = centerX + radiusX * Math.cos(angle) - 35;
        const y = centerY + radiusY * Math.sin(angle) - 35;

        const isSelf = peerId === state.myPeerId;
        const isAdmin = peerId.endsWith('-admin');
        const showVote = p.visible || state.allRevealed;

        const el = document.createElement('div');
        el.className = `participant${isSelf ? ' is-self' : ''}${isAdmin ? ' is-admin' : ''}`;
        el.dataset.peerId = peerId;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;

        // Card above avatar
        const cardClass = p.vote
            ? (showVote ? 'participant-card face-up' : 'participant-card face-down')
            : '';
        const cardContent = (p.vote && showVote) ? p.vote : '';
        const cardHtml = p.vote
            ? `<div class="${cardClass}">${cardContent}</div>`
            : '';

        el.innerHTML = `
      ${cardHtml}
      <div class="participant-avatar${p.vote ? ' voted' : ''}"
           style="background: ${p.color}"
           data-peer="${peerId}">
        ${getInitials(p.name)}
      </div>
      <span class="participant-name">${escHtml(p.name)}</span>
    `;

        // Click to throw (not self)
        if (!isSelf) {
            el.addEventListener('click', () => throwAt(peerId));
        }

        $partRing.appendChild(el);
    });
}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// ═══════════════════════════════════════════════
// TABLE STATUS
// ═══════════════════════════════════════════════

function updateTableStatus() {
    const entries = [...state.participants.values()];
    const total = entries.length;
    const voted = entries.filter(p => p.vote !== null).length;
    const anyRevealed = state.allRevealed || entries.some(p => p.visible);

    if (total === 0) {
        $tableStatus.innerHTML = 'Waiting for players…';
        return;
    }

    if (voted === 0) {
        $tableStatus.innerHTML = `<span>${total} player${total > 1 ? 's' : ''}</span><br><small style="color:var(--text-muted)">Waiting for votes…</small>`;
        return;
    }

    if (!state.allRevealed) {
        $tableStatus.innerHTML = `<span>${voted}/${total} voted</span>`;
        return;
    }

    // Revealed — show summary
    const numericVotes = entries
        .filter(p => p.vote && !isNaN(Number(p.vote)))
        .map(p => Number(p.vote));

    if (numericVotes.length === 0) {
        $tableStatus.innerHTML = `<div class="vote-summary">
      <span class="vote-summary-label">All voted</span>
    </div>`;
        return;
    }

    const avg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;

    // Breakdown
    const counts = {};
    entries.forEach(p => {
        if (p.vote) counts[p.vote] = (counts[p.vote] || 0) + 1;
    });
    const chips = Object.entries(counts)
        .map(([v, c]) => `<span class="vote-chip">${v} × ${c}</span>`)
        .join('');

    $tableStatus.innerHTML = `
    <div class="vote-summary">
      <span class="vote-summary-avg">${avg.toFixed(1)}</span>
      <span class="vote-summary-label">Average</span>
      <div class="vote-breakdown">${chips}</div>
    </div>`;
}

// ═══════════════════════════════════════════════
// VOTING HAND
// ═══════════════════════════════════════════════

function renderHand() {
    $handCards.innerHTML = '';
    CARD_VALUES.forEach(val => {
        const card = document.createElement('div');
        card.className = 'vote-card';
        card.dataset.value = val;
        card.textContent = val;
        card.addEventListener('click', () => selectCard(val, card));
        $handCards.appendChild(card);
    });
}

function selectCard(value, cardEl) {
    // Toggle: if already selected, deselect
    const wasSelected = cardEl.classList.contains('selected');
    document.querySelectorAll('.vote-card.selected').forEach(c => c.classList.remove('selected'));

    const myP = state.participants.get(state.myPeerId);
    if (!myP) return;

    if (wasSelected) {
        myP.vote = null;
        myP.visible = false;
    } else {
        cardEl.classList.add('selected');
        myP.vote = value;
        myP.visible = false; // Hidden by default, user can show
    }

    if (state.isAdmin) {
        broadcastState();
        renderParticipants();
        updateTableStatus();
    } else {
        net.sendToAdmin({
            type: 'vote',
            value: myP.vote,
            visible: myP.visible,
        });
    }
}

function updateSelectedCard() {
    const myP = state.participants.get(state.myPeerId);
    document.querySelectorAll('.vote-card').forEach(c => {
        c.classList.toggle('selected', myP && c.dataset.value === myP.vote);
    });
}

// ═══════════════════════════════════════════════
// THROW MECHANIC
// ═══════════════════════════════════════════════

function throwAt(targetPeerId) {
    if (throwCooldown) {
        showToast('Wait a moment before throwing again!');
        return;
    }
    if (targetPeerId === state.myPeerId) return;

    throwCooldown = true;
    setTimeout(() => { throwCooldown = false; }, 2000);

    if (state.isAdmin) {
        // Admin: play locally and relay
        const fromName = state.participants.get(state.myPeerId)?.name || '?';
        net.broadcast({
            type: 'throw-anim',
            from: state.myPeerId,
            to: targetPeerId,
            fromName,
        });
        playThrow(state.myPeerId, targetPeerId, fromName);
    } else {
        net.sendToAdmin({ type: 'throw', target: targetPeerId });
    }
}

function playThrow(fromId, toId, fromName) {
    const fromEl = document.querySelector(`[data-peer="${fromId}"]`);
    const toEl = document.querySelector(`[data-peer="${toId}"]`);

    if (!fromEl || !toEl) return;

    animateThrow(fromEl, toEl, () => {
        shakeElement(toEl);
        // If I'm the target, show a toast
        if (toId === state.myPeerId) {
            showToast(`${fromName} threw a paper ball at you! 📄`);
        }
    });
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', init);
