import http from 'node:http';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { io as createClient } from 'socket.io-client';
import app from '../src/app.js';
import { initializeSocketServer } from '../src/socket/index.js';
import { createLockManager } from '../src/services/lockManager.js';
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

describe('Ghost Disconnect Automatic Lock Recovery', () => {
  let httpServer;
  let ioServer;
  let testLockManager;
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
    testLockManager = createLockManager();
    httpServer = http.createServer(app);
    ioServer = initializeSocketServer(httpServer, {
      lockManager: testLockManager,
    });

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });

    const { port } = httpServer.address();
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const client of clients) {
      if (client.connected) client.disconnect();
    }
    clients = [];
    testLockManager.clearAllLocks();

    await new Promise((resolve) => ioServer.close(resolve));
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  it('auto-unlocks RD-105 when Agent A drops abruptly and lets Agent B claim it immediately', async () => {
    const agentA = await connectAgent('Agent Sarah');
    const agentB = await connectAgent('Agent Marcus');

    // Agent A locks RD-105
    const lockA = await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, {
      ticketId: 'RD-105',
    });
    assert.equal(lockA.ok, true);

    // Prepare Agent B to listen for the automatic Ghost Disconnect broadcast
    const releasedPromise = waitForEvent(agentB, SERVER_EVENTS.TICKETS_RELEASED);

    // Simulate abrupt tab close / network drop by disconnecting without sending unlock_ticket
    agentA.disconnect();

    const releasePayload = await releasedPromise;
    assert.deepEqual(releasePayload.releasedTicketIds, ['RD-105']);
    assert.equal(releasePayload.agentName, 'Agent Sarah');
    assert.equal(releasePayload.locks['RD-105'], undefined);
    assert.equal(testLockManager.getLock('RD-105'), null);

    // Agent B can now claim RD-105 immediately without errors
    const lockB = await emitWithAck(agentB, CLIENT_EVENTS.LOCK_TICKET, {
      ticketId: 'RD-105',
    });
    assert.equal(lockB.ok, true);
    assert.equal(lockB.lock.agentName, 'Agent Marcus');
  });

  it('releases multiple tickets held by a dropped agent without affecting other agents locks', async () => {
    const agentA = await connectAgent('Agent Sarah');
    const agentB = await connectAgent('Agent Marcus');

    await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-101' });
    await emitWithAck(agentA, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-105' });
    await emitWithAck(agentB, CLIENT_EVENTS.LOCK_TICKET, { ticketId: 'RD-109' });

    const releasedPromise = waitForEvent(agentB, SERVER_EVENTS.TICKETS_RELEASED);

    // Abruptly disconnect Agent A
    agentA.disconnect();

    const releasePayload = await releasedPromise;
    assert.equal(releasePayload.releasedTicketIds.length, 2);
    assert.ok(releasePayload.releasedTicketIds.includes('RD-101'));
    assert.ok(releasePayload.releasedTicketIds.includes('RD-105'));

    // Agent B's lock on RD-109 must remain completely untouched
    assert.ok(releasePayload.locks['RD-109']);
    assert.equal(testLockManager.isLockedBy('RD-109', agentB.id), true);
    assert.deepEqual(testLockManager.getStats(), {
      lockedTicketCount: 1,
      activeLockHolders: 1,
    });
  });

  it('does not broadcast tickets_released when a disconnected agent held zero locks', async () => {
    const agentA = await connectAgent('Agent Sarah');
    const agentB = await connectAgent('Agent Marcus');

    let spuriousBroadcast = false;
    agentB.on(SERVER_EVENTS.TICKETS_RELEASED, () => {
      spuriousBroadcast = true;
    });

    const agentsUpdatedPromise = waitForEvent(
      agentB,
      SERVER_EVENTS.ACTIVE_AGENTS_UPDATED
    );

    agentA.disconnect();
    const agentsUpdate = await agentsUpdatedPromise;

    assert.equal(agentsUpdate.count, 1);
    assert.equal(spuriousBroadcast, false);
  });
});