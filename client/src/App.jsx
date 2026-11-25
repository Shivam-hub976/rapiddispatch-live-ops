import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { socket } from "./socket/socketClient";
import { CLIENT_EVENTS, SERVER_EVENTS } from "./socket/socketEvents";
import { fetchTickets } from "./services/ticketApi";
import Header from "./components/Header";
import ConnectionBanner from "./components/ConnectionBanner";
import MetricsBar from "./components/MetricsBar";
import FilterBar from "./components/FilterBar";
import TicketCard from "./components/TicketCard";
import ResolutionModal from "./components/ResolutionModal";
import ToastBanner from "./components/ToastBanner";

const SOCKET_ACK_TIMEOUT_MS = 8000;

const getInitialTabAgentName = () => {
  const existing = sessionStorage.getItem("rd_agent_name");
  if (existing) return existing;

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const generated = `Dispatcher-${suffix}`;
  sessionStorage.setItem("rd_agent_name", generated);
  return generated;
};

export default function App() {
  const [agentName, setAgentName] = useState(getInitialTabAgentName);
  const agentNameRef = useRef(agentName);
  const hasConnectedOnceRef = useRef(false);
  const ticketsCountRef = useRef(0);
  const hasTicketErrorRef = useRef(false);
  const isLoadingTicketsRef = useRef(false);

  const [connectionStatus, setConnectionStatus] = useState(() =>
    typeof navigator !== "undefined" && !navigator.onLine
      ? "offline"
      : "connecting",
  );
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [socketId, setSocketId] = useState("");
  const [activeAgents, setActiveAgents] = useState([]);

  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketError, setTicketError] = useState("");

  // In-memory mirrored lock state: { [ticketId]: { ticketId, socketId, agentName, lockedAt } }
  const [locks, setLocks] = useState({});
  const [pendingTicketIds, setPendingTicketIds] = useState({});

  // Resolution workspace modal state
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Keep refs synchronized outside render (React 19 strict-hook compliant)
  useEffect(() => {
    agentNameRef.current = agentName;
    ticketsCountRef.current = tickets.length;
    hasTicketErrorRef.current = Boolean(ticketError);
  }, [agentName, tickets.length, ticketError]);

  const addToast = useCallback((message, tone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const loadTickets = useCallback(async ({ silent = false } = {}) => {
    isLoadingTicketsRef.current = true;
    if (!silent) {
      setLoadingTickets(true);
    }
    setTicketError("");
    try {
      const data = await fetchTickets();
      setTickets(data);
    } catch (error) {
      setTicketError(error.message || "Unable to load freight tickets.");
    } finally {
      isLoadingTicketsRef.current = false;
      if (!silent) {
        setLoadingTickets(false);
      }
    }
  }, []);

  // Initial queue fetch on mount (all setState calls happen asynchronously)
  useEffect(() => {
    let isCancelled = false;
    isLoadingTicketsRef.current = true;

    fetchTickets()
      .then((data) => {
        if (!isCancelled) {
          setTickets(data);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setTicketError(error.message || "Unable to load freight tickets.");
        }
      })
      .finally(() => {
        isLoadingTicketsRef.current = false;
        if (!isCancelled) {
          setLoadingTickets(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Mount Socket.io & browser network listeners cleanly (Strict Mode safe)
  useEffect(() => {
    let isActive = true;

    const emitJoin = () => {
      socket.emit(CLIENT_EVENTS.JOIN_DASHBOARD, {
        agentName: agentNameRef.current,
      });
    };

    const handleConnect = () => {
      const isReconnect = hasConnectedOnceRef.current;
      hasConnectedOnceRef.current = true;

      setConnectionStatus("connected");
      setReconnectAttempt(0);
      setSocketId(socket.id || "");
      emitJoin();

      // Auto-refresh tickets on reconnect, after an initial load error, or if queue is empty
      const needsRefresh =
        isReconnect ||
        ticketsCountRef.current === 0 ||
        hasTicketErrorRef.current;

      if (needsRefresh && !isLoadingTicketsRef.current) {
        loadTickets({ silent: ticketsCountRef.current > 0 });
      }

      if (isReconnect) {
        addToast(
          "Live Ops connection restored — queue and lock states resynchronized.",
          "success",
        );
      }
    };

    const handleDisconnect = () => {
      setConnectionStatus(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "disconnected",
      );
      setSocketId("");
      // Prevent buttons from staying stuck if an ACK dropped mid-disconnect
      setPendingTicketIds({});
      setIsSubmittingResolution(false);
    };

    const handleConnectError = () => {
      setConnectionStatus(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "error",
      );
    };

    const handleReconnectAttempt = (attemptNumber) => {
      setReconnectAttempt(attemptNumber);
      setConnectionStatus(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "reconnecting",
      );
    };

    const handleReconnectFailed = () => {
      setConnectionStatus("failed");
      addToast(
        'Automatic reconnection paused. Click "Reconnect Now" when ready.',
        "error",
      );
    };

    const handleBrowserOffline = () => {
      setConnectionStatus("offline");
      setPendingTicketIds({});
      setIsSubmittingResolution(false);
    };

    const handleBrowserOnline = () => {
      if (socket.connected) {
        setConnectionStatus("connected");
        setReconnectAttempt(0);
        emitJoin();
        if (!isLoadingTicketsRef.current) {
          loadTickets({ silent: ticketsCountRef.current > 0 });
        }
        addToast("Back online — Live Ops synchronized.", "success");
      } else {
        setConnectionStatus("reconnecting");
        socket.connect();
      }
    };

    const handleDashboardJoined = (payload) => {
      if (payload?.socketId) setSocketId(payload.socketId);
      if (payload?.locks && typeof payload.locks === "object") {
        setLocks(payload.locks);
      }
    };

    const handleLockStateSync = (payload) => {
      if (payload?.locks && typeof payload.locks === "object") {
        setLocks(payload.locks);
      }
    };

    const handleActiveAgentsUpdated = (payload) => {
      if (Array.isArray(payload?.agents)) {
        setActiveAgents(payload.agents);
      }
    };

    const handleTicketLocked = (payload) => {
      if (!payload?.ticketId || !payload?.lock) return;
      setLocks((prev) => ({
        ...prev,
        [payload.ticketId]: payload.lock,
      }));
    };

    const handleTicketUnlocked = (payload) => {
      if (!payload?.ticketId) return;
      setLocks((prev) => {
        if (!prev[payload.ticketId]) return prev;
        const next = { ...prev };
        delete next[payload.ticketId];
        return next;
      });
    };

    const handleTicketsReleased = (payload) => {
      if (payload?.locks && typeof payload.locks === "object") {
        setLocks(payload.locks);
      } else if (Array.isArray(payload?.releasedTicketIds)) {
        setLocks((prev) => {
          const next = { ...prev };
          for (const ticketId of payload.releasedTicketIds) {
            delete next[ticketId];
          }
          return next;
        });
      }

      if (payload?.releasedTicketIds?.length) {
        addToast(
          `Auto-unlocked ${payload.releasedTicketIds.join(", ")} after ${
            payload.agentName || "an agent"
          } disconnected.`,
          "info",
        );
      }
    };

    const handleLockRejected = (payload) => {
      if (payload?.ticketId && payload?.lockedBy) {
        setLocks((prev) => ({
          ...prev,
          [payload.ticketId]: payload.lockedBy,
        }));
      }
      if (payload?.message) {
        addToast(payload.message, "warning");
      }
    };

    const handleTicketResolved = (payload) => {
      if (payload?.ticket) {
        setTickets((prev) =>
          prev.map((item) =>
            item.ticketId === payload.ticket.ticketId ? payload.ticket : item,
          ),
        );
      }

      if (payload?.locks && typeof payload.locks === "object") {
        setLocks(payload.locks);
      } else if (payload?.ticketId) {
        setLocks((prev) => {
          const next = { ...prev };
          delete next[payload.ticketId];
          return next;
        });
      }

      if (payload?.ticketId) {
        setActiveTicketId((current) =>
          current === payload.ticketId ? null : current,
        );
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect_failed", handleReconnectFailed);
    socket.on(SERVER_EVENTS.DASHBOARD_JOINED, handleDashboardJoined);
    socket.on(SERVER_EVENTS.LOCK_STATE_SYNC, handleLockStateSync);
    socket.on(SERVER_EVENTS.ACTIVE_AGENTS_UPDATED, handleActiveAgentsUpdated);
    socket.on(SERVER_EVENTS.TICKET_LOCKED, handleTicketLocked);
    socket.on(SERVER_EVENTS.TICKET_UNLOCKED, handleTicketUnlocked);
    socket.on(SERVER_EVENTS.TICKETS_RELEASED, handleTicketsReleased);
    socket.on(SERVER_EVENTS.LOCK_REJECTED, handleLockRejected);
    socket.on(SERVER_EVENTS.TICKET_RESOLVED, handleTicketResolved);

    window.addEventListener("offline", handleBrowserOffline);
    window.addEventListener("online", handleBrowserOnline);

    if (socket.connected) {
      queueMicrotask(() => {
        if (isActive) handleConnect();
      });
    } else {
      socket.connect();
    }

    return () => {
      isActive = false;
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect_failed", handleReconnectFailed);
      socket.off(SERVER_EVENTS.DASHBOARD_JOINED, handleDashboardJoined);
      socket.off(SERVER_EVENTS.LOCK_STATE_SYNC, handleLockStateSync);
      socket.off(
        SERVER_EVENTS.ACTIVE_AGENTS_UPDATED,
        handleActiveAgentsUpdated,
      );
      socket.off(SERVER_EVENTS.TICKET_LOCKED, handleTicketLocked);
      socket.off(SERVER_EVENTS.TICKET_UNLOCKED, handleTicketUnlocked);
      socket.off(SERVER_EVENTS.TICKETS_RELEASED, handleTicketsReleased);
      socket.off(SERVER_EVENTS.LOCK_REJECTED, handleLockRejected);
      socket.off(SERVER_EVENTS.TICKET_RESOLVED, handleTicketResolved);

      window.removeEventListener("offline", handleBrowserOffline);
      window.removeEventListener("online", handleBrowserOnline);
    };
  }, [addToast, loadTickets]);

  const handleManualReconnect = useCallback(() => {
    setReconnectAttempt(0);
    setConnectionStatus("reconnecting");
    socket.connect();
    loadTickets({ silent: ticketsCountRef.current > 0 });
  }, [loadTickets]);

  const handleUpdateAgentName = useCallback(
    (newName) => {
      agentNameRef.current = newName;
      setAgentName(newName);
      sessionStorage.setItem("rd_agent_name", newName);
      if (socket.connected) {
        socket.emit(CLIENT_EVENTS.JOIN_DASHBOARD, { agentName: newName });
      }
      addToast(`Signed in as ${newName}.`, "info");
    },
    [addToast],
  );

  const handleLockTicket = useCallback(
    (ticketId) => {
      if (!socket.connected) {
        addToast(
          "Cannot claim ticket while disconnected from Live Ops.",
          "error",
        );
        return;
      }

      setPendingTicketIds((prev) => ({ ...prev, [ticketId]: true }));

      socket
        .timeout(SOCKET_ACK_TIMEOUT_MS)
        .emit(CLIENT_EVENTS.LOCK_TICKET, { ticketId }, (err, response) => {
          setPendingTicketIds((prev) => {
            const next = { ...prev };
            delete next[ticketId];
            return next;
          });

          if (err) {
            addToast(
              `Lock request for ${ticketId} timed out. Check your connection and retry.`,
              "error",
            );
            return;
          }

          if (response?.ok && response.lock) {
            setLocks((prev) => ({ ...prev, [ticketId]: response.lock }));
            setActiveTicketId(ticketId);
            addToast(
              `Ticket ${ticketId} locked exclusively for you.`,
              "success",
            );
          }
        });
    },
    [addToast],
  );

  const handleUnlockTicket = useCallback(
    (ticketId) => {
      if (!socket.connected) {
        addToast("Cannot release lock while disconnected.", "error");
        return;
      }

      setPendingTicketIds((prev) => ({ ...prev, [ticketId]: true }));

      socket
        .timeout(SOCKET_ACK_TIMEOUT_MS)
        .emit(CLIENT_EVENTS.UNLOCK_TICKET, { ticketId }, (err, response) => {
          setPendingTicketIds((prev) => {
            const next = { ...prev };
            delete next[ticketId];
            return next;
          });

          if (err) {
            addToast(
              `Unlock request for ${ticketId} timed out. Please retry.`,
              "error",
            );
            return;
          }

          if (response?.ok) {
            setLocks((prev) => {
              const next = { ...prev };
              delete next[ticketId];
              return next;
            });
            setActiveTicketId((current) =>
              current === ticketId ? null : current,
            );
            addToast(`Ticket ${ticketId} released back to the queue.`, "info");
          } else if (response?.message) {
            addToast(response.message, "warning");
          }
        });
    },
    [addToast],
  );

  const handleOpenWorkspace = useCallback((ticketId) => {
    setActiveTicketId(ticketId);
  }, []);

  const handleCloseKeepLocked = useCallback(() => {
    setActiveTicketId(null);
  }, []);

  const handleSubmitResolution = useCallback(
    (ticketId, cleanedNote) =>
      new Promise((resolve) => {
        if (!socket.connected) {
          const err = {
            ok: false,
            message: "Connection lost. Reconnect before submitting resolution.",
          };
          addToast(err.message, "error");
          resolve(err);
          return;
        }

        setIsSubmittingResolution(true);

        socket.timeout(SOCKET_ACK_TIMEOUT_MS).emit(
          CLIENT_EVENTS.RESOLVE_TICKET,
          {
            ticketId,
            resolutionNote: cleanedNote,
            agentName: agentNameRef.current,
          },
          (err, response) => {
            setIsSubmittingResolution(false);

            if (err) {
              const message =
                "Resolution request timed out. Please verify connection and retry.";
              addToast(message, "error");
              resolve({ ok: false, message });
              return;
            }

            if (response?.ok && response.ticket) {
              setTickets((prev) =>
                prev.map((item) =>
                  item.ticketId === response.ticket.ticketId
                    ? response.ticket
                    : item,
                ),
              );
              setLocks((prev) => {
                if (response.locks && typeof response.locks === "object") {
                  return response.locks;
                }
                const next = { ...prev };
                delete next[ticketId];
                return next;
              });
              setActiveTicketId(null);
              addToast(
                `Ticket ${ticketId} resolved and broadcast to team.`,
                "success",
              );
              resolve({ ok: true });
            } else {
              const message =
                response?.message || "Unable to save resolution. Please retry.";
              addToast(message, "warning");
              resolve({ ok: false, message });
            }
          },
        );
      }),
    [addToast],
  );

  // Derived operational metrics
  const stats = useMemo(() => {
    let resolved = 0;
    let locked = 0;
    let available = 0;

    for (const ticket of tickets) {
      if (ticket.status === "resolved") {
        resolved += 1;
      } else if (locks[ticket.ticketId]) {
        locked += 1;
      } else {
        available += 1;
      }
    }

    return { total: tickets.length, available, locked, resolved };
  }, [tickets, locks]);

  const hasActiveOwnLock = useMemo(
    () =>
      Boolean(socketId) &&
      Object.values(locks).some((lock) => lock.socketId === socketId),
    [locks, socketId],
  );

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const isResolved = ticket.status === "resolved";
      const isLocked = Boolean(locks[ticket.ticketId]) && !isResolved;

      if (statusFilter === "available" && (isResolved || isLocked))
        return false;
      if (statusFilter === "locked" && !isLocked) return false;
      if (statusFilter === "resolved" && !isResolved) return false;

      if (priorityFilter !== "all" && ticket.priority !== priorityFilter) {
        return false;
      }

      if (!query) return true;

      return (
        ticket.ticketId.toLowerCase().includes(query) ||
        ticket.title.toLowerCase().includes(query) ||
        ticket.customerName.toLowerCase().includes(query) ||
        ticket.shipmentId.toLowerCase().includes(query) ||
        ticket.route.toLowerCase().includes(query)
      );
    });
  }, [tickets, locks, searchQuery, statusFilter, priorityFilter]);

  const activeTicket = useMemo(
    () => tickets.find((item) => item.ticketId === activeTicketId) || null,
    [tickets, activeTicketId],
  );

  const activeLock = activeTicket ? locks[activeTicket.ticketId] || null : null;
  const isActiveLockOwner = Boolean(
    activeLock && socketId && activeLock.socketId === socketId,
  );

  const isConnected = connectionStatus === "connected";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        agentName={agentName}
        onUpdateAgentName={handleUpdateAgentName}
        connectionStatus={connectionStatus}
        activeAgents={activeAgents}
        hasActiveOwnLock={hasActiveOwnLock}
      />

      <ConnectionBanner
        connectionStatus={connectionStatus}
        reconnectAttempt={reconnectAttempt}
        onManualReconnect={handleManualReconnect}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <MetricsBar stats={stats} />

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          onRefresh={() => loadTickets()}
          isRefreshing={loadingTickets}
        />

        <section aria-labelledby="dispatch-queue-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2
              id="dispatch-queue-heading"
              className="text-base font-semibold text-slate-900 sm:text-lg"
            >
              Freight Support Tickets ({filteredTickets.length})
            </h2>
            <p className="text-xs text-slate-600">
              Session ID:{" "}
              <code className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-slate-800">
                {socketId || "connecting..."}
              </code>
            </p>
          </div>

          {ticketError && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{ticketError}</span>
            </div>
          )}

          {loadingTickets ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
                />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="text-sm font-semibold text-slate-800">
                No freight tickets match your current filters.
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Try clearing the search box or switching back to
                &ldquo;All&rdquo;.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTickets.map((ticket) => (
                <TicketCard
                  key={ticket.ticketId}
                  ticket={ticket}
                  lock={locks[ticket.ticketId] || null}
                  currentSocketId={socketId}
                  isConnected={isConnected}
                  isPending={Boolean(pendingTicketIds[ticket.ticketId])}
                  onLockTicket={handleLockTicket}
                  onUnlockTicket={handleUnlockTicket}
                  onOpenWorkspace={handleOpenWorkspace}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-600 sm:flex-row sm:px-6 lg:px-8">
          <p>RapidDispatch Freight &amp; Logistics &bull; Dallas, TX</p>
          <p>Real-Time Concurrency Engine &bull; Socket.io Live Ops</p>
        </div>
      </footer>

      <ResolutionModal
        key={activeTicket?.ticketId || "closed"}
        ticket={activeTicket}
        lock={activeLock}
        isOwner={isActiveLockOwner}
        isConnected={isConnected}
        isSubmitting={isSubmittingResolution}
        isReleasing={Boolean(
          activeTicket && pendingTicketIds[activeTicket.ticketId],
        )}
        onCloseKeepLocked={handleCloseKeepLocked}
        onReleaseAndClose={handleUnlockTicket}
        onSubmitResolution={handleSubmitResolution}
      />

      <ToastBanner toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
