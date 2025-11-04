import 'dotenv/config';
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import pino from 'pino';

import { initializeDatabase } from './config/database.js';
import { initializeRedis } from './config/redis.js';
import authRoutes from './routes/auth.js';
import queryRoutes from './routes/queries.js';
import dashboardRoutes from './routes/dashboards.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(','),
    credentials: true
  }
});

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

// Security
app.use(helmet());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Parsing & logging
app.use(express.json({ limit: '10kb' }));
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/queries', queryRoutes);
app.use('/api/dashboards', dashboardRoutes);

// WebSocket
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('subscribe-dashboard', (dashboardId: string) => {
    socket.join(`dashboard-${dashboardId}`);
  });

  socket.on('execute-query', async (data: unknown) => {
    try {
      const queryData = data as {
        dashboardId: string;
        queryId: string;
        naturalLanguage: string;
      };
      const { dashboardId, queryId, naturalLanguage } = queryData;

      io.to(`dashboard-${dashboardId}`).emit('query-result', {
        queryId,
        data: { columns: ['test'], rows: [{ test: 'value' }] },
        timestamp: Date.now()
      });
    } catch (error) {
      socket.emit('query-error', { error: 'Query failed' });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await initializeDatabase();
    await initializeRedis();

    httpServer.listen(PORT, () => {
      logger.info(`✅ QueryDash backend running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  httpServer.close(() => process.exit(0));
});

start();
