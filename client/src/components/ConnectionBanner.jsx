import { RefreshCw, WifiOff } from "lucide-react";

export default function ConnectionBanner({
  connectionStatus,
  reconnectAttempt,
  onManualReconnect,
}) {
  // Only render when connection is degraded or offline
  if (connectionStatus === "connected" || connectionStatus === "connecting") {
    return null;
  }

  const isOffline = connectionStatus === "offline";
  const isFailed = connectionStatus === "failed";

  let headline =
    "Live Sync connection lost. Attempting automatic reconnection...";
  if (isOffline) {
    headline = "Your device appears to be offline.";
  } else if (isFailed) {
    headline =
      "Unable to reach RapidDispatch Live Ops server after multiple retries.";
  } else if (reconnectAttempt > 0) {
    headline = `Reconnecting to Live Ops server (Attempt ${reconnectAttempt})...`;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-b border-amber-300 bg-amber-50 text-amber-950"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-start gap-2.5 text-xs sm:items-center">
          <WifiOff
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 sm:mt-0"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold">{headline}</p>
            <p className="text-amber-900/90">
              Ticket lock &amp; resolution actions are paused to prevent stale
              overwrites. Queue state will resync automatically once restored.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onManualReconnect}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-2xs transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reconnect Now</span>
        </button>
      </div>
    </div>
  );
}
