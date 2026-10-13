import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, TOKEN_KEY } from '../utils/constants';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

/**
 * Module-level singleton.
 *
 * React 18 StrictMode mounts, unmounts, and remounts every component in
 * development. Creating the socket inside useEffect would tear down an
 * in-flight handshake and log "closed before the connection is
 * established". Hoisting to module scope guarantees exactly one
 * connection per tab, regardless of provider remounts.
 */
let socketInstance = null;

function getSocket() {
  if (socketInstance) return socketInstance;

  socketInstance = io(SOCKET_URL, {
    // Auth is resolved lazily on each connect attempt so token rotation
    // works without recreating the socket.
    auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) }),
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
      // Logout: the socket's identity is tied to a JWT. A new user must
      // never inherit an old user's socket, so tear it down cleanly.
      destroySocket();
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => console.warn('[socket] connect_error', err.message);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    if (s.connected) setConnected(true);
    setSocket(s);

    return () => {
      // Only remove the listeners we added. The underlying socket
      // survives provider remounts on purpose.
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