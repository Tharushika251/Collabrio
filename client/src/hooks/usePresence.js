import { useCallback, useEffect, useState } from 'react';
import { useSocketContext } from '../context/SocketContext';
import { useSocketEvent } from './useSocket';

/**
 * Subscribes to presence and cursor updates for a board.
 *
 * Lifecycle:
 *  - On mount (or boardId change): emit presence:join.
 *  - On unmount: emit presence:leave so the server can drop the entry
 *    without waiting for a socket disconnect (which never happens when
 *    the socket is a long-lived singleton).
 *  - On reconnect: emit presence:join again to re-register.
 */
export function usePresence(boardId) {
  const { socket, connected } = useSocketContext();
  const [users, setUsers] = useState([]);
  const [cursors, setCursors] = useState({});
  const [editors, setEditors] = useState({});

  useEffect(() => {
    if (!socket || !boardId) return;

    const join = () => socket.emit('presence:join', { boardId });

    join();
    socket.on('connect', join);

    return () => {
      socket.off('connect', join);
      socket.emit('presence:leave', { boardId });
      // Clear local presence state so a stale avatar stack does not
      // linger during the leave round-trip.
      setUsers([]);
      setCursors({});
      setEditors({});
    };
  }, [socket, boardId]);

  useSocketEvent('presence:update', (list) => {
    setUsers(list);
  });

  useSocketEvent('presence:cursor', ({ userId, x, y }) => {
    setCursors((prev) => ({ ...prev, [userId]: { x, y, ts: Date.now() } }));
  });

  useSocketEvent('presence:editing', ({ userId, name, target }) => {
    setEditors((prev) => {
      const next = { ...prev };
      if (!target) delete next[userId];
      else next[userId] = { name, target };
      return next;
    });
  });

  return { users, cursors, editors };
}