import { useState } from "react";
import { Check, Pencil, Truck, Users, Wifi, WifiOff, X } from "lucide-react";

export default function Header({
  agentName,
  onUpdateAgentName,
  connectionStatus,
  activeAgents,
  hasActiveOwnLock,
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(agentName);
  const [nameError, setNameError] = useState("");

  const isConnected = connectionStatus === "connected";
  const isOfflineOrFailed =
    connectionStatus === "offline" ||
    connectionStatus === "failed" ||
    connectionStatus === "error";

  const statusLabel = isConnected
    ? "Live Sync Active"
    : connectionStatus === "offline"
      ? "Browser Offline"
      : connectionStatus === "failed"
        ? "Server Unreachable"
        : connectionStatus === "connecting"
          ? "Connecting..."
          : "Reconnecting...";

  const statusPillClasses = isConnected
    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
    : isOfflineOrFailed
      ? "bg-red-500/15 text-red-200 ring-red-400/30"
      : "bg-amber-500/15 text-amber-200 ring-amber-400/30";

  const handleStartEdit = () => {
    setDraftName(agentName);
    setNameError("");
    setIsEditingName(true);
  };

  const handleCancelEdit = () => {
    setDraftName(agentName);
    setNameError("");
    setIsEditingName(false);
  };

  const handleSaveName = (e) => {
    e.preventDefault();
    const cleaned = draftName
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length < 2 || cleaned.length > 40) {
      setNameError("Enter 2–40 characters.");
      return;
    }

    onUpdateAgentName(cleaned);
    setIsEditingName(false);
    setNameError("");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        {/* Brand Identity */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 ring-1 ring-sky-400/30">
              <Truck className="h-5 w-5 text-sky-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">
                RapidDispatch Live Ops
              </h1>
              <p className="text-xs text-slate-300">
                Dallas Freight Command &bull; Real-Time Dispatch Desk
              </p>
            </div>
          </div>
        </div>

        {/* Live Telemetry & Agent Identity Controls */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium">
          {/* Socket Status */}
          <span
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ${statusPillClasses}`}
          >
            {isConnected ? (
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{statusLabel}</span>
          </span>

          {/* Active Agents Count */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-slate-200 ring-1 ring-slate-700"
            title={activeAgents.map((a) => a.agentName).join(", ")}
          >
            <Users className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>
              {activeAgents.length}{" "}
              {activeAgents.length === 1 ? "Agent" : "Agents"} Online
            </span>
          </span>

          {/* Agent Identity Switcher */}
          {isEditingName ? (
            <form
              onSubmit={handleSaveName}
              className="flex items-center gap-1.5"
            >
              <label htmlFor="agent-name-input" className="sr-only">
                Agent Display Name
              </label>
              <input
                id="agent-name-input"
                type="text"
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  if (nameError) setNameError("");
                }}
                maxLength={40}
                placeholder="e.g., Agent Sarah"
                autoFocus
                className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-white placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 sm:w-44"
              />
              <button
                type="submit"
                aria-label="Save agent name"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500 text-slate-950 transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                aria-label="Cancel editing name"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {nameError && (
                <span role="alert" className="text-xs text-amber-300">
                  {nameError}
                </span>
              )}
            </form>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              disabled={hasActiveOwnLock}
              title={
                hasActiveOwnLock
                  ? "Release your active ticket lock before changing your display name"
                  : "Change your agent display name for this tab"
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className="h-2 w-2 rounded-full bg-sky-400"
                aria-hidden="true"
              />
              <span className="max-w-[140px] truncate">{agentName}</span>
              <Pencil className="h-3 w-3 text-slate-300" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
