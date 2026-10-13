/**
 * Minimal structured logger. Keeps output uniform across modules
 * and is easy to swap for a full logger (pino/winston) later.
 */
export const logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
};