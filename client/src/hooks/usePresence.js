import { useEffect, useState } from 'react';
import { useSocketEvent } from './useSocket';
import { useSocketContext } from '../context/SocketContext';

/**
 * Subscribes to presence and cursor updates for a board.
 * Returns the current user list, cursor map, and the active editor map.
 */
export function usePresence(boardId) {
  const { socket } = useSocketContext();
  const [users, setUsers] = useState([]);
  const [cursors, setCursors] = useState({});
  const [editors, setEditors] = useState({});

  useEffect(() => {
    if (!socket || !boardId) return;
    socket.emit('presence:join', { boardId });
  }, [socket, boardId]);

  useSocketEvent('presence:update', (list) => setUsers(list));

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