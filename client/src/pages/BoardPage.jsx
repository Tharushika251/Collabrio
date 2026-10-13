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

/**
 * Board page orchestrator.
 *
 * Responsibilities:
 *  - Load the board over REST on mount.
 *  - Join the socket room and reconcile any missed operations using `board:sync`.
 *  - Route local ops through the socket with optimistic UI, then reconcile
 *    based on the server ack.
 *  - Render presence (users, cursors, "is editing").
 */
export default function BoardPage() {
  const { id: boardId } = useParams();
  const { socket } = useSocketContext();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('board'); // 'board' | 'whiteboard'
  const lastVersionRef = useRef(0);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });

  const { users, cursors, editors } = usePresence(boardId);

  const handleClearAll = () => {
    sendOp('stroke.clear', {}, { optimistic: true });
 };

  // Initial load and room join.
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
    return () => { cancelled = true; };
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
        // Fast path: if server version matches ours, we are in sync.
        if (joinRes.version === lastVersionRef.current) return;

        socket.emit('board:sync', { boardId, sinceVersion: lastVersionRef.current }, (syncRes) => {
          if (!syncRes?.ok || syncRes.upToDate) return;
          applyRemoteOps(syncRes.ops);
          lastVersionRef.current = syncRes.version;
        });
      });
    };
    socket.on('connect', onReconnect);
    return () => socket.off('connect', onReconnect);
  }, [socket, boardId]);

  // Live remote ops.
  useSocketEvent('board:op', ({ op, version }) => {
    if (version > lastVersionRef.current) lastVersionRef.current = version;
    applyRemoteOps([op]);
  });

  const applyRemoteOps = useCallback((ops) => {
    setBoard((prev) => {
      if (!prev) return prev;
      let next = { ...prev, strokes: [...prev.strokes], columns: prev.columns.map((c) => ({ ...c, tasks: [...c.tasks] })) };
      for (const op of ops) next = reduceOp(next, op);
      return next;
    });
  }, []);

  const sendOp = useCallback(
    (opType, payload, { optimistic } = {}) => {
      if (!socket) return;
      // Optimistic local apply.
      if (optimistic) {
        setBoard((prev) => (prev ? reduceOp(prev, { opType, payload }) : prev));
      }
      socket.emit('board:op', { boardId, op: { opType, payload } }, (res) => {
        if (!res?.ok) {
          // Conflict: server rejected. Pull latest state to reconcile.
          socket.emit('board:sync', { boardId, sinceVersion: 0 }, (syncRes) => {
            if (syncRes?.ok && syncRes.ops) {
              api.get(`/boards/${boardId}`).then(({ data }) => {
                setBoard(data.board);
                lastVersionRef.current = data.board.version;
              });
            }
          });
        } else if (res.version > lastVersionRef.current) {
          lastVersionRef.current = res.version;
        }
      });
    },
    [socket, boardId]
  );

  // Cursor broadcast. Throttled via rAF to avoid flooding the socket.
  useEffect(() => {
    if (!socket || !containerRef.current) return;
    const el = containerRef.current;
    let raf = null;
    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const rect = el.getBoundingClientRect();
        socket.emit('presence:cursor', {
          boardId,
          x: Math.round(e.clientX - rect.left),
          y: Math.round(e.clientY - rect.top),
        });
      });
    };
    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, [socket, boardId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: r.width, height: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const notifyEditing = useCallback(
    (target) => socket?.emit('presence:editing', { boardId, target }),
    [socket, boardId]
  );

  // ---- Local op handlers -------------------------------------------------

  const handleStrokeCommit = (stroke) => {
    const payload = { id: stroke.id, color: stroke.color, width: stroke.width, points: stroke.points, createdAt: Date.now() };
    sendOp('stroke.add', payload, { optimistic: true });
  };

  const handleStrokeDelete = (strokeId) => {
    sendOp('stroke.delete', { id: strokeId }, { optimistic: true });
  };

  const handleAddTask = (columnId) => {
    const task = { id: crypto.randomUUID(), text: '' };
    sendOp('task.add', { columnId, task }, { optimistic: true });
  };

  const handleUpdateTask = (columnId, taskId, text, baseUpdatedAt) => {
    sendOp('task.update', { columnId, taskId, text, baseUpdatedAt }, { optimistic: true });
  };

  const handleDeleteTask = (columnId, taskId) => {
    sendOp('task.delete', { columnId, taskId }, { optimistic: true });
  };

  const handleMoveTask = (fromColumnId, toColumnId, taskId) => {
    sendOp('task.move', { fromColumnId, toColumnId, taskId }, { optimistic: true });
  };

  if (loading || !board) {
    return <div className="p-8 text-sm text-slate-500">Loading board…</div>;
  }

  return (
    <div className="min-h-screen p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{board.name}</h1>
          <p className="text-xs text-slate-500">v{lastVersionRef.current} · {users.length} online</p>
        </div>
        <PresenceBar users={users} editors={editors} />
      </header>

      <nav className="flex gap-2">
        <button
          onClick={() => setTab('board')}
          className={`text-sm px-3 py-1.5 rounded ${tab === 'board' ? 'bg-slate-900 text-white' : 'bg-white border'}`}
        >
          Task board
        </button>
        <button
          onClick={() => setTab('whiteboard')}
          className={`text-sm px-3 py-1.5 rounded ${tab === 'whiteboard' ? 'bg-slate-900 text-white' : 'bg-white border'}`}
        >
          Whiteboard
        </button>
      </nav>

      <div ref={containerRef} className="relative">
        <RemoteCursors cursors={cursors} containerSize={containerSize} />

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
      // Mark the board as cleared at this moment. Any stroke committed before
      // this timestamp is considered deleted, regardless of arrival order.
      // This makes `clear` idempotent and race-safe: a stroke.add that is still
      // in flight will be rejected on both client and server once its
      // `createdAt` is older than `clearedAt`.
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