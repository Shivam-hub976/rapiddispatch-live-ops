import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLockManager } from '../src/services/lockManager.js';

describe('In-Memory Lock Manager', () => {
  let manager;

  beforeEach(() => {
    manager = createLockManager();
  });

  it('acquires a lock on a free ticket and updates stats', () => {
    const result = manager.acquireLock({
      ticketId: 'RD-105',
      socketId: 'socket-A',
      agentName: 'Agent Sarah',
    });

    assert.equal(result.ok, true);
    assert.equal(result.alreadyOwned, false);
    assert.equal(result.lock.ticketId, 'RD-105');
    assert.equal(result.lock.socketId, 'socket-A');
    assert.equal(manager.isLockedBy('RD-105', 'socket-A'), true);
    assert.deepEqual(manager.getStats(), {
      lockedTicketCount: 1,
      activeLockHolders: 1,
    });
  });

  it('rejects a second agent attempting to lock an already-locked ticket', () => {
    manager.acquireLock({
      ticketId: 'RD-105',
      socketId: 'socket-A',
      agentName: 'Agent Sarah',
    });

    const collision = manager.acquireLock({
      ticketId: 'RD-105',
      socketId: 'socket-B',
      agentName: 'Agent Marcus',
    });

    assert.equal(collision.ok, false);
    assert.equal(collision.code, 'ALREADY_LOCKED');
    assert.equal(collision.lockedBy.socketId, 'socket-A');
    assert.equal(collision.lockedBy.agentName, 'Agent Sarah');
  });

  it('handles idempotent re-lock requests from the same socket cleanly', () => {
    const first = manager.acquireLock({
      ticketId: 'RD-105',
      socketId: 'socket-A',
      agentName: 'Agent Sarah',
    });

    const second = manager.acquireLock({
      ticketId: 'RD-105',
      socketId: 'socket-A',
      agentName: 'Agent Sarah',
    });

    assert.equal(second.ok, true);
    assert.equal(second.alreadyOwned, true);
    assert.equal(second.lock.lockedAt, first.lock.lockedAt);
    assert.equal(manager.getStats().lockedTicketCount, 1);
  });

  it('prevents another agent from unlocking a ticket they do not own', () => {
    manager.acquireLock({
      ticketId: 'RD-101',
      socketId: 'socket-A',
      agentName: 'Agent Sarah',
    });

    const unauthorized = manager.releaseLock({
      ticketId: 'RD-101',
      socketId: 'socket-B',
    });

    assert.equal(unauthorized.ok, false);
    assert.equal(unauthorized.code, 'NOT_OWNER');
    assert.equal(manager.isLockedBy('RD-101', 'socket-A'), true);
  });

  it('releases a lock cleanly and removes empty reverse-index entries', () => {
    manager.acquireLock({
      ticketId: 'RD-101',
      socketId: 'socket-A',
      agentName: 'Agent Sarah',
    });

    const released = manager.releaseLock({
      ticketId: 'RD-101',
      socketId: 'socket-A',
    });

    assert.equal(released.ok, true);
    assert.equal(released.releasedLock.ticketId, 'RD-101');
    assert.equal(manager.getLock('RD-101'), null);
    assert.deepEqual(manager.getStats(), {
      lockedTicketCount: 0,
      activeLockHolders: 0,
    });
  });

  it('releases all locks held by a dropped socket without affecting other agents', () => {
    manager.acquireLock({ ticketId: 'RD-101', socketId: 'socket-A', agentName: 'Agent Sarah' });
    manager.acquireLock({ ticketId: 'RD-105', socketId: 'socket-A', agentName: 'Agent Sarah' });
    manager.acquireLock({ ticketId: 'RD-109', socketId: 'socket-B', agentName: 'Agent Marcus' });

    const released = manager.releaseAllBySocket('socket-A');

    assert.equal(released.length, 2);
    assert.equal(manager.getLock('RD-101'), null);
    assert.equal(manager.getLock('RD-105'), null);
    assert.equal(manager.isLockedBy('RD-109', 'socket-B'), true);
    assert.deepEqual(manager.getStats(), {
      lockedTicketCount: 1,
      activeLockHolders: 1,
    });
  });
});