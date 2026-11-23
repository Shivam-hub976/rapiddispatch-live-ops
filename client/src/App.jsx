import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  RefreshCw,
  Truck,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { socket } from "./socket/socketClient";
import { CLIENT_EVENTS, SERVER_EVENTS } from "./socket/socketEvents";
import { fetchTickets } from "./services/ticketApi";

const getInitialTabAgentName = () => {
  const existing = sessionStorage.getItem("rd_agent_name");
  if (existing) return existing;

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const generated = `Dispatcher-${suffix}`;
  sessionStorage.setItem("rd_agent_name", generated);
  return generated;
};

const PRIORITY_STYLES = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-amber-50 text-amber-800 border-amber-200",
  medium: "bg-sky-50 text-sky-800 border-sky-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function App() {
  const [agentName] = useState(getInitialTabAgentName);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [socketId, setSocketId] = useState("");
  const [activeAgents, setActiveAgents] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketError, setTicketError] = useState("");

  // Load persisted freight tickets via REST
  const loadTickets = async () => {
    setLoadingTickets(true);
    setTicketError("");
    try {
      const data = await fetchTickets();
      setTickets(data);
    } catch (error) {
      setTicketError(error.message || "Unable to load freight tickets.");
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  // Manage real-time Socket.io lifecycle safely under React Strict Mode
  useEffect(() => {
    const emitJoinDashboard = () => {
      socket.emit(CLIENT_EVENTS.JOIN_DASHBOARD, { agentName });
    };

    const handleConnect = () => {
      setConnectionStatus("connected");
      setSocketId(socket.id || "");
      emitJoinDashboard();
    };

    const handleDisconnect = () => {
      setConnectionStatus("disconnected");
      setSocketId("");
    };

    const handleConnectError = () => {
      setConnectionStatus("error");
    };

    const handleDashboardJoined = (payload) => {
      if (payload?.socketId) {
        setSocketId(payload.socketId);
      }
    };

    const handleActiveAgentsUpdated = (payload) => {
      if (Array.isArray(payload?.agents)) {
        setActiveAgents(payload.agents);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on(SERVER_EVENTS.DASHBOARD_JOINED, handleDashboardJoined);
    socket.on(SERVER_EVENTS.ACTIVE_AGENTS_UPDATED, handleActiveAgentsUpdated);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off(SERVER_EVENTS.DASHBOARD_JOINED, handleDashboardJoined);
      socket.off(
        SERVER_EVENTS.ACTIVE_AGENTS_UPDATED,
        handleActiveAgentsUpdated,
      );
    };
  }, [agentName]);

  const isConnected = connectionStatus === "connected";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Corporate Operations Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 ring-1 ring-sky-400/30">
              <Truck className="h-5 w-5 text-sky-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                RapidDispatch Live Ops
              </h1>
              <p className="text-xs text-slate-300">
                Dallas Freight Command • Real-Time Support Desk
              </p>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-2.5 text-xs font-medium"
            aria-live="polite"
          >
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ${
                isConnected
                  ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                  : "bg-amber-500/15 text-amber-200 ring-amber-400/30"
              }`}
            >
              {isConnected ? (
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isConnected ? "Live Socket Connected" : "Connecting..."}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-slate-200 ring-1 ring-slate-700">
              <Users className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              {activeAgents.length} Active{" "}
              {activeAgents.length === 1 ? "Agent" : "Agents"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Session Telemetry Bar */}
        <section
          aria-label="Current Agent Session"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-xs"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-slate-500">Signed in as: </span>
              <span className="font-semibold text-slate-900">{agentName}</span>
            </div>
            <div>
              <span className="text-slate-500">Socket ID: </span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                {socketId || "Pending handshake..."}
              </code>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Activity className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <span>Room: live-ops-dashboard</span>
          </div>
        </section>

        {/* Freight Ticket Queue Preview */}
        <section aria-labelledby="queue-heading">
          <div className="mb-4 flex items-center justify-between">
            <h2
              id="queue-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Active Freight Support Queue ({tickets.length})
            </h2>
            <button
              type="button"
              onClick={loadTickets}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh Queue
            </button>
          </div>

          {ticketError && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
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
                  className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tickets.map((ticket) => (
                <article
                  key={ticket.ticketId}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300"
                >
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-600">
                        {ticket.ticketId} • {ticket.shipmentId}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
                          PRIORITY_STYLES[ticket.priority] ||
                          PRIORITY_STYLES.medium
                        }`}
                      >
                        {ticket.priority}
                      </span>
                    </div>

                    <h3 className="mb-1.5 text-sm font-semibold text-slate-900">
                      {ticket.title}
                    </h3>
                    <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
                      {ticket.description}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span className="truncate font-medium text-slate-700">
                      {ticket.customerName}
                    </span>
                    <span className="shrink-0 pl-2">{ticket.route}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
