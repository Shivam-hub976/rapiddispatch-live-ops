/**
 * In-memory real-time lock manager for RapidDispatch Live Ops.
 *
 * Uses two synchronized RAM structures:
 *  1. ticketLocks:     Map<ticketId, LockRecord>      -> O(1) conflict check
 *  2. socketToTickets: Map<socketId, Set<ticketId>>   -> O(k) disconnect cleanup
 *
 * All mutations are strictly synchronous (no `await` between check and write),
 * guaranteeing atomic lock acquisition on Node's single-threaded event loop.
 */
export const createLockManager = () => {
  const ticketLocks = new Map();
  const socketToTickets = new Map();

  const removeFromReverseIndex = (socketId, ticketId) => {
    const ownedTickets = socketToTickets.get(socketId);
    if (!ownedTickets) return;

    ownedTickets.delete(ticketId);
    // Clean up empty Sets immediately to prevent memory leaks
    if (ownedTickets.size === 0) {
      socketToTickets.delete(socketId);
    }
  };

  /**
   * Attempts to atomically acquire a lock on `ticketId` for `socketId`.
   */
  const acquireLock = ({ ticketId, socketId, agentName }) => {
    if (!ticketId || !socketId || !agentName) {
      return {
        ok: false,
        code: 'INVALID_LOCK_PARAMS',
        message: 'ticketId, socketId, and agentName are required to acquire a lock.',
      };
    }

    const existingLock = ticketLocks.get(ticketId);

    // Case 1: Already locked by a DIFFERENT socket -> Reject to prevent collision
    if (existingLock && existingLock.socketId !== socketId) {
      return {
        ok: false,
        code: 'ALREADY_LOCKED',
        message: `Ticket ${ticketId} is currently locked by ${existingLock.agentName}.`,
        lockedBy: { ...existingLock },
      };
    }

    // Case 2: Already locked by the SAME socket -> Idempotent success (safe on double-clicks)
    if (existingLock && existingLock.socketId === socketId) {
      return {
        ok: true,
        alreadyOwned: true,
        lock: { ...existingLock },
      };
    }

    // Case 3: Ticket is free -> Atomically lock in both Maps
    const newLock = {
      ticketId,
      socketId,
      agentName,
      lockedAt: new Date().toISOString(),
    };

    ticketLocks.set(ticketId, newLock);

    if (!socketToTickets.has(socketId)) {
      socketToTickets.set(socketId, new Set());
    }
    socketToTickets.get(socketId).add(ticketId);

    return {
      ok: true,
      alreadyOwned: false,
      lock: { ...newLock },
    };
  };

  /**
   * Releases a lock ONLY if the requesting socketId is the current lock owner.
   */
  const releaseLock = ({ ticketId, socketId }) => {
    if (!ticketId || !socketId) {
      return {
        ok: false,
        code: 'INVALID_LOCK_PARAMS',
        message: 'ticketId and socketId are required to release a lock.',
      };
    }

    const existingLock = ticketLocks.get(ticketId);

    if (!existingLock) {
      return {
        ok: false,
        code: 'NOT_LOCKED',
        message: `Ticket ${ticketId} is not currently locked.`,
      };
    }

    // Ownership guard: prevent Agent B from unlocking Agent A's ticket
    if (existingLock.socketId !== socketId) {
      return {
        ok: false,
        code: 'NOT_OWNER',
        message: `Only ${existingLock.agentName} can unlock ticket ${ticketId}.`,
        lockedBy: { ...existingLock },
      };
    }

    ticketLocks.delete(ticketId);
    removeFromReverseIndex(socketId, ticketId);

    return {
      ok: true,
      releasedLock: { ...existingLock },
    };
  };

  /**
   * Releases every ticket locked by `socketId` in O(k) time.
   * Powers the Requirement 3 Ghost Disconnect handler.
   */
  const releaseAllBySocket = (socketId) => {
    if (!socketId) return [];

    const ownedTickets = socketToTickets.get(socketId);
    if (!ownedTickets || ownedTickets.size === 0) {
      return [];
    }

    const releasedLocks = [];

    for (const ticketId of ownedTickets) {
      const lock = ticketLocks.get(ticketId);
      if (lock && lock.socketId === socketId) {
        ticketLocks.delete(ticketId);
        releasedLocks.push({ ...lock });
      }
    }

    socketToTickets.delete(socketId);
    return releasedLocks;
  };

  const getLock = (ticketId) => {
    const lock = ticketLocks.get(ticketId);
    return lock ? { ...lock } : null;
  };

  const isLockedBy = (ticketId, socketId) => {
    const lock = ticketLocks.get(ticketId);
    return Boolean(lock && lock.socketId === socketId);
  };

  /**
   * Returns a JSON-serializable snapshot of all active locks: { [ticketId]: LockRecord }
   */
  const getAllLocks = () => {
    const snapshot = {};
    for (const [ticketId, lock] of ticketLocks.entries()) {
      snapshot[ticketId] = { ...lock };
    }
    return snapshot;
  };

  const getStats = () => ({
    lockedTicketCount: ticketLocks.size,
    activeLockHolders: socketToTickets.size,
  });

  const clearAllLocks = () => {
    ticketLocks.clear();
    socketToTickets.clear();
  };

  return {
    acquireLock,
    releaseLock,
    releaseAllBySocket,
    getLock,
    isLockedBy,
    getAllLocks,
    getStats,
    clearAllLocks,
  };
};

// Shared singleton instance used by the live Socket.io & Express server
const lockManager = createLockManager();

export default lockManager;