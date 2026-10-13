/**
 * In-memory presence registry.
 * Structure: boardId -> Map<socketId, { userId, name, color, cursor, lastSeen }>
 *
 * In-memory is sufficient for a single-node deployment. For horizontal scaling
 * this state should move to Redis with a pub/sub adapter for Socket.IO.
 */
export const presence = new Map();

const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

function pickColor(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function addUser(boardId, socketId, user) {
  if (!presence.has(boardId)) presence.set(boardId, new Map());
  presence.get(boardId).set(socketId, {
    userId: user._id.toString(),
    name: user.name,
    color: pickColor(user._id.toString()),
    cursor: null,
    lastSeen: Date.now(),
  });
}

export function removeUser(boardId, socketId) {
  const room = presence.get(boardId);
  if (!room) return;
  room.delete(socketId);
  if (room.size === 0) presence.delete(boardId);
}

export function updateCursor(boardId, socketId, cursor) {
  const room = presence.get(boardId);
  if (!room) return;
  const entry = room.get(socketId);
  if (!entry) return;
  entry.cursor = cursor;
  entry.lastSeen = Date.now();
}

/**
 * Returns a deduplicated list of active users on a board.
 * Multiple sockets from the same user (tabs) collapse to one presence entry.
 */
export function listUsers(boardId) {
  const room = presence.get(boardId);
  if (!room) return [];
  const byUser = new Map();
  for (const entry of room.values()) {
    if (!byUser.has(entry.userId)) byUser.set(entry.userId, { ...entry, sockets: 1 });
    else byUser.get(entry.userId).sockets += 1;
  }
  return [...byUser.values()];
}