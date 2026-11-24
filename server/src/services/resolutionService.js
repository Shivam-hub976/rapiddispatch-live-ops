import lockManager from './lockManager.js';
import { getTicketById, resolveTicketById } from './ticketStore.js';
import { SERVER_EVENTS } from '../socket/socketEvents.js';
import {
  sanitizeAgentName,
  sanitizeResolutionNote,
  sanitizeTicketId,
} from '../utils/sanitize.js';

// Prevents duplicate concurrent writes if an agent double-clicks Submit
const resolvingTickets = new Set();

/**
 * Validates ownership, sanitizes input, persists the resolution,
 * releases the in-memory lock, and broadcasts updates to all clients.
 */
export const executeTicketResolution = async ({
  ticketId: rawTicketId,
  resolutionNote: rawResolutionNote,
  socketId,
  agentName: rawAgentName,
  io,
}) => {
  const ticketId = sanitizeTicketId(rawTicketId);
  if (!ticketId) {
    return {
      ok: false,
      statusCode: 400,
      code: 'INVALID_TICKET_ID',
      message: 'A valid ticketId (e.g., RD-105) is required.',
    };
  }

  if (typeof socketId !== 'string' || !socketId.trim()) {
    return {
      ok: false,
      statusCode: 400,
      code: 'MISSING_SOCKET_ID',
      message: 'Active socket session is required to resolve a ticket.',
    };
  }

  const noteCheck = sanitizeResolutionNote(rawResolutionNote);
  if (!noteCheck.valid) {
    return {
      ok: false,
      statusCode: 400,
      code: 'INVALID_RESOLUTION_NOTE',
      message: noteCheck.message,
    };
  }

  // Synchronous RAM check: verify caller holds the active lock
  const activeLock = lockManager.getLock(ticketId);
  if (!activeLock) {
    return {
      ok: false,
      statusCode: 409,
      code: 'LOCK_REQUIRED',
      message: `You must lock ticket ${ticketId} before submitting a resolution.`,
    };
  }

  if (activeLock.socketId !== socketId) {
    return {
      ok: false,
      statusCode: 403,
      code: 'NOT_LOCK_OWNER',
      message: `Resolution blocked: Ticket ${ticketId} is currently locked by ${activeLock.agentName}.`,
      lockedBy: activeLock,
    };
  }

  if (resolvingTickets.has(ticketId)) {
    return {
      ok: false,
      statusCode: 409,
      code: 'RESOLUTION_IN_PROGRESS',
      message: `Ticket ${ticketId} is already being saved. Please wait.`,
    };
  }

  resolvingTickets.add(ticketId);

  try {
    const existingTicket = await getTicketById(ticketId);

    if (!existingTicket) {
      return {
        ok: false,
        statusCode: 404,
        code: 'TICKET_NOT_FOUND',
        message: `Ticket ${ticketId} does not exist.`,
      };
    }

    if (existingTicket.status === 'resolved') {
      return {
        ok: false,
        statusCode: 409,
        code: 'TICKET_ALREADY_RESOLVED',
        message: `Ticket ${ticketId} was already resolved by ${existingTicket.resolvedBy || 'another agent'}.`,
      };
    }

    const resolvedBy =
      sanitizeAgentName(rawAgentName) || activeLock.agentName;

    const updatedTicket = await resolveTicketById(ticketId, {
      resolutionNote: noteCheck.value,
      resolvedBy,
    });

    // Release the in-memory lock immediately after persistence succeeds
    lockManager.releaseLock({ ticketId, socketId });

    const locksSnapshot = lockManager.getAllLocks();

    console.log(
      `[Ticket Resolved] ${ticketId} resolved by ${resolvedBy} (${socketId})`
    );

    if (io) {
      io.emit(SERVER_EVENTS.TICKET_RESOLVED, {
        ticketId,
        ticket: updatedTicket,
        locks: locksSnapshot,
      });
    }

    return {
      ok: true,
      statusCode: 200,
      ticket: updatedTicket,
      locks: locksSnapshot,
    };
  } finally {
    resolvingTickets.delete(ticketId);
  }
};