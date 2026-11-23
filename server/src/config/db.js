import dns from 'node:dns';
import mongoose from 'mongoose';

let dbConnected = false;

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri || uri.includes('<username>')) {
    console.warn(
      '[DB] No valid MONGODB_URI configured. Running with in-memory ticket store fallback.'
    );
    dbConnected = false;
    return false;
  }

  // Force Node's c-ares resolver to use Google/Cloudflare DNS for SRV lookups
  // Prevents querySrv ECONNREFUSED on Node v24+ and ISP DNS blockers
  if (uri.startsWith('mongodb+srv://')) {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    dbConnected = true;
    console.log(`[DB] Connected to MongoDB Atlas: ${mongoose.connection.host}`);
    return true;
  } catch (error) {
    console.error(`[DB] Connection failed (${error.message}). Falling back to in-memory ticket store.`);
    dbConnected = false;
    return false;
  }
};

export const isDbConnected = () => dbConnected && mongoose.connection.readyState === 1;