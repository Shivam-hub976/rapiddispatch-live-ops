import { Server } from 'socket.io';
import { getAllowedOrigins } from '../app.js';
import {
  DASHBOARD_ROOM,
  CLIENT_EVENTS,
  SERVER_EVENTS,
} from './socketEvents.js';
import { sanitizeAgentName, sanitizeTicketId } from '../utils/sanitize.js';

// Tracks currently connected agents by socket.id
const connectedAgents = new Map();

const safeAck = (ack, payload) => {
  if (typeof ack === 'function') {
    ack(payload);
  }
};

const broadcastActiveAgents = (io) => {
  const agents = Array.from(connectedAgents.values()).map((agent) => ({
    socketId: agent.socketId,
    agentName: agent.agentName,
    joinedAt: agent.joinedAt,
  }));

  io.to(DASHBOARD_ROOM).emit(SERVER_EVENTS.ACTIVE_AGENTS_UPDATED, {
    count: agents.length,
    agents,
  });
};

export const initializeSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        const allowedOrigins = getAllowedOrigins();
        // Allow clients with no Origin header (health checks, CLI tools)
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        console.warn(`[Socket CORS] Blocked connection from origin: ${origin}`);
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Prefer direct WebSocket transport; allow polling fallback for strict proxies
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // 1. Agent joins the Live Ops dashboard room
    socket.on(CLIENT_EVENTS.JOIN_DASHBOARD, (payload = {}, ack) => {
      const agentName =
        sanitizeAgentName(payload?.agentName) ||
        `Agent-${socket.id.slice(0, 4).toUpperCase()}`;

      socket.join(DASHBOARD_ROOM);

      const agentRecord = {
        socketId: socket.id,
        agentName,
        joinedAt: new Date().toISOString(),
      };
      connectedAgents.set(socket.id, agentRecord);

      console.log(`[Socket] ${agentName} (${socket.id}) joined ${DASHBOARD_ROOM}`);

      const response = {
        ok: true,
        socketId: socket.id,
        agentName,
        room: DASHBOARD_ROOM,
        activeAgentCount: connectedAgents.size,
      };

      socket.emit(SERVER_EVENTS.DASHBOARD_JOINED, response);
      broadcastActiveAgents(io);
      safeAck(ack, response);
    });

    // 2. Request a lock on a freight ticket (in-memory lock enforcement wired in Day 2)
    socket.on(CLIENT_EVENTS.LOCK_TICKET, (payload = {}, ack) => {
      const ticketId = sanitizeTicketId(payload?.ticketId);

      if (!ticketId) {
        const errorResponse = {
          ok: false,
          code: 'INVALID_TICKET_ID',
          message: 'A valid ticketId (e.g., RD-105) is required.',
        };
        return safeAck(ack, errorResponse);
      }

      const agent = connectedAgents.get(socket.id);
      const agentName =
        agent?.agentName ||
        sanitizeAgentName(payload?.agentName) ||
        `Agent-${socket.id.slice(0, 4).toUpperCase()}`;

      console.log(
        `[Socket] lock_ticket received | ticket=${ticketId} | agent=${agentName} (${socket.id})`
      );

      // Skeleton response — Day 2 Step 2.1/2.2 plugs in lockManager.acquireLock()
      return safeAck(ack, {
        ok: true,
        status: 'acknowledged_skeleton',
        ticketId,
        socketId: socket.id,
        agentName,
      });
    });

    // 3. Release a lock on a freight ticket (ownership verification wired in Day 2)
    socket.on(CLIENT_EVENTS.UNLOCK_TICKET, (payload = {}, ack) => {
      const ticketId = sanitizeTicketId(payload?.ticketId);

      if (!ticketId) {
        return safeAck(ack, {
          ok: false,
          code: 'INVALID_TICKET_ID',
          message: 'A valid ticketId (e.g., RD-105) is required.',
        });
      }

      console.log(`[Socket] unlock_ticket received | ticket=${ticketId} | socket=${socket.id}`);

      // Skeleton response — Day 2 Step 2.1/2.2 plugs in lockManager.releaseLock()
      return safeAck(ack, {
        ok: true,
        status: 'acknowledged_skeleton',
        ticketId,
        socketId: socket.id,
      });
    });

    // 4. Disconnect cleanup (Day 3 Step 3.1 wires automatic Ghost Disconnect ticket release)
    socket.on('disconnect', (reason) => {
      const departedAgent = connectedAgents.get(socket.id);
      connectedAgents.delete(socket.id);

      console.log(
        `[Socket] Client disconnected: ${socket.id} (${departedAgent?.agentName || 'Unregistered'}) | reason=${reason}`
      );

      if (departedAgent) {
        broadcastActiveAgents(io);
      }
    });
  });

  return io;
};