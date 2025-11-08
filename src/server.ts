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

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

// CORS - ALLOW ALL NETLIFY URLS + LOCALHOST
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://querydash-app.netlify.app',
  /https:\/\/.*\.netlify\.app$/, // All Netlify preview URLs
  /https:\/\/.*querydash.*\.netlify\.app$/ // All QueryDash Netlify URLs
];

// Enhanced CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') return allowed === origin;
      if (allowed instanceof RegExp) return allowed.test(origin);
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

// Handle preflight requests explicitly
app.options('*', cors());

// Socket.IO with same CORS policy
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') return allowed === origin;
        if (allowed instanceof RegExp) return allowed.test(origin);
        return false;
      });
      callback(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Security (relaxed for CORS)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Parsing & logging
app.use(express.json({ limit: '10kb' }));
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cors: 'enabled'
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'QueryDash API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      queries: '/api/queries',
      dashboards: '/api/dashboards'
    }
  });
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
      const { dashboardId, queryId } = queryData;

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
      logger.info(`✅ CORS enabled for all Netlify URLs`);
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
