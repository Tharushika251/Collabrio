import Board from '../models/Board.js';
import Operation from '../models/Operation.js';
import { logger } from '../utils/logger.js';

/**
 * Applies an operation to the board document.
 * Conflict policy:
 *   - Drawing strokes: last-write-wins on delete, append-only otherwise.
 *   - Task updates: client sends the expected `updatedAt`. If the server
 *     sees a newer timestamp, the operation is rejected and the client is
 *     told to reconcile (pull latest state).
 *
 * Every applied op bumps board.version, providing a monotonic sequence that
 * clients use to detect missed broadcasts after a reconnect.
 */
export async function applyOperation(board, op, userId) {
  const now = Date.now();

  switch (op.opType) {
    case 'stroke.add': {
      if (board.clearedAt && new Date(op.payload.createdAt) <= board.clearedAt) {
        return { applied: false };   // stale stroke, drop it
      }
      if (board.strokes.some((s) => s.id === op.payload.id)) return { applied: false };
      board.strokes.push({ 
        ...op.payload, userId: userId.toString(), 
        deleted: false 
      });
      break;
    }

    case 'stroke.delete': {
      const stroke = board.strokes.find((s) => s.id === op.payload.id);
      if (!stroke) return { applied: false };
      stroke.deleted = true;
      break;
    }

    case 'stroke.clear': {
      // Single atomic op: records the moment the board was cleared.
      // Existing strokes are flagged here too so a full reload sees an
      // empty board without requiring a separate delete per stroke.
      board.clearedAt = Date.now();
      for (const s of board.strokes) s.deleted = true;
      break;
    }
    case 'stroke.clear': {
        board.clearedAt = new Date();
        break;
    }

    case 'task.add': {
      const { columnId, task } = op.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return { applied: false };
      column.tasks.push({
        id: task.id,
        text: task.text ?? '',
        assignee: null,
        updatedAt: new Date(now),
        updatedBy: userId.toString(),
      });
      break;
    }

    case 'task.update': {
      const { columnId, taskId, text } = op.payload;
      const column = board.columns.find((c) => c.id === columnId);
      const task = column?.tasks.find((t) => t.id === taskId);
      if (!task) return { applied: false };

      // Optimistic concurrency: reject if client's base timestamp is older.
      if (op.payload.baseUpdatedAt) {
        const base = new Date(op.payload.baseUpdatedAt).getTime();
        const current = new Date(task.updatedAt).getTime();
        if (current > base) {
          return { applied: false, conflict: { taskId, current } };
        }
      }

      task.text = text;
      task.updatedAt = new Date(now);
      task.updatedBy = userId.toString();
      break;
    }

    case 'task.move': {
      const { fromColumnId, toColumnId, taskId, toIndex } = op.payload;
      const from = board.columns.find((c) => c.id === fromColumnId);
      const to = board.columns.find((c) => c.id === toColumnId);
      if (!from || !to) return { applied: false };
      const idx = from.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return { applied: false };
      const [task] = from.tasks.splice(idx, 1);
      task.updatedAt = new Date(now);
      task.updatedBy = userId.toString();
      const insertAt = Math.max(0, Math.min(toIndex ?? to.tasks.length, to.tasks.length));
      to.tasks.splice(insertAt, 0, task);
      break;
    }

    case 'task.delete': {
      const { columnId, taskId } = op.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return { applied: false };
      column.tasks = column.tasks.filter((t) => t.id !== taskId);
      break;
    }

    case 'column.update': {
      const { columnId, title } = op.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return { applied: false };
      column.title = title;
      break;
    }

    default:
      return { applied: false };
  }

  board.version += 1;
  board.markModified('strokes');
  board.markModified('columns');
  await board.save();

  await Operation.create({
    boardId: board._id,
    userId,
    opType: op.opType,
    payload: op.payload,
    version: board.version,
  });

  return { applied: true, version: board.version };
}

/**
 * Registers board-related socket handlers for a connected client.
 * Rooms isolate broadcasts per board and match the Socket.IO room name
 * to the board document id.
 */
export function registerBoardHandlers(io, socket) {
  const { user } = socket.data;

  socket.on('board:join', async ({ boardId }, ack) => {
    try {
      const board = await Board.findById(boardId);
      if (!board) return ack?.({ ok: false, error: 'Board not found' });

      const isMember = board.members.some((m) => m.toString() === user._id.toString());
      if (!isMember) return ack?.({ ok: false, error: 'Access denied' });

      // Leave any previous board room before joining the new one.
      // Otherwise switching boards leaves the socket in two rooms and
      // presence broadcasts leak across boards.
      if (socket.data.boardId && socket.data.boardId !== boardId) {
        socket.leave(socket.data.boardId);
        removeUser(socket.data.boardId, socket.id);
        io.to(socket.data.boardId).emit('presence:update', listUsers(socket.data.boardId));
      }

      socket.join(boardId);
      socket.data.boardId = boardId;

      // Register presence here so the join and the presence track are
      // always paired. The old client-side presence:join event is no
      // longer needed and has been removed.
      addUser(boardId, socket.id, user);
      io.to(boardId).emit('presence:update', listUsers(boardId));

      ack?.({
        ok: true,
        version: board.version,
        strokes: board.strokes,
        columns: board.columns,
      });
    } catch (err) {
      logger.error('board:join failed', err.message);
      ack?.({ ok: false, error: 'Join failed' });
    }
  });

  socket.on('board:leave', ({ boardId }) => {
    socket.leave(boardId);
    if (socket.data.boardId === boardId) socket.data.boardId = null;
  });

  /**
   * Operation entry point.
   * The server is authoritative: clients optimistically apply locally,
   * then reconcile based on the ack result.
   */
  socket.on('board:op', async ({ boardId, op }, ack) => {
    try {
      if (!boardId || !op?.opType) return ack?.({ ok: false, error: 'Malformed op' });

      const board = await Board.findById(boardId);
      if (!board) return ack?.({ ok: false, error: 'Board not found' });

      const isMember = board.members.some((m) => m.toString() === user._id.toString());
      if (!isMember) return ack?.({ ok: false, error: 'Access denied' });

      const result = await applyOperation(board, op, user._id);

      if (!result.applied) {
        return ack?.({
          ok: false,
          conflict: result.conflict ?? true,
          version: board.version,
        });
      }

      // Broadcast to everyone in the room EXCEPT the sender (sender already
      // applied locally). Use socket.to() for that guarantee.
      socket.to(boardId).emit('board:op', {
        op,
        version: result.version,
        userId: user._id.toString(),
      });

      ack?.({ ok: true, version: result.version });
    } catch (err) {
      logger.error('board:op failed', err.message);
      ack?.({ ok: false, error: 'Operation failed' });
    }
  });

  /**
   * Fast-path sync request used on reconnect. Client sends the last version
   * it has; server responds with ops after that version from the log.
   */
  socket.on('board:sync', async ({ boardId, sinceVersion }, ack) => {
    try {
      const board = await Board.findById(boardId);
      if (!board) return ack?.({ ok: false, error: 'Board not found' });

      const isMember = board.members.some((m) => m.toString() === user._id.toString());
      if (!isMember) return ack?.({ ok: false, error: 'Access denied' });

      if (sinceVersion >= board.version) {
        return ack?.({ ok: true, upToDate: true, version: board.version });
      }

      const ops = await Operation.find({
        boardId,
        version: { $gt: sinceVersion },
      })
        .sort({ version: 1 })
        .limit(1000);

      ack?.({
        ok: true,
        upToDate: false,
        version: board.version,
        ops: ops.map((o) => ({ opType: o.opType, payload: o.payload, userId: o.userId, version: o.version })),
      });
    } catch (err) {
      logger.error('board:sync failed', err.message);
      ack?.({ ok: false, error: 'Sync failed' });
    }
  });
}