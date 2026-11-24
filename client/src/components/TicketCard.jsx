import { memo } from "react";
import {
  CheckCircle2,
  Lock,
  MapPin,
  ShieldAlert,
  Unlock,
  UserCheck,
} from "lucide-react";

const PRIORITY_STYLES = {
  critical: "bg-red-50 text-red-800 border-red-200",
  high: "bg-amber-50 text-amber-900 border-amber-200",
  medium: "bg-sky-50 text-sky-900 border-sky-200",
  low: "bg-slate-100 text-slate-800 border-slate-200",
};

const formatLockTime = (isoString) => {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
};

function TicketCard({
  ticket,
  lock,
  currentSocketId,
  isConnected,
  isPending,
  onLockTicket,
  onUnlockTicket,
}) {
  const isResolved = ticket.status === "resolved";
  const isLocked = Boolean(lock) && !isResolved;
  const isLockedByMe = isLocked && lock.socketId === currentSocketId;
  const isLockedByOther = isLocked && lock.socketId !== currentSocketId;

  let cardSurfaceClasses = "border-slate-200 bg-white hover:border-slate-300";
  if (isResolved) {
    cardSurfaceClasses = "border-emerald-200 bg-emerald-50/35";
  } else if (isLockedByMe) {
    cardSurfaceClasses = "border-sky-500 bg-sky-50/35 ring-2 ring-sky-500/20";
  } else if (isLockedByOther) {
    cardSurfaceClasses = "border-amber-300 bg-amber-50/40";
  }

  return (
    <article
      aria-label={`Ticket ${ticket.ticketId}: ${ticket.title}`}
      className={`flex flex-col justify-between rounded-xl border p-5 shadow-xs transition ${cardSurfaceClasses}`}
    >
      <div>
        {/* Top Row: ID + Priority */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800">
              {ticket.ticketId}
            </span>
            <span className="font-mono text-xs text-slate-600">
              {ticket.shipmentId}
            </span>
          </div>

          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
              PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.medium
            }`}
          >
            {ticket.priority}
          </span>
        </div>

        {/* Real-Time Lock / Status Strip */}
        <div className="mb-3">
          {isResolved ? (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Resolved by {ticket.resolvedBy || "Dispatch"}</span>
            </div>
          ) : isLockedByMe ? (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-950">
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Locked by You &bull; {formatLockTime(lock.lockedAt)}</span>
            </div>
          ) : isLockedByOther ? (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Locked by {lock.agentName} &bull;{" "}
                {formatLockTime(lock.lockedAt)}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              <Unlock
                className="h-3.5 w-3.5 text-emerald-700"
                aria-hidden="true"
              />
              <span>Available to Claim</span>
            </div>
          )}
        </div>

        {/* Title & Description */}
        <h3 className="mb-1.5 text-sm font-semibold leading-snug text-slate-900">
          {ticket.title}
        </h3>
        <p className="text-xs leading-relaxed text-slate-700">
          {ticket.description}
        </p>

        {/* Saved Resolution Note Preview */}
        {isResolved && ticket.resolutionNote && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white/90 p-2.5 text-xs text-slate-800">
            <p className="font-semibold text-emerald-900">Resolution Note:</p>
            <p className="mt-0.5 leading-relaxed">{ticket.resolutionNote}</p>
          </div>
        )}
      </div>

      {/* Metadata & Action Footer */}
      <div className="mt-4 border-t border-slate-200/80 pt-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="truncate font-semibold text-slate-800">
            {ticket.customerName}
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600">
            <MapPin
              className="h-3.5 w-3.5 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            <span>{ticket.route}</span>
          </span>
        </div>

        {/* Action Buttons */}
        {isResolved ? (
          <div className="rounded-lg bg-emerald-100/70 px-3 py-2 text-center text-xs font-semibold text-emerald-900">
            Dispatch Closed
          </div>
        ) : isLockedByMe ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUnlockTicket(ticket.ticketId)}
              disabled={!isConnected || isPending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-700 bg-white px-3 py-2 text-xs font-semibold text-sky-900 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isPending ? "Releasing..." : "Release Lock"}</span>
            </button>
          </div>
        ) : isLockedByOther ? (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100/80 px-3 py-2 text-xs font-semibold text-amber-950"
          >
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Locked by {lock.agentName}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onLockTicket(ticket.ticketId)}
            disabled={!isConnected || isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {isPending ? "Acquiring Lock..." : "Claim & Lock Ticket"}
            </span>
          </button>
        )}
      </div>
    </article>
  );
}

export default memo(TicketCard);
