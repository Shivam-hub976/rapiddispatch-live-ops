import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as createClient } from 'socket.io-client';
import app from '../src/app.js';
import { initializeSocketServer } from '../src/socket/index.js';
import { createLockManager } from '../src/services/lockManager.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../src/socket/socketEvents.js';

const waitForEvent = (socket, eventName) =>
  new Promise((resolve) => {
    socket.once(eventName, resolve);
  });

const emitWithAck = (socket, eventName, payload) =>
  new Promise((resolve) => {
    socket.emit(eventName, payload, resolve);
  });

describe('Socket.io Real-Time Ticket Locking & Conflict Rejection', () => {
  let httpServer;
  let ioServer;
  let testLockManager;
  let baseUrl;
  let agentA;
  let agentB;

  before(async () => {
    testLockManager = createLockManager();
    httpServer = http.createServer(app);
    ioServer = initializeSocketServer(httpServer, {
      lockManager: testLockManager,
    });

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const { port } = httpServer.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  beforeEach(async () => {
    testLockManager.clearAllLocks();

    agentA = createClient(baseUrl, { transports: ['websocket'] });
    agentB = createClient(baseUrl, { transports: ['websocket'] });

    await Promise.all([
      waitForEvent(agentA, 'connect'),
      waitForEvent(agentB, 'connect'),
    ]);

    await Promise.all([
      emitWithAck(agentA, CLIENT_EVENTS.JOIN_DASHBOARD, { agentName: 'Agent Alpha' }),
      emitWithAck(agentB, CLIENT_EVENTS.JOIN_DASHBOARD, { agentName: 'Agent Bravo' }),
    ]);
  });

  after(async () => {
    agentA?.disconnect();
    agentB?.disconnect();
    await new Promise((resolve) => ioServer.close(resolve));
  });

  it('broadcasts ticket_locked to all agents and rejects colliding agent with ALREADY_LOCKED', async () => {
    const broadcastToB = waitForEvent(agentB, SERVER_EVENTS.TICKET_LOCKED);

    const lockResA = await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, {
      ticketId: 'RD-105',
    });

    assert.equal(lockResA.ok, true);
    assert.equal(lockResA.lock.agentName, 'Agent Alpha');

    const broadcastPayload = await broadcastToB;
    assert.equal(broadcastPayload.ticketId, 'RD-105');
    assert.equal(broadcastPayload.lock.socketId, agentA.id);

    // Agent B attempts to lock the same ticket -> must receive lock_rejected
    const rejectedEventForB = waitForEvent(agentB, SERVER_EVENTS.LOCK_REJECTED);
    const lockResB = await emitWithAck(agentB, CLIENT_EVENTS.LOCK_TICKET, {
      ticketId: 'RD-105',
    });

    assert.equal(lockResB.ok, false);
    assert.equal(lockResB.code, 'ALREADY_LOCKED');
    assert.equal(lockResB.lockedBy.agentName, 'Agent Alpha');

    const rejectedPayload = await rejectedEventForB;
    assert.equal(rejectedPayload.code, 'ALREADY_LOCKED');

    agentA.disconnect();
    agentB.disconnect();
  });

  it('allows only one winner when two agents race simultaneously for the same ticket', async () => {
    const [resA, resB] = await Promise.all([
      emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-101' }),
      emitWithAck(agentB, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-101' }),
    ]);

    const winners = [resA, resB].filter((r) => r.ok);
    const losers = [resA, resB].filter((r) => !r.ok);

    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(losers[0].code, 'ALREADY_LOCKED');

    agentA.disconnect();
    agentB.disconnect();
  });

  it('blocks unauthorized unlock by non-owner and broadcasts ticket_unlocked when owner unlocks', async () => {
    await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-102' });

    // Agent B tries to steal/unlock Agent A's ticket
    const hijackAttempt = await emitWithAck(agentB, CLIENT_EVENTS.UNLOCK_TICKET, {
      ticketId: 'RD-102',
    });
    assert.equal(hijackAttempt.ok, false);
    assert.equal(hijackAttempt.code, 'NOT_OWNER');

    // Agent A unlocks -> Agent B receives broadcast
    const unlockBroadcastToB = waitForEvent(agentB, SERVER_EVENTS.TICKET_UNLOCKED);
    const unlockResA = await emitWithAck(agentA, CLIENT_EVENTS.UNLOCK_TICKET, {
      ticketId: 'RD-102',
    });

    assert.equal(unlockResA.ok, true);
    const unlockPayload = await unlockBroadcastToB;
    assert.equal(unlockPayload.ticketId, 'RD-102');
    assert.equal(unlockPayload.unlockedBy, 'Agent Alpha');

    agentA.disconnect();
    agentB.disconnect();
  });

  it('syncs existing active locks immediately to a late-joining agent', async () => {
    await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-109' });

    const agentC = createClient(baseUrl, { transports: ['websocket'] });
    await waitForEvent(agentC, 'connect');

    const syncEvent = waitForEvent(agentC, SERVER_EVENTS.LOCK_STATE_SYNC);
    await emitWithAck(agentC, CLIENT_EVENTS.JOIN_DASHBOARD, { agentName: 'Agent Charlie' });

    const syncPayload = await syncEvent;
    assert.ok(syncPayload.locks['RD-109']);
    assert.equal(syncPayload.locks['RD-109'].agentName, 'Agent Alpha');

    agentA.disconnect();
    agentB.disconnect();
    agentC.disconnect();
  });
});