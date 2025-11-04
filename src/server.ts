import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import pino from 'pino';

// Imports from modules (we'll create these next)
import { initializeDatabase } from './config/database.js';
import { initializeRedis } from './config/redis.js';
import authRoutes from './routes/auth.js';
import queryRoutes from './routes/queries.js';
import dashboardRoutes from './routes/dashboards.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/auth.js';

const app: Express = express();
const httpServer: HTTPServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// Logger setup
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard'
    }
  }
});

// === SECURITY MIDDLEWARE ===
app.use(helmet()); // Security headers
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 login attempts per hour
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true
});

app.use(limiter);

// === BODY PARSING ===
app.use(express.json({ limit: '10kb' })); // Prevent large payload attacks
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// === LOGGING ===
app.use(pinoHttp({ logger }));

// === HEALTH CHECK (for Render deployment) ===
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// === API ROUTES ===
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/queries', authenticate, queryRoutes);
app.use('/api/dashboards', authenticate, dashboardRoutes);

// === WEBSOCKET HANDLING ===
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('subscribe-dashboard', (dashboardId: string) => {
    socket.join(`dashboard-${dashboardId}`);
    logger.info(`Client subscribed to dashboard: ${dashboardId}`);
  });

  socket.on('execute-query', async (data: any) => {
    try {
      const { queryId, dashboardId, naturalLanguage } = data;

      // Validate input
      if (!naturalLanguage || naturalLanguage.length > 500) {
        throw new Error('Invalid query');
      }

      // Execute query (implementation in next section)
      // const result = await executeNLQuery(naturalLanguage);

      io.to(`dashboard-${dashboardId}`).emit('query-result', {
        queryId,
        data: [], // Placeholder
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error(error);
      socket.emit('query-error', {
        error: error instanceof Error ? error.message : 'Query failed'
      });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// === ERROR HANDLING ===
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

// === STARTUP ===
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database connected');

    // Initialize Redis
    await initializeRedis();
    logger.info('Redis connected');

    httpServer.listen(PORT, () => {
      logger.info(`QueryDash backend running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Gracefully shutting down...');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();
