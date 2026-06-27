// ═══════════════════════════════════════════════
// utils.js — Helpers & ID generation
// ═══════════════════════════════════════════════

export function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function generatePeerId(roomId, isAdmin) {
  const suffix = isAdmin ? 'admin' : Math.random().toString(36).slice(2, 8);
  return `pp-${roomId}-${suffix}`;
}

export function adminPeerIdFromRoom(roomId) {
  return `pp-${roomId}-admin`;
}

const AVATAR_COLORS = [
  '#7c5cff', '#c084fc', '#38bdf8', '#34d399',
  '#f472b6', '#fb923c', '#facc15', '#a78bfa',
  '#22d3ee', '#f87171', '#4ade80', '#e879f9',
];

export function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name) {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

export const CARD_VALUES = [
  '0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'
];
