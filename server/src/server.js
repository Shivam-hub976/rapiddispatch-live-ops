import http from 'node:http';
import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';
import { seedInitialTickets } from './services/ticketStore.js';
import { initializeSocketServer } from './socket/index.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;
const httpServer = http.createServer(app);

// Attach Socket.io to the shared HTTP server
const io = initializeSocketServer(httpServer);
app.set('io', io);

const startServer = async () => {
  try {
    await connectDB();
    await seedInitialTickets();

    httpServer.listen(PORT, () => {
      console.log(`[Server] RapidDispatch Live Ops running on http://localhost:${PORT}`);
      console.log('[Socket] Socket.io server attached and listening for connections');
    });
  } catch (error) {
    console.error('[Server] Fatal startup error:', error);
    process.exit(1);
  }
};

startServer();