import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, TOKEN_KEY } from '../utils/constants';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

/**
 * Manages a single Socket.IO connection for the app.
 * Reconnects automatically with exponential backoff (Socket.IO default)
 * and re-issues the auth token on every reconnect attempt so rotated
 * tokens are respected.
 */
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = io(SOCKET_URL, {
      auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) }),
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => console.warn('[socket] connect_error', err.message));

    socketRef.current = s;
    setSocket(s);

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocketContext = () => useContext(SocketContext);