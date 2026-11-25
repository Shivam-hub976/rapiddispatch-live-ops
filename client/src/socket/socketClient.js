import { io } from 'socket.io-client';

const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
).replace(/\/+$/, '');

// Module-level singleton prevents duplicate sockets under React Strict Mode
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// Send an immediate clean close frame on tab close/unload (bfcache & Lighthouse safe)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (socket.connected) {
      socket.disconnect();
    }
  });
}