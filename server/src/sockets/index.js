import { Server } from 'socket.io';
import { verifyToken } from '../middleware/authMiddleware.js';
import { registerBoardHandlers } from './boardHandler.js';
import {
  addUser,
  removeUserFromAll,
  updateCursor,
  listUsers,
} from './presenceHandler.js';
import { logger } from '../utils/logger.js';

/**
 * Initializes Socket.IO with JWT handshake authentication.
 * Unauthenticated sockets are rejected before any handler is registered,
 * so downstream code never has to check auth.
 */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, credentials: true },
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
      logger.warn('socket auth failed', err.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    logger.info('socket connected', { id: socket.id, user: user.name });

    registerBoardHandlers(io, socket);

    // Authoritative presence join. Payload is `boardId` only.
    // A socket may join multiple boards (future feature) so we do not
    // overwrite a single `boardId` field on socket.data.
    socket.on('presence:join', ({ boardId }) => {
      if (!boardId) return;
      socket.join(boardId);
      addUser(boardId, socket.id, user);
      io.to(boardId).emit('presence:update', listUsers(boardId));
    });

    socket.on('presence:leave', ({ boardId }) => {
      if (!boardId) return;
      socket.leave(boardId);
      removeUserFromAll(socket.id);
      io.to(boardId).emit('presence:update', listUsers(boardId));
    });

    socket.on('presence:cursor', ({ boardId, x, y }) => {
      if (!boardId) return;
      updateCursor(boardId, socket.id, { x, y });
      socket.to(boardId).emit('presence:cursor', {
        userId: user._id.toString(),
        name: user.name,
        x,
        y,
      });
    });

    socket.on('presence:editing', ({ boardId, target }) => {
      if (!boardId) return;
      socket.to(boardId).emit('presence:editing', {
        userId: user._id.toString(),
        name: user.name,
        target,
      });
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected', { id: socket.id, reason });
      // Sweep the socket out of every board it was registered in, then
      // broadcast a fresh presence list to each affected room.
      const affected = removeUserFromAll(socket.id);
      for (const boardId of affected) {
        io.to(boardId).emit('presence:update', listUsers(boardId));
        io.to(boardId).emit('presence:editing', {
          userId: user._id.toString(),
          name: user.name,
          target: null,
        });
      }
    });
  });

  return io;
}