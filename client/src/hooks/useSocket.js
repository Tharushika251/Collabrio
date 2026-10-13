import { useEffect, useRef } from 'react';
import { useSocketContext } from '../context/SocketContext';

/**
 * Attaches a socket event listener with automatic cleanup.
 * Using a ref for the handler keeps the latest closure without
 * re-subscribing on every render.
 */
export function useSocketEvent(event, handler) {
  const { socket } = useSocketContext();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) return;
    const wrapped = (...args) => handlerRef.current(...args);
    socket.on(event, wrapped);
    return () => socket.off(event, wrapped);
  }, [socket, event]);
}

export function useSocketConnected() {
  return useSocketContext().connected;
}