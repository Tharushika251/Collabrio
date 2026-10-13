/**
 * In-memory presence registry.
 * Structure: boardId -> Map<socketId, { userId, name, color, cursor, lastSeen }>
 *
 * In-memory is sufficient for a single-node deployment. For horizontal
 * scaling this state should move to Redis with a Socket.IO pub/sub adapter.
 */
export const presence = new Map();

const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

/**
 * Deterministic color per user id. Same user gets the same color across
 * the dashboard, presence bar, and remote cursors.
 */
export function colorFor(userId) {
  let hash = 0;
  const s = String(userId);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function addUser(boardId, socketId, user) {
  if (!presence.has(boardId)) presence.set(boardId, new Map());
  presence.get(boardId).set(socketId, {
    userId: user._id.toString(),
    name: user.name,
    color: colorFor(user._id.toString()),
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

/**
 * Remove a socket from every board it is registered in.
 * Called on disconnect to guarantee no stale presence survives a
 * dropped connection, even if the client changed boards mid-session.
 */
export function removeUserFromAll(socketId) {
  const affected = [];
  for (const [boardId, room] of presence.entries()) {
    if (room.has(socketId)) {
      room.delete(socketId);
      affected.push(boardId);
      if (room.size === 0) presence.delete(boardId);
    }
  }
  return affected;
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
 * Multiple sockets from the same user (tabs, reconnects) collapse to a
 * single presence entry keyed by userId.
 */
export function listUsers(boardId) {
  const room = presence.get(boardId);
  if (!room) return [];
  const byUser = new Map();
  for (const entry of room.values()) {
    const existing = byUser.get(entry.userId);
    if (!existing) {
      byUser.set(entry.userId, { ...entry, sockets: 1 });
    } else {
      existing.sockets += 1;
      // Preserve the freshest cursor across tabs.
      if (entry.lastSeen > existing.lastSeen) {
        existing.cursor = entry.cursor;
        existing.lastSeen = entry.lastSeen;
      }
    }
  }
  return [...byUser.values()];
}