import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Verifies the Bearer token and attaches the user document to `req.user`.
 * Socket.IO reuses this logic via a shared verify function below.
 */
export async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not authenticated' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User no longer exists' });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Shared token verification helper for Socket.IO handshake.
 * Returns the user document or throws.
 */
export async function verifyToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select('-password');
  if (!user) throw new Error('User not found');
  return user;
}