# RapidDispatch Live Ops — Real-Time Collaborative Helpdesk

Real-time freight support helpdesk engineered to eliminate agent ticket collisions using WebSockets (`Socket.io`), O(1) in-memory lock tracking, and automated Ghost Disconnect recovery.

## Architecture

- **Backend (`server/`):** Node.js, Express, Socket.io, Mongoose (MongoDB Atlas)
- **Frontend (`client/`):** React, Vite, Tailwind CSS v4, Socket.io Client
- **Concurrency Engine:** Dual in-memory `Map` lock manager with automatic disconnect release

## Status

- [ ] Day 1: Express + Socket.io integration & client handshake
- [ ] Day 2: In-memory lock engine, conflict rejection & Live Ops UI
- [ ] Day 3: Ghost Disconnect handler, Lighthouse 100 audit & WSS deployment
