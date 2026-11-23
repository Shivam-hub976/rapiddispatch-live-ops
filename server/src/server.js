import http from 'node:http';
import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';
import { seedInitialTickets } from './services/ticketStore.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;
const httpServer = http.createServer(app);

const startServer = async () => {
  try {
    await connectDB();
    await seedInitialTickets();

    httpServer.listen(PORT, () => {
      console.log(`[Server] RapidDispatch Live Ops running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('[Server] Fatal startup error:', error);
    process.exit(1);
  }
};

startServer();