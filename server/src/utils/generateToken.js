import jwt from 'jsonwebtoken';

/**
 * Signs a JWT containing the user id.
 * Used for both REST auth and Socket.IO handshake authentication.
 */
export function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}