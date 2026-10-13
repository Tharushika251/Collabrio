import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/axios';
import { useSocketContext } from '../context/SocketContext';
import { usePresence } from '../hooks/usePresence';
import { useSocketEvent } from '../hooks/useSocket';
import Whiteboard from '../components/Whiteboard';
import TaskBoard from '../components/TaskBoard';
import PresenceBar from '../components/PresenceBar';
import RemoteCursors from '../components/RemoteCursors';
import ShareModal from '../components/ShareModal';

/**
 * Board page orchestrator.
 *
 * Responsibilities:
 *  - Load the board over REST on mount.
 *  - Join the socket room and reconcile missed operations using `board:sync`.
 *  - Route local ops through the socket with optimistic UI, then reconcile
 *    based on the server ack.
 *  - Render presence (users, cursors, "is editing").
 *
 * Declarations are ordered so each hook depends only on things declared
 * above it. In particular `sendOp` is defined before `applyUndo` /
 * `applyRedo`, and the keyboard effect comes after both.
 */
export default function BoardPage() {
  const { id: boardId } = useParams();
  const { socket } = useSocketContext();

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('board'); // 'board' | 'whiteboard'
  const [showShare, setShowShare] = useState(false);

  const lastVersionRef = useRef(0);
  const containerRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // Mirror of `board` so imperative handlers (undo, redo, delete) can read
  // the freshest state without being recreated on every render.
  const boardRef = useRef(null);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const { users, cursors, editors } = usePresence(boardId);

  // ---- Reducers and op pipeline -----------------------------------------

  const applyRemoteOps = useCallback((ops) => {
    setBoard((prev) => {
      if (!prev) return prev;
      let next = {
        ...prev,
        strokes: [...prev.strokes],
        columns: prev.columns.map((c) => ({ ...c, tasks: [...c.tasks] })),
      };
      for (const op of ops) next = reduceOp(next, op);
      return next;
    });
  }, []);

  /**
   * Sends an operation and tracks the inverse on the local undo stack.
   *
   * Undo semantics in a collaborative editor:
   *  - Undo is per-user. Remote ops never enter your stack, so you only
   *    reverse actions you performed.
   *  - Some undos become stale if a remote peer changed the same target.
   *    Rather than trying to reconcile those cases, we detect and skip
   *    stale entries (see applyUndo below).
   */
  const sendOp = useCallback(
    (opType, payload, { optimistic, recordUndo = true } = {}) => {
      if (!socket) return;

      if (optimistic) {
        setBoard((prev) => (prev ? reduceOp(prev, { opType, payload }) : prev));
      }

      // Push the inverse onto the undo stack unless this call IS an undo
      // or redo — recordUndo: false prevents infinite recursion.
      if (recordUndo) {
        const inverse = invertOp(opType, payload);
        if (inverse) {
          undoStackRef.current.push(inverse);
          // Any new action invalidates the redo history.
          redoStackRef.current = [];
        }
      }

      socket.emit('board:op', { boardId, op: { opType, payload } }, (res) => {
        if (!res?.ok) {
          // Conflict: server rejected. Pull latest state to reconcile.
          socket.emit('board:sync', { boardId, sinceVersion: 0 }, () => {
            api.get(`/boards/${boardId}`).then(({ data }) => {
              setBoard(data.board);
              lastVersionRef.current = data.board.version;
            });
          });
        } else if (res.version > lastVersionRef.current) {
          lastVersionRef.current = res.version;
        }
      });
    },
    [socket, boardId]
  );

  /**
   * Pops the next applicable entry from the undo stack and sends its
   * inverse. Stale entries (target already changed by a peer) are
   * discarded rather than sent, which keeps the board consistent without
   * requiring OT-style dependency tracking.
   */
  const applyUndo = useCallback(() => {
    const current = boardRef.current;
    if (!current) return;

    while (undoStackRef.current.length > 0) {
      const entry = undoStackRef.current.pop();

      let applicable = false;
      if (entry.opType === 'stroke.delete') {
        // Undoing an add. Applicable iff the stroke is still present.
        applicable = current.strokes.some(
          (s) => s.id === entry.payload.id && !s.deleted
        );
      } else if (entry.opType === 'stroke.add') {
        // Undoing a delete. Applicable iff the stroke is currently deleted.
        const s = current.strokes.find((x) => x.id === entry.payload.id);
        applicable = !!s && s.deleted === true;
      } else if (entry.opType === 'task.delete') {
        // Undoing a task add. Applicable iff the task still exists.
        const col = current.columns.find((c) => c.id === entry.payload.columnId);
        applicable = !!col?.tasks.some((t) => t.id === entry.payload.taskId);
      }

      if (!applicable) continue;

      // The redo stack stores the same entry so Ctrl+Shift+Z can reverse
      // this undo. The redo entry is the inverse of the inverse.
      redoStackRef.current.push(entry);
      sendOp(entry.opType, entry.payload, { optimistic: true, recordUndo: false });
      return;
    }
  }, [sendOp]);

  const applyRedo = useCallback(() => {
    const current = boardRef.current;
    if (!current) return;

    while (redoStackRef.current.length > 0) {
      const entry = redoStackRef.current.pop();

      let applicable = false;
      if (entry.opType === 'stroke.delete') {
        applicable = current.strokes.some(
          (s) => s.id === entry.payload.id && !s.deleted
        );
      } else if (entry.opType === 'stroke.add') {
        const s = current.strokes.find((x) => x.id === entry.payload.id);
        applicable = !!s && s.deleted === true;
      } else if (entry.opType === 'task.delete') {
        const col = current.columns.find((c) => c.id === entry.payload.columnId);
        applicable = !!col?.tasks.some((t) => t.id === entry.payload.taskId);
      }

      if (!applicable) continue;

      undoStackRef.current.push(entry);
      sendOp(entry.opType, entry.payload, { optimistic: true, recordUndo: false });
      return;
    }
  }, [sendOp]);

  // ---- Keyboard shortcuts -----------------------------------------------

  /**
   * Undo / redo hotkeys.
   *
   * Registered globally so the shortcuts work regardless of focus, but
   * skipped inside text inputs so the browser's native text undo still
   * functions while editing.
   */
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const isUndo =
        (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      const isRedo =
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' ||
          (e.shiftKey && e.key.toLowerCase() === 'z'));

      if (isUndo) {
        e.preventDefault();
        applyUndo();
      } else if (isRedo) {
        e.preventDefault();
        applyRedo();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyUndo, applyRedo]);

  // ---- Data loading and room join ---------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/boards/${boardId}`);
        if (cancelled) return;
        setBoard(data.board);
        lastVersionRef.current = data.board.version;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  useEffect(() => {
    if (!socket || !boardId) return;
    socket.emit('board:join', { boardId }, (res) => {
      if (!res?.ok) return;
      lastVersionRef.current = res.version;
    });
  }, [socket, boardId]);

  // Reconcile on reconnect: ask for ops since our last version.
  useEffect(() => {
    if (!socket) return;
    const onReconnect = () => {
      socket.emit('board:join', { boardId }, (joinRes) => {
        if (!joinRes?.ok) return;
        if (joinRes.version === lastVersionRef.current) return;

        socket.emit(
          'board:sync',
          { boardId, sinceVersion: lastVersionRef.current },
          (syncRes) => {
            if (!syncRes?.ok || syncRes.upToDate) return;
            applyRemoteOps(syncRes.ops);
            lastVersionRef.current = syncRes.version;
          }
        );
      });
    };
    socket.on('connect', onReconnect);
    return () => socket.off('connect', onReconnect);
  }, [socket, boardId, applyRemoteOps]);

  // Live remote ops.
  useSocketEvent('board:op', ({ op, version }) => {
    if (version > lastVersionRef.current) lastVersionRef.current = version;
    applyRemoteOps([op]);
  });

  // ---- Cursor broadcast --------------------------------------------------

  // Reference coordinate space shared with the whiteboard canvas. Cursors
  // are normalized to this space before transmission so clients with
  // different viewport sizes render them at the same logical position.
  const REF_W = 1200;
  const REF_H = 600;

  // We can't depend on containerRef.current directly in an effect's deps,
  // because refs don't trigger re-renders. Track "is the container mounted
  // yet?" as state instead, so the cursor effect runs exactly once, after
  // the first render where the container is in the DOM.
  const [containerReady, setContainerReady] = useState(false);

  useEffect(() => {
    if (!containerReady && containerRef.current) setContainerReady(true);
  }, [board, containerReady]);

  useEffect(() => {
    if (!socket || !containerReady || !containerRef.current) return;
    const el = containerRef.current;
    let raf = null;

    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const rect = el.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * REF_W;
        const ny = ((e.clientY - rect.top) / rect.height) * REF_H;

        socket.emit('presence:cursor', {
          boardId,
          x: Math.round(nx),
          y: Math.round(ny),
        });
      });
    };

    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, [socket, boardId, containerReady]);

  const notifyEditing = useCallback(
    (target) => socket?.emit('presence:editing', { boardId, target }),
    [socket, boardId]
  );

  // ---- Local op handlers -------------------------------------------------

  const handleClearAll = () => {
    sendOp('stroke.clear', {}, { optimistic: true });
  };

  const handleStrokeCommit = (stroke) => {
    const payload = {
      id: stroke.id,
      color: stroke.color,
      width: stroke.width,
      points: stroke.points,
      createdAt: Date.now(),
    };
    sendOp('stroke.add', payload, { optimistic: true });
  };

  /**
   * Deletes a stroke and pushes a full re-add inverse onto the undo stack.
   * `invertOp` cannot reconstruct the stroke body from an id alone, so we
   * build the inverse here where the full object is in scope.
   */
  const handleStrokeDelete = (strokeId) => {
    const current = boardRef.current;
    const stroke = current?.strokes.find((s) => s.id === strokeId);
    if (!stroke) return;

    sendOp('stroke.delete', { id: strokeId }, { optimistic: true });

    // Replace the auto-generated inverse with a full re-add payload.
    undoStackRef.current.pop();
    undoStackRef.current.push({
      opType: 'stroke.add',
      payload: {
        id: stroke.id,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points,
        // Slightly after any possible clear, so re-adding survives even
        // if the board was cleared between the delete and the undo.
        createdAt: Date.now() + 1,
      },
    });
  };

  const handleAddTask = (columnId) => {
    const task = { id: crypto.randomUUID(), text: '' };
    sendOp('task.add', { columnId, task }, { optimistic: true });
  };

  const handleUpdateTask = (columnId, taskId, text, baseUpdatedAt) => {
    sendOp('task.update', { columnId, taskId, text, baseUpdatedAt }, {
      optimistic: true,
    });
  };

  const handleDeleteTask = (columnId, taskId) => {
    sendOp('task.delete', { columnId, taskId }, { optimistic: true });
  };

  const handleMoveTask = (fromColumnId, toColumnId, taskId) => {
    sendOp('task.move', { fromColumnId, toColumnId, taskId }, {
      optimistic: true,
    });
  };

  // ---- Render ------------------------------------------------------------

  if (loading || !board) {
    return <div className="p-8 text-sm text-slate-500">Loading board…</div>;
  }

  return (
    <div className="min-h-screen p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{board.name}</h1>
          <p className="text-xs text-slate-500">
            v{lastVersionRef.current} · {users.length} online
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PresenceBar users={users} editors={editors} />
          <button
            onClick={() => setShowShare(true)}
            className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700"
          >
            Share
          </button>
        </div>
      </header>

      <nav className="flex gap-2">
        <button
          onClick={() => setTab('board')}
          className={`text-sm px-3 py-1.5 rounded ${
            tab === 'board' ? 'bg-slate-900 text-white' : 'bg-white border'
          }`}
        >
          Task board
        </button>
        <button
          onClick={() => setTab('whiteboard')}
          className={`text-sm px-3 py-1.5 rounded ${
            tab === 'whiteboard' ? 'bg-slate-900 text-white' : 'bg-white border'
          }`}
        >
          Whiteboard
        </button>
      </nav>

      <div ref={containerRef} className="relative">
        <RemoteCursors cursors={cursors} users={users} />

        {tab === 'whiteboard' ? (
          <Whiteboard
            strokes={board.strokes}
            onStrokeCommit={handleStrokeCommit}
            onStrokeDelete={handleStrokeDelete}
            onClearAll={handleClearAll}
          />
        ) : (
          <TaskBoard
            columns={board.columns}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onMoveTask={handleMoveTask}
            onEditingChange={notifyEditing}
          />
        )}
      </div>

      {showShare && (
        <ShareModal
          board={{ id: boardId, shareToken: board.shareToken }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

/**
 * Pure reducer that applies a single operation to the local board mirror.
 * Must mirror the server-side `applyOperation` semantics exactly to
 * guarantee the same final state after reconciliation.
 */
function reduceOp(board, { opType, payload }) {
  const next = {
    ...board,
    strokes: board.strokes.map((s) => ({ ...s })),
    columns: board.columns.map((c) => ({ ...c, tasks: c.tasks.map((t) => ({ ...t })) })),
  };

  switch (opType) {
    case 'stroke.add':
      if (board.clearedAt && payload.createdAt <= board.clearedAt) break;
      if (!next.strokes.some((s) => s.id === payload.id)) {
        next.strokes.push({ ...payload, deleted: false });
      }
      break;

    case 'stroke.delete': {
      const s = next.strokes.find((x) => x.id === payload.id);
      if (s) s.deleted = true;
      break;
    }

    case 'stroke.clear': {
      // Marks the board as cleared at this moment. Any stroke committed
      // before this timestamp is treated as deleted regardless of arrival
      // order, which makes clear idempotent and race-safe.
      next.clearedAt = Date.now();
      for (const s of next.strokes) s.deleted = true;
      break;
    }

    case 'task.add': {
      const col = next.columns.find((c) => c.id === payload.columnId);
      if (col && !col.tasks.some((t) => t.id === payload.task.id)) {
        col.tasks.push({ ...payload.task, updatedAt: new Date().toISOString() });
      }
      break;
    }

    case 'task.update': {
      const col = next.columns.find((c) => c.id === payload.columnId);
      const task = col?.tasks.find((t) => t.id === payload.taskId);
      if (task) {
        task.text = payload.text;
        task.updatedAt = new Date().toISOString();
      }
      break;
    }

    case 'task.move': {
      const from = next.columns.find((c) => c.id === payload.fromColumnId);
      const to = next.columns.find((c) => c.id === payload.toColumnId);
      if (!from || !to) break;
      const idx = from.tasks.findIndex((t) => t.id === payload.taskId);
      if (idx === -1) break;
      const [t] = from.tasks.splice(idx, 1);
      to.tasks.push(t);
      break;
    }

    case 'task.delete': {
      const col = next.columns.find((c) => c.id === payload.columnId);
      if (col) col.tasks = col.tasks.filter((t) => t.id !== payload.taskId);
      break;
    }
  }
  return next;
}

/**
 * Returns the operation that reverses the given one, or null when the
 * inverse requires data not present in the payload.
 *
 * `stroke.delete` deliberately returns null: reconstructing a deleted
 * stroke requires its full body, which is handled in `handleStrokeDelete`
 * where that data is in scope.
 */
function invertOp(opType, payload) {
  switch (opType) {
    case 'stroke.add':
      return { opType: 'stroke.delete', payload: { id: payload.id } };
    case 'task.add':
      return {
        opType: 'task.delete',
        payload: { columnId: payload.columnId, taskId: payload.task.id },
      };
    // stroke.delete, task.delete, task.update, task.move, stroke.clear
    // cannot be inverted from the payload alone.
    default:
      return null;
  }
}