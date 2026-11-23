import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import ticketRoutes from './routes/ticketRoutes.js';
import { isDbConnected } from './config/db.js';

export const getAllowedOrigins = () => {
  const raw = process.env.CLIENT_URL || 'http://localhost:5173';
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
};

const app = express();

// Security headers
app.use(helmet());

// Strict CORS configuration (shared later with Socket.io)
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();
      // Allow requests with no origin (Thunder Client, Render health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// Body parsing with strict size limit
app.use(express.json({ limit: '16kb' }));

// Health check endpoint (used by Render & monitoring)
app.get('/api/health', (_req, res) => {
  const io = app.get('io');
  res.status(200).json({
    status: 'ok',
    service: 'RapidDispatch Live Ops API',
    persistence: isDbConnected() ? 'mongodb-atlas' : 'in-memory-fallback',
    realtime: io ? 'socket.io-ready' : 'unavailable',
    activeConnections: io?.engine?.clientsCount ?? 0,
    timestamp: new Date().toISOString(),
  });
});

// Freight Ticket REST API
app.use('/api/tickets', ticketRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// Centralized Error Handler
app.use((err, _req, res, _next) => {
  const statusCode = err.message?.startsWith('CORS blocked') ? 403 : 500;
  console.error(`[Error] ${err.message}`);

  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Internal server error'
        : err.message,
  });
});

export default app;