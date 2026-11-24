import { Server } from 'socket.io';
import { getAllowedOrigins } from '../app.js';
import {
  DASHBOARD_ROOM,
  CLIENT_EVENTS,
  SERVER_EVENTS,
} from './socketEvents.js';
import { sanitizeAgentName, sanitizeTicketId } from '../utils/sanitize.js';
import defaultLockManager from '../services/lockManager.js';
import { getTicketById } from '../services/ticketStore.js';

const safeAck = (ack, payload) => {
  if (typeof ack === 'function') {
    ack(payload);
  }
};

export const initializeSocketServer = (
  httpServer,
  { lockManager = defaultLockManager } = {}
) => {
  // Scoped per server instance so integration tests remain isolated
  const connectedAgents = new Map();

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

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        const allowedOrigins = getAllowedOrigins();
        // Allow clients with no Origin header (health checks, CLI tools, tests)
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        console.warn(`[Socket CORS] Blocked connection from origin: ${origin}`);
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // 1. Agent joins (or updates display name on) the Live Ops dashboard
    socket.on(CLIENT_EVENTS.JOIN_DASHBOARD, (payload = {}, ack) => {
      const agentName =
        sanitizeAgentName(payload?.agentName) ||
        `Agent-${socket.id.slice(0, 4).toUpperCase()}`;

      socket.join(DASHBOARD_ROOM);

      const agentRecord = {
        socketId: socket.id,
        agentName,
        joinedAt: connectedAgents.get(socket.id)?.joinedAt || new Date().toISOString(),
      };
      connectedAgents.set(socket.id, agentRecord);

      const currentLocks = lockManager.getAllLocks();

      console.log(
        `[Socket] ${agentName} (${socket.id}) joined ${DASHBOARD_ROOM} | activeLocks=${Object.keys(currentLocks).length}`
      );

      const response = {
        ok: true,
        socketId: socket.id,
        agentName,
        room: DASHBOARD_ROOM,
        activeAgentCount: connectedAgents.size,
        locks: currentLocks,
      };

      // Sync the current in-memory lock table immediately to this joining client
      socket.emit(SERVER_EVENTS.DASHBOARD_JOINED, response);
      socket.emit(SERVER_EVENTS.LOCK_STATE_SYNC, {
        locks: currentLocks,
        syncedAt: new Date().toISOString(),
      });

      broadcastActiveAgents(io);
      safeAck(ack, response);
    });

    // 2. Request an exclusive in-memory lock on a freight ticket
    socket.on(CLIENT_EVENTS.LOCK_TICKET, async (payload = {}, ack) => {
      try {
        const ticketId = sanitizeTicketId(payload?.ticketId);

        if (!ticketId) {
          const errorResponse = {
            ok: false,
            code: 'INVALID_TICKET_ID',
            message: 'A valid ticketId (e.g., RD-105) is required.',
          };
          socket.emit(SERVER_EVENTS.LOCK_REJECTED, errorResponse);
          return safeAck(ack, errorResponse);
        }

        // Fast synchronous pre-check before touching the DB
        const existingLock = lockManager.getLock(ticketId);
        if (existingLock && existingLock.socketId !== socket.id) {
          const conflictResponse = {
            ok: false,
            code: 'ALREADY_LOCKED',
            ticketId,
            message: `Ticket ${ticketId} is currently locked by ${existingLock.agentName}.`,
            lockedBy: existingLock,
          };
          console.log(
            `[Lock Rejected] ${socket.id} blocked on ${ticketId} (held by ${existingLock.agentName})`
          );
          socket.emit(SERVER_EVENTS.LOCK_REJECTED, conflictResponse);
          return safeAck(ack, conflictResponse);
        }

        // Verify ticket exists and is still open
        const ticket = await getTicketById(ticketId);
        if (!ticket) {
          const notFound = {
            ok: false,
            code: 'TICKET_NOT_FOUND',
            ticketId,
            message: `Ticket ${ticketId} does not exist.`,
          };
          socket.emit(SERVER_EVENTS.LOCK_REJECTED, notFound);
          return safeAck(ack, notFound);
        }

        if (ticket.status === 'resolved') {
          const alreadyResolved = {
            ok: false,
            code: 'TICKET_ALREADY_RESOLVED',
            ticketId,
            message: `Ticket ${ticketId} has already been resolved by ${ticket.resolvedBy || 'an agent'}.`,
          };
          socket.emit(SERVER_EVENTS.LOCK_REJECTED, alreadyResolved);
          return safeAck(ack, alreadyResolved);
        }

        const agent = connectedAgents.get(socket.id);
        const agentName =
          agent?.agentName ||
          sanitizeAgentName(payload?.agentName) ||
          `Agent-${socket.id.slice(0, 4).toUpperCase()}`;

        // Atomic synchronous lock acquisition (guards against races during the DB await)
        const result = lockManager.acquireLock({
          ticketId,
          socketId: socket.id,
          agentName,
        });

        if (!result.ok) {
          const conflictResponse = {
            ok: false,
            code: result.code,
            ticketId,
            message: result.message,
            lockedBy: result.lockedBy || null,
          };
          socket.emit(SERVER_EVENTS.LOCK_REJECTED, conflictResponse);
          return safeAck(ack, conflictResponse);
        }

        // Broadcast new lock state to all connected clients
        if (!result.alreadyOwned) {
          console.log(
            `[Lock Acquired] ${ticketId} locked by ${agentName} (${socket.id})`
          );
          io.emit(SERVER_EVENTS.TICKET_LOCKED, {
            ticketId,
            lock: result.lock,
          });
        }

        return safeAck(ack, {
          ok: true,
          ticketId,
          alreadyOwned: result.alreadyOwned,
          lock: result.lock,
        });
      } catch (error) {
        console.error('[Socket] lock_ticket error:', error.message);
        const serverError = {
          ok: false,
          code: 'LOCK_INTERNAL_ERROR',
          message: 'Unable to process lock request. Please try again.',
        };
        socket.emit(SERVER_EVENTS.LOCK_REJECTED, serverError);
        return safeAck(ack, serverError);
      }
    });

    // 3. Release a lock (only permitted for the current lock owner)
    socket.on(CLIENT_EVENTS.UNLOCK_TICKET, (payload = {}, ack) => {
      const ticketId = sanitizeTicketId(payload?.ticketId);

      if (!ticketId) {
        return safeAck(ack, {
          ok: false,
          code: 'INVALID_TICKET_ID',
          message: 'A valid ticketId (e.g., RD-105) is required.',
        });
      }

      const result = lockManager.releaseLock({
        ticketId,
        socketId: socket.id,
      });

      if (!result.ok) {
        console.log(
          `[Unlock Denied] ${socket.id} failed to unlock ${ticketId}: ${result.code}`
        );
        return safeAck(ack, {
          ok: false,
          code: result.code,
          ticketId,
          message: result.message,
          lockedBy: result.lockedBy || null,
        });
      }

      console.log(
        `[Lock Released] ${ticketId} unlocked by ${result.releasedLock.agentName} (${socket.id})`
      );

      // Broadcast the unlocked state to every connected client
      io.emit(SERVER_EVENTS.TICKET_UNLOCKED, {
        ticketId,
        unlockedBy: result.releasedLock.agentName,
        socketId: socket.id,
        unlockedAt: new Date().toISOString(),
      });

      return safeAck(ack, {
        ok: true,
        ticketId,
        releasedLock: result.releasedLock,
      });
    });

    // 4. Disconnect handler (Day 3 Step 3.1 adds automatic Ghost Disconnect ticket release)
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