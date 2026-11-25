# RapidDispatch Live Ops — Real-Time Collaborative Helpdesk

**RapidDispatch Live Ops** is a high-concurrency, real-time collaborative dispatch desk built for **RapidDispatch Freight & Logistics (Dallas, TX)**. It eliminates agent ticket collisions and duplicate resolutions through an atomic in-memory WebSocket locking engine, server-verified ownership guards, and automatic **Ghost Disconnect** recovery.

---

## Live Deployment

| Service                     | Platform               | Live Endpoint                                                 |
| :-------------------------- | :--------------------- | :------------------------------------------------------------ |
| **Frontend Dashboard**      | Vercel (HTTPS / WSS)   | `https://rapiddispatch-live-ops-theta.vercel.app`             |
| **Backend API & Socket.io** | Render (Node.js)       | `https://rapiddispatch-live-ops-api.onrender.com`             |
| **Health & Lock Telemetry** | Render                 | `https://rapiddispatch-live-ops-api.onrender.com/api/health`  |
| **Freight Tickets API**     | Render + MongoDB Atlas | `https://rapiddispatch-live-ops-api.onrender.com/api/tickets` |

> **Note on Render Free Tier:** The backend service spins down after 15 minutes of inactivity. Opening `/api/health` wakes the Node.js instance in ~30 seconds before running live dual-window demos.

---

## Core Engineering Problem & Solution

In fast-moving freight operations, multiple dispatchers often open the same urgent shipment ticket simultaneously—leading to conflicting carrier dispatches, overwritten resolution notes, and orphaned locks when a browser crashes or Wi-Fi drops.

RapidDispatch Live Ops solves this at every layer of the stack:

1. **Zero-Latency Exclusive Locking:** Ticket locks live in a dual-indexed RAM engine (`Map`) rather than incurring database write round-trips on every click.
2. **Guaranteed Single-Winner Concurrency:** Simultaneous lock requests from multiple agents resolve atomically on Node.js's single-threaded event loop; colliding agents receive a targeted `lock_rejected` notification while all connected clients receive instant broadcast updates.
3. **Automatic Ghost Disconnect Recovery:** If an agent closes their browser tab, loses Wi-Fi, or suffers a crash while holding one or more locks, the server automatically releases _only_ that socket's tickets and broadcasts the unlocked state to every remaining dispatcher within seconds.
4. **Defense-in-Depth Resolution Security:** Both WebSocket (`resolve_ticket`) and REST (`PATCH /api/tickets/:ticketId/resolve`) routes pass through a single server-side `resolutionService` that enforces active lock ownership, prevents double submissions, and strips XSS/HTML payloads before persisting to MongoDB Atlas.

---

## Architecture & Concurrency Deep Dive

### 1. Dual-Map In-Memory Lock Engine (`server/src/services/lockManager.js`)

Instead of scanning every active ticket on disconnect, `lockManager` maintains two synchronized JavaScript `Map` structures in RAM:

- **`ticketLocks` (`Map<ticketId, LockRecord>`):** Provides **$O(1)$** lock lookups, collision checks, and ownership verification.
- **`socketToTickets` (`Map<socketId, Set<ticketId>>`):** Reverse index mapping each connected socket to its owned ticket IDs, enabling **$O(k)$** cleanup on disconnect (where $k$ is the number of tickets held by that specific agent) with zero orphaned memory entries.

### 2. Race-Condition Safeguards (`server/src/socket/index.js`)

- **Fast Pre-Check + Atomic Post-Await Lock:** `lock_ticket` performs an immediate synchronous RAM check before querying MongoDB, then re-acquires the lock atomically after `await getTicketById(ticketId)`.
- **Mid-Flight Disconnect Guard (`if (!socket.connected)`):** Checks socket liveness immediately after the async database lookup so a client that drops mid-query can never create a zombie lock.
- **In-Flight Resolution Guard (`resolvingTickets` Set):** Blocks concurrent duplicate writes if an agent double-clicks **Submit Resolution** while MongoDB persistence is in progress.

### 3. Ghost Disconnect & Heartbeat Tuning

- **Server Heartbeats:** Tuned Socket.io `pingInterval: 5000` (5s) and `pingTimeout: 4000` (4s) to detect silent network failures dramatically faster than Socket.io's 45-second default.
- **Client `pagehide` Close Signal (`client/src/socket/socketClient.js`):** Emits an immediate WebSocket close frame when a tab closes or reloads, unlocking peers in **< 1 second**. Uses `pagehide` rather than `beforeunload` to preserve browser back/forward cache (`bfcache`) compatibility for Lighthouse.
- **Server `disconnect` Handler:** Executes `lockManager.releaseAllBySocket(socket.id)` and broadcasts `tickets_released` along with a synchronized lock snapshot to all active dispatchers.

### 4. Dual-Layer Input Sanitization

Both `client/src/utils/validation.js` and `server/src/utils/sanitize.js` enforce identical validation rules:

- Strips full `<script>...</script>` and `<style>...</style>` blocks (tags **and** inner payloads) using `DANGEROUS_BLOCK_REGEX` before removing remaining HTML tags.
- Normalizes line breaks/whitespace and enforces strict `5–1500` plain-text character bounds on resolution notes.
- Validates ticket IDs against `/^RD-\d{3,6}$/` and sanitizes agent display names (`2–50` characters).

### 5. Frontend Performance, Resilience & Accessibility

- **Render Isolation:** `TicketCard` is wrapped in `React.memo` and receives only its individual `lock` object plus `useCallback`-stabilized handlers—locking `RD-105` re-renders only `RD-105` instead of the full queue.
- **Tab-Scoped Agent Identity:** Stored in `sessionStorage` (`rd_agent_name`) so side-by-side windows can operate independently as distinct dispatchers (`Agent Sarah`, `Agent Marcus`).
- **Network Resilience:** Includes `ConnectionBanner`, `ErrorBoundary`, `8000ms` Socket.io ACK timeouts (`socket.timeout()`), browser `online`/`offline` listeners, and automatic post-reconnect state resynchronization (`lock_state_sync` + silent queue refresh).
- **Lighthouse 100 Standards:** High-contrast WCAG AA/AAA palette, accessible dialog semantics (`role="dialog"`, `aria-modal`, `Escape` close, body scroll lock), `role="group"` + `aria-pressed` filter controls, semantic landmarks (`<header>`, `<main>`, `<footer>`), and `robots.txt`.

---

## Tech Stack

| Layer            | Technologies                                                                                                     |
| :--------------- | :--------------------------------------------------------------------------------------------------------------- |
| **Frontend**     | React 19, Vite, Tailwind CSS v4, Socket.io Client, Lucide React                                                  |
| **Backend**      | Node.js (ESM), Express.js, Socket.io, Mongoose                                                                   |
| **Database**     | MongoDB Atlas (M0 Cloud Cluster) with automatic in-memory fallback                                               |
| **Testing & QA** | Node.js Native Test Runner (`node --test`), `socket.io-client`, ESLint 9 (React Hooks strict), Chrome Lighthouse |
| **Deployment**   | Vercel (Frontend SPA + Security Headers) & Render (Persistent WebSocket Server)                                  |

---

## Project Structure

```text
rapiddispatch-live-ops/
├── README.md
├── PROMPTS.md
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── server.js                  # HTTP server bootstrap, MongoDB connect & graceful shutdown
│   │   ├── app.js                     # Express app, dynamic CORS, /api/health telemetry & error handlers
│   │   ├── routes/
│   │   │   └── ticketRoutes.js        # GET /api/tickets, GET /:ticketId, PATCH /:ticketId/resolve
│   │   ├── services/
│   │   │   ├── lockManager.js         # O(1) / O(k) dual-Map in-memory locking engine
│   │   │   ├── ticketStore.js         # MongoDB Atlas persistence + seed data + memory fallback
│   │   │   └── resolutionService.js   # Shared lock-verified resolution & double-submit guard
│   │   ├── socket/
│   │   │   ├── index.js               # Socket.io server, lock/unlock/resolve & Ghost Disconnect handler
│   │   │   └── socketEvents.js        # Centralized WebSocket event constants & dashboard room
│   │   └── utils/
│   │       └── sanitize.js            # XSS/script-block stripping, ticket ID & agent validation
│   └── tests/
│       ├── lockManager.test.js        # 6 unit tests for dual-Map lock/unlock/release semantics
│       ├── socketLocking.test.js      # 4 integration tests for races, conflicts & late-joiner sync
│       ├── socketResolution.test.js   # 3 integration tests for ownership guards & XSS rejection
│       └── ghostDisconnect.test.js    # 3 integration tests for abrupt single/multi-ticket drops
└── client/
    ├── package.json
    ├── vercel.json                    # SPA rewrites & baseline security headers
    ├── public/
    │   └── robots.txt                 # Search crawler directives for SEO 100
    └── src/
        ├── main.jsx                   # React root wrapped in ErrorBoundary
        ├── App.jsx                    # Socket lifecycle, reconnection resync & derived KPI state
        ├── socket/
        │   ├── socketClient.js        # Singleton Socket.io client + bfcache-safe pagehide close
        │   └── socketEvents.js        # Mirrored client/server event contract
        ├── services/
        │   └── ticketApi.js           # AbortController-protected REST fetcher
        ├── utils/
        │   └── validation.js          # Client-side resolution sanitizer & length validator
        └── components/
            ├── Header.jsx             # Live sync badge, online agent counter & tab identity editor
            ├── ConnectionBanner.jsx   # Offline/reconnecting alert with manual Reconnect trigger
            ├── MetricsBar.jsx         # Live KPI counters (Total, Available, Locked, Resolved)
            ├── FilterBar.jsx          # Accessible status group, search, priority filter & refresh
            ├── TicketCard.jsx         # React.memo 4-state card (Available/Mine/Other/Resolved)
            ├── ResolutionModal.jsx    # Accessible workspace dialog + quick dispatch notes
            ├── ToastBanner.jsx        # ARIA live notification stack
            └── ErrorBoundary.jsx      # Runtime UI crash recovery screen
```

---

## Real-Time WebSocket Contract (`Socket.io`)

### Client -> Server Events

| Event            | Payload                                   | Behavior & Acknowledgement                                                                                                                                |
| :--------------- | :---------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join_dashboard` | `{ agentName }`                           | Registers agent in `live-ops-dashboard`, emits full `lock_state_sync`, and broadcasts updated online roster.                                              |
| `lock_ticket`    | `{ ticketId }`                            | Validates ticket exists & is open, checks `socket.connected`, atomically acquires RAM lock, broadcasts `ticket_locked` or emits targeted `lock_rejected`. |
| `unlock_ticket`  | `{ ticketId }`                            | Verifies caller owns the lock, releases it in $O(1)$, and broadcasts `ticket_unlocked`.                                                                   |
| `resolve_ticket` | `{ ticketId, resolutionNote, agentName }` | Verifies lock ownership + sanitizes note, persists to MongoDB, releases lock, and broadcasts `ticket_resolved`.                                           |

### Server -> Client Events

| Event                   | Scope                       | Purpose                                                                                                          |
| :---------------------- | :-------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `dashboard_joined`      | Requesting socket           | Confirms session `socketId`, normalized `agentName`, and current `locks`.                                        |
| `lock_state_sync`       | Requesting socket           | Syncs complete active lock map immediately to newly joined or reconnected agents.                                |
| `active_agents_updated` | Room (`live-ops-dashboard`) | Updates online dispatcher count and roster across all connected tabs.                                            |
| `ticket_locked`         | Global (`io.emit`)          | Marks a ticket card as locked in real time across all dashboards.                                                |
| `ticket_unlocked`       | Global (`io.emit`)          | Returns a voluntarily released ticket to **Available to Claim**.                                                 |
| `lock_rejected`         | Requesting socket only      | Notifies only the colliding agent with conflict details (`ALREADY_LOCKED`, `TICKET_ALREADY_RESOLVED`, etc.).     |
| `ticket_resolved`       | Global (`io.emit`)          | Updates the ticket to `resolved`, displays the sanitized resolution note, and clears the lock.                   |
| `tickets_released`      | Global (`io.emit`)          | Triggered by Ghost Disconnect; unlocks all tickets held by the dropped socket and displays an auto-unlock toast. |

---

## REST API Reference

| Method  | Endpoint                         | Description                                                                                                                                                                        |
| :------ | :------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/health`                    | Returns server status, persistence mode (`mongodb-atlas` or `in-memory-fallback`), Socket.io readiness, active connection count, and live `activeLocks` telemetry.                 |
| `GET`   | `/api/tickets`                   | Lists all freight dispatch tickets sorted by ticket ID.                                                                                                                            |
| `GET`   | `/api/tickets/:ticketId`         | Fetches a single freight ticket by ID (e.g., `RD-105`).                                                                                                                            |
| `PATCH` | `/api/tickets/:ticketId/resolve` | Lock-verified resolution endpoint requiring `{ socketId, resolutionNote, agentName }`. Returns `409 LOCK_REQUIRED` if unlocked or `403 NOT_LOCK_OWNER` if locked by another agent. |

---

## Local Development Setup

### Prerequisites

- **Node.js** `v18+` (for native `node --test` runner)
- **MongoDB Atlas** connection string _(optional — server automatically falls back to in-memory seed data if `MONGODB_URI` is omitted)_

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/rapiddispatch-live-ops.git
cd rapiddispatch-live-ops
```

### 2. Configure & Start the Backend (`server/`)

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173,http://localhost:4173
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rapiddispatch?retryWrites=true&w=majority
```

Start the backend in watch mode:

```bash
npm run dev
```

### 3. Configure & Start the Frontend (`client/`)

Open a second terminal:

```bash
cd client
npm install
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

Start the Vite dev server:

```bash
npm run dev
```

Open **`http://localhost:5173`** in two side-by-side browser windows to test real-time concurrency locally.

---

## Automated Testing & Verification

### Backend Automated Test Suite (16 Tests / 4 Suites)

```bash
cd server
npm test
```

- **`lockManager.test.js` (6 tests):** Lock acquisition, collision rejection, idempotent owner re-lock, unauthorized unlock denial, reverse-index cleanup, and isolated multi-lock disconnect release.
- **`socketLocking.test.js` (4 tests):** Real-time broadcasts, simultaneous `Promise.all` dual-agent lock race, unauthorized unlock blocking, and late-joiner `lock_state_sync`.
- **`socketResolution.test.js` (3 tests):** Empty & `<script>` XSS rejection, lock-ownership enforcement (`LOCK_REQUIRED`, `NOT_LOCK_OWNER`), sanitized persistence, broadcast, and post-resolution re-lock prevention.
- **`ghostDisconnect.test.js` (3 tests):** Single-ticket abrupt disconnect + immediate peer re-claim, multi-ticket disconnect isolation from other agents' locks, and zero-lock disconnect silence.

### Frontend Lint, Production Build & Local Preview

```bash
cd client
npm run lint     # Strict ESLint 9 + React 19 hooks verification (0 errors)
npm run build    # Production Vite + Tailwind CSS v4 bundle
npm run preview  # Serve production build at http://localhost:4173 for Lighthouse audits
```

---

## Dual-Window Concurrency QA Matrix

| #   | Scenario                    | Verification                                                                                                                                                            |
| :-- | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **WebSocket Upgrade**       | DevTools -> Network -> WS confirms `101 Switching Protocols` (`ws://` locally, `wss://` in production).                                                                 |
| 2   | **Instant Lock Sync**       | Window 1 (`Agent Sarah`) locks `RD-105`; Window 2 (`Agent Marcus`) immediately turns amber and disables claiming.                                                       |
| 3   | **Late-Joiner Sync**        | Opening a 3rd tab while `RD-105` is locked immediately renders the active lock via `lock_state_sync`.                                                                   |
| 4   | **Ghost Disconnect**        | Closing Window 1 abruptly (`Ctrl + W`) without unlocking automatically releases all of Sarah's locks in Window 2 in `< 1s` and logs `[Ghost Disconnect] Auto-released`. |
| 5   | **Zero Memory Leaks**       | After disconnect/release, `GET /api/health` confirms `activeLocks: { lockedTicketCount: 0, activeLockHolders: 0 }`.                                                     |
| 6   | **Network Outage Recovery** | Stopping/restarting the server triggers `ConnectionBanner`, pauses mutations, and auto-resyncs both queue tickets and RAM locks on reconnect.                           |

---

## Production Deployment Summary

1. **Render (Backend):** Deploy `server/` as a Web Service (`npm install` / `npm start`) with `NODE_ENV=production`, `MONGODB_URI`, and `CLIENT_URL=https://<your-vercel-app>.vercel.app`. Ensure MongoDB Atlas Network Access permits Render outbound connections (`0.0.0.0/0`).
2. **Vercel (Frontend):** Deploy `client/` as a Vite project (`npm run build`, output `dist`) with `VITE_API_URL` and `VITE_SOCKET_URL` pointing to `https://rapiddispatch-live-ops-api.onrender.com` (no trailing slash).
3. **CORS Sync:** Update `CLIENT_URL` on Render with your live Vercel URL so both Express REST and Socket.io WSS handshakes succeed cleanly with zero CORS warnings.

---

## Author

**Shivam Kumar**  
Built for **Sprint 19: RapidDispatch Live Ops**
