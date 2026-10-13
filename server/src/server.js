import { setServers } from 'node:dns/promises';
setServers(['1.1.1.1', '8.8.8.8']);

import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import boardRoutes from './routes/boardRoutes.js';
import { initSocket } from './sockets/index.js';
import { logger } from './utils/logger.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true })
);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);

// Central error handler. Signature must have 4 args for Express to treat it as such.
app.use((err, _req, res, _next) => {
  logger.error('unhandled error', err.message);
  res.status(500).json({ message: 'Server error' });
});

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => logger.info(`HTTP+Socket listening on :${PORT}`));
});