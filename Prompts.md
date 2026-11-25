# AI Transparency & Engineering Prompt Log — Sprint 19

This document records architectural decisions, debugging sessions, and AI-assisted problem solving throughout the development of **RapidDispatch Live Ops**.

## Architecture & Workspace Setup

- Planned a 3-day incremental delivery structure splitting `server/` (Express + Socket.io) and `client/` (React + Vite) inside a single monorepo for independent Render and Vercel deployments.
- Designed a dual-`Map` in-memory locking strategy (`ticketLocks` and `socketToTickets` reverse index) to achieve O(1) lock verification and O(k) Ghost Disconnect cleanup without database round-trip latency.
- Resolved React Strict Mode double-connection behavior by extracting `socket.io-client` into a module-level singleton (`client/src/socket/socketClient.js`) with `autoConnect: false`, and pairing every `socket.on()` with `socket.off()` in `useEffect` cleanup.
- Used `sessionStorage` for tab-scoped agent identity so dual-window concurrency testing natively simulates distinct agents without cross-tab overwrites.

## In-Memory Locking, Conflict Rejection & Live Ops UI

- Implemented `server/src/services/lockManager.js` with dual synchronized `Map` structures (`ticketLocks` + `socketToTickets`) and proved atomic concurrency under `Promise.all` dual-socket races using Node's built-in test runner.
- Caught and fixed an XSS sanitization edge case via integration tests: stripping only `<script>` tags left inner payload text (`alert(1)`) behind; upgraded `sanitize.js` with `DANGEROUS_BLOCK_REGEX` to strip full `<script>`/`<style>` blocks before stripping remaining tags.
- Prevented unnecessary React re-renders across the ticket grid by wrapping `TicketCard` in `React.memo`, passing only the individual `lock` slice per card, and stabilizing socket handlers via `useCallback`.

## Ghost Disconnect Recovery, Network Resilience & QA

- Implemented `socket.on('disconnect')` lock cleanup using `lockManager.releaseAllBySocket(socket.id)` (O(k) reverse-index lookup) and tuned Socket.io heartbeats (`pingInterval: 5000`, `pingTimeout: 4000`) to detect silent network drops quickly.
- Added a `pagehide` listener in `client/src/socket/socketClient.js` to dispatch an immediate WebSocket close frame on tab close (unlocking peers in < 1 second) instead of `beforeunload`, preserving browser bfcache compatibility for Lighthouse.
- Debugged a reconnection state-sync gap where tickets did not auto-refresh after an initial server outage or rapid DevTools offline/online toggle; resolved using `ticketsCountRef`, `hasTicketErrorRef`, and `isLoadingTicketsRef` guards inside `handleConnect` and `handleBrowserOnline`.
- Verified all 16 automated server tests, clean ESLint + Vite production build, WebSocket `101 Switching Protocols` upgrade, and 6 dual-window end-to-end concurrency scenarios.
