import { Server } from 'socket.io';
import { verifyToken } from '../middleware/authMiddleware.js';
import { registerBoardHandlers } from './boardHandler.js';
import { addUser, removeUser, updateCursor, listUsers } from './presenceHandler.js';
import { logger } from '../utils/logger.js';

/**
 * Initializes Socket.IO with JWT handshake authentication.
 * Unauthenticated sockets are rejected before any event can be registered,
 * which keeps every downstream handler free of auth checks.
 */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },
    // Tuned for flaky networks: fast client detection, then exponential backoff.
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Missing token'));

      const user = await verifyToken(token);
      socket.data.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    logger.info(`socket connected`, { id: socket.id, user: user.name });

    registerBoardHandlers(io, socket);

    socket.on('presence:join', ({ boardId }) => {
      addUser(boardId, socket.id, user);
      socket.data.boardId = boardId;
      io.to(boardId).emit('presence:update', listUsers(boardId));
    });

    socket.on('presence:cursor', ({ boardId, x, y }) => {
      updateCursor(boardId, socket.id, { x, y });
      socket.to(boardId).emit('presence:cursor', {
        userId: user._id.toString(),
        name: user.name,
        x,
        y,
      });
    });

    socket.on('presence:editing', ({ boardId, target }) => {
      // target: { kind: 'task', id } | null — used to render "Sam is editing…"
      socket.to(boardId).emit('presence:editing', {
        userId: user._id.toString(),
        name: user.name,
        target,
      });
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected', { id: socket.id, reason });
      const boardId = socket.data.boardId;
      if (boardId) {
        removeUser(boardId, socket.id);
        io.to(boardId).emit('presence:update', listUsers(boardId));
        // Clear any "user is editing" indicator owned by this socket.
        socket.to(boardId).emit('presence:editing', {
          userId: user._id.toString(),
          name: user.name,
          target: null,
        });
      }
    });
  });

  return io;
}