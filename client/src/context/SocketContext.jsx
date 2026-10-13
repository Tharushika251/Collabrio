import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, TOKEN_KEY } from '../utils/constants';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

/**
 * Module-level singleton.
 *
 * React 18 StrictMode intentionally mounts, unmounts, and remounts every
 * component in development. If the socket is created inside useEffect and
 * torn down during the StrictMode cleanup, the client aborts an in-flight
 * WebSocket handshake and logs "closed before the connection is established".
 *
 * Hoisting the socket to module scope ensures exactly one connection is
 * created for the application lifetime, regardless of how many times the
 * provider remounts.
 */
let socketInstance = null;

function getSocket(token) {
  if (socketInstance) return socketInstance;

  socketInstance = io(SOCKET_URL, {
    auth: (cb) => cb({ token }),
    // Start with polling then upgrade: the WebSocket-only transport can fail
    // behind proxies and during fast dev remounts, and polling fallback makes
    // reconnect behavior resilient.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });

  return socketInstance;
}

function destroySocket() {
  if (!socketInstance) return;
  socketInstance.removeAllListeners();
  socketInstance.disconnect();
  socketInstance = null;
}

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      destroySocket();
      setSocket(null);
      setConnected(false);
      return;
    }

    // Refresh the token inside the auth callback on every connect attempt,
    // so a rotated token is picked up without recreating the socket.
    const s = getSocket(localStorage.getItem(TOKEN_KEY));

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => console.warn('[socket] connect_error', err.message);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    if (s.connected) setConnected(true);
    setSocket(s);

    return () => {
      // Only remove the listeners we added; keep the underlying socket alive
      // so a StrictMode remount does not tear down an established connection.
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocketContext = () => useContext(SocketContext);