import http from 'node:http';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { io as createClient } from 'socket.io-client';
import app from '../src/app.js';
import { initializeSocketServer } from '../src/socket/index.js';
import lockManager from '../src/services/lockManager.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../src/socket/socketEvents.js';

const emitWithAck = (socket, event, payload) =>
  new Promise((resolve) => {
    socket.emit(event, payload, (response) => resolve(response));
  });

const waitForEvent = (socket, event, timeoutMs = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event "${event}"`));
    }, timeoutMs);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

describe('Socket.io Lock-Verified Ticket Resolution & Sanitization', () => {
  let httpServer;
  let ioServer;
  let serverUrl;
  let clients = [];

  const connectAgent = async (agentName) => {
    const client = createClient(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
    });
    clients.push(client);

    await waitForEvent(client, 'connect');
    await emitWithAck(client, CLIENT_EVENTS.JOIN_DASHBOARD, { agentName });
    return client;
  };

  beforeEach(async () => {
    lockManager.clearAllLocks();
    httpServer = http.createServer(app);
    ioServer = initializeSocketServer(httpServer);
    app.set('io', ioServer);

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });

    const { port } = httpServer.address();
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect();
    }
    clients = [];
    lockManager.clearAllLocks();

    await new Promise((resolve) => ioServer.close(resolve));
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  it('rejects empty or HTML-only resolution notes', async () => {
    const agentA = await connectAgent('Agent Sarah');
    await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-103' });

    const emptyRes = await emitWithAck(agentA, CLIENT_EVENTS.RESOLVE_TICKET, {
      ticketId: 'RD-103',
      resolutionNote: '   ',
    });
    assert.equal(emptyRes.ok, false);
    assert.equal(emptyRes.code, 'INVALID_RESOLUTION_NOTE');

    const xssRes = await emitWithAck(agentA, CLIENT_EVENTS.RESOLVE_TICKET, {
      ticketId: 'RD-103',
      resolutionNote: '<script>alert(1)</script>',
    });
    assert.equal(xssRes.ok, false);
    assert.equal(xssRes.code, 'INVALID_RESOLUTION_NOTE');
  });

  it('blocks an agent who does not hold the lock from resolving a ticket', async () => {
    const agentA = await connectAgent('Agent Sarah');
    const agentB = await connectAgent('Agent Marcus');

    // Attempt to resolve unlocked ticket -> blocked
    const unlockedAttempt = await emitWithAck(agentB, CLIENT_EVENTS.RESOLVE_TICKET, {
      ticketId: 'RD-104',
      resolutionNote: 'Confirmed ELD telemetry restored near El Paso.',
    });
    assert.equal(unlockedAttempt.ok, false);
    assert.equal(unlockedAttempt.code, 'LOCK_REQUIRED');

    // Agent A locks RD-104, Agent B tries to resolve it -> blocked
    await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-104' });

    const hijackAttempt = await emitWithAck(agentB, CLIENT_EVENTS.RESOLVE_TICKET, {
      ticketId: 'RD-104',
      resolutionNote: 'Unauthorized overwrite attempt by Agent B.',
    });
    assert.equal(hijackAttempt.ok, false);
    assert.equal(hijackAttempt.code, 'NOT_LOCK_OWNER');
    assert.equal(lockManager.isLockedBy('RD-104', agentA.id), true);
  });

  it('sanitizes note, persists resolution, releases lock, broadcasts, and blocks re-locking', async () => {
    const agentA = await connectAgent('Agent Sarah');
    const agentB = await connectAgent('Agent Marcus');

    await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-105' });

    const resolvedBroadcastB = waitForEvent(agentB, SERVER_EVENTS.TICKET_RESOLVED);

    const resolveRes = await emitWithAck(agentA, CLIENT_EVENTS.RESOLVE_TICKET, {
      ticketId: 'RD-105',
      resolutionNote: '<b>Dispatched</b> relay tractor #TX-404 to Mile 338 on I-35 South.',
    });

    const broadcast = await resolvedBroadcastB;

    assert.equal(resolveRes.ok, true);
    assert.equal(resolveRes.ticket.status, 'resolved');
    assert.equal(
      resolveRes.ticket.resolutionNote,
      'Dispatched relay tractor #TX-404 to Mile 338 on I-35 South.'
    );
    assert.equal(resolveRes.ticket.resolvedBy, 'Agent Sarah');
    assert.equal(lockManager.getLock('RD-105'), null);

    // Agent B received the real-time resolution broadcast with lock cleared
    assert.equal(broadcast.ticketId, 'RD-105');
    assert.equal(broadcast.ticket.status, 'resolved');
    assert.equal(broadcast.locks['RD-105'], undefined);

    // Attempting to lock an already-resolved ticket is rejected
    const relockRes = await emitWithAck(agentB, CLIENT_EVENTS.LOCK_TICKET, {
      ticketId: 'RD-105',
    });
    assert.equal(relockRes.ok, false);
    assert.equal(relockRes.code, 'TICKET_ALREADY_RESOLVED');
  });
});