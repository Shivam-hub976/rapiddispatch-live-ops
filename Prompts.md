# AI Transparency & Engineering Prompt Log — Sprint 19

This document records architectural decisions, debugging sessions, and AI-assisted problem solving throughout the development of **RapidDispatch Live Ops**.

## Day 1 — Architecture & Workspace Setup

- Planned a 3-day incremental delivery structure splitting `server/` (Express + Socket.io) and `client/` (React + Vite) inside a single monorepo for independent Render and Vercel deployments.
- Designed a dual-`Map` in-memory locking strategy (`ticketLocks` and `socketToTickets` reverse index) to achieve O(1) lock verification and O(k) Ghost Disconnect cleanup without database round-trip latency.
- Resolved React Strict Mode double-connection behavior by extracting `socket.io-client` into a module-level singleton (`client/src/socket/socketClient.js`) with `autoConnect: false`, and pairing every `socket.on()` with `socket.off()` in `useEffect` cleanup.
- Used `sessionStorage` for tab-scoped agent identity so dual-window concurrency testing natively simulates distinct agents without cross-tab overwrites.
