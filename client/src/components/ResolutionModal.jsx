import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  MapPin,
  Send,
  Unlock,
  X,
} from "lucide-react";
import {
  MAX_RESOLUTION_LENGTH,
  MIN_RESOLUTION_LENGTH,
  validateResolutionNote,
} from "../utils/validation";

const QUICK_SNIPPETS = [
  "Dispatched emergency relay tractor and notified consignee of updated ETA.",
  "Confirmed new receiving dock appointment code with facility supervisor.",
  "Verified geofence timestamps and issued updated invoice hold to billing.",
];

export default function ResolutionModal({
  ticket,
  lock,
  isOwner,
  isConnected,
  isSubmitting,
  isReleasing,
  onCloseKeepLocked,
  onReleaseAndClose,
  onSubmitResolution,
}) {
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef(null);

  // Reset form state whenever a different ticket is opened
  useEffect(() => {
    setNote("");
    setFieldError("");
    setTouched(false);
  }, [ticket?.ticketId]);

  // Focus textarea on open, handle Escape key, and lock background body scroll
  useEffect(() => {
    if (!ticket) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 30);

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmitting) {
        onCloseKeepLocked();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [ticket, isSubmitting, onCloseKeepLocked]);

  if (!ticket) return null;

  const validation = validateResolutionNote(note);
  const charCount = note.length;
  const canSubmit =
    isConnected && isOwner && !isSubmitting && !isReleasing && validation.valid;

  const handleNoteChange = (e) => {
    const nextValue = e.target.value;
    setNote(nextValue);

    if (touched) {
      const check = validateResolutionNote(nextValue);
      setFieldError(check.valid ? "" : check.error);
    } else if (fieldError) {
      setFieldError("");
    }
  };

  const handleQuickSnippet = (snippet) => {
    const combined = note.trim() ? `${note.trim()} ${snippet}` : snippet;
    const bounded = combined.slice(0, MAX_RESOLUTION_LENGTH);
    setNote(bounded);
    setTouched(true);
    const check = validateResolutionNote(bounded);
    setFieldError(check.valid ? "" : check.error);
    textareaRef.current?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);

    const check = validateResolutionNote(note);
    if (!check.valid) {
      setFieldError(check.error);
      textareaRef.current?.focus();
      return;
    }

    if (!isConnected || !isOwner) {
      setFieldError(
        "Active connection and exclusive lock ownership are required to save.",
      );
      return;
    }

    setFieldError("");
    const result = await onSubmitResolution(ticket.ticketId, check.cleaned);
    if (!result?.ok && result?.message) {
      setFieldError(result.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onCloseKeepLocked();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolution-modal-title"
        aria-describedby="resolution-modal-desc"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white sm:px-6">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-xs font-bold text-sky-300 ring-1 ring-sky-400/30">
                {ticket.ticketId}
              </span>
              <span className="font-mono text-xs text-slate-300">
                {ticket.shipmentId}
              </span>
              {isOwner && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/30">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Exclusive Lock Held
                </span>
              )}
            </div>
            <h2
              id="resolution-modal-title"
              className="truncate text-base font-semibold tracking-tight sm:text-lg"
            >
              {ticket.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCloseKeepLocked}
            disabled={isSubmitting}
            aria-label="Minimize workspace and keep ticket locked"
            title="Minimize (keeps ticket locked)"
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {/* Connection or Lock Warning */}
          {(!isConnected || !isOwner) && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs font-medium text-amber-950"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <p>
                {!isConnected
                  ? "Live Sync connection interrupted. Submission is paused until reconnected."
                  : `Lock ownership changed (${lock?.agentName ? `now held by ${lock.agentName}` : "ticket unlocked"}). Close this workspace to resync.`}
              </p>
            </div>
          )}

          {/* Freight Context Summary */}
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Customer: {ticket.customerName}
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                <MapPin
                  className="h-3.5 w-3.5 text-slate-500"
                  aria-hidden="true"
                />
                {ticket.route}
              </span>
            </div>
            <p
              id="resolution-modal-desc"
              className="text-xs leading-relaxed text-slate-700"
            >
              {ticket.description}
            </p>
          </div>

          {/* Quick Dispatch Snippets */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold text-slate-700">
              Quick Dispatch Notes:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SNIPPETS.map((snippet, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleQuickSnippet(snippet)}
                  disabled={isSubmitting || !isOwner}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + {snippet.slice(0, 48)}...
                </button>
              ))}
            </div>
          </div>

          {/* Resolution Form */}
          <form id="resolution-form" onSubmit={handleSubmit} noValidate>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="resolution-note-input"
                className="text-xs font-semibold text-slate-900"
              >
                Official Resolution Action{" "}
                <span className="text-red-700">*</span>
              </label>
              <span
                className={`font-mono text-xs ${
                  charCount > MAX_RESOLUTION_LENGTH
                    ? "font-semibold text-red-700"
                    : "text-slate-600"
                }`}
              >
                {charCount} / {MAX_RESOLUTION_LENGTH}
              </span>
            </div>

            <textarea
              ref={textareaRef}
              id="resolution-note-input"
              rows={5}
              value={note}
              onChange={handleNoteChange}
              onBlur={() => {
                setTouched(true);
                const check = validateResolutionNote(note);
                setFieldError(check.valid ? "" : check.error);
              }}
              maxLength={MAX_RESOLUTION_LENGTH}
              disabled={isSubmitting || !isOwner}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={
                fieldError ? "resolution-note-error" : "resolution-note-hint"
              }
              placeholder="Document carrier dispatch, revised appointment code, or billing action taken for this shipment..."
              className={`w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 placeholder-slate-500 transition focus:outline-none focus:ring-2 disabled:bg-slate-100 ${
                fieldError
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500/25"
                  : "border-slate-300 focus:border-sky-600 focus:ring-sky-500/25"
              }`}
            />

            {fieldError ? (
              <p
                id="resolution-note-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-700"
              >
                {fieldError}
              </p>
            ) : (
              <p
                id="resolution-note-hint"
                className="mt-1.5 text-xs text-slate-600"
              >
                Minimum {MIN_RESOLUTION_LENGTH} plain-text characters.
                HTML/script tags are stripped automatically.
              </p>
            )}
          </form>
        </div>

        {/* Sticky Footer Controls */}
        <div className="flex flex-col-reverse gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onReleaseAndClose(ticket.ticketId)}
              disabled={!isConnected || !isOwner || isSubmitting || isReleasing}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isReleasing ? "Releasing..." : "Release Lock"}</span>
            </button>

            <button
              type="button"
              onClick={onCloseKeepLocked}
              disabled={isSubmitting}
              className="inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200/70 focus:outline-none focus:ring-2 focus:ring-slate-500 sm:flex-none"
            >
              Keep Locked
            </button>
          </div>

          <button
            type="submit"
            form="resolution-form"
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <CheckCircle2
                  className="h-4 w-4 animate-pulse"
                  aria-hidden="true"
                />
                <span>Saving Resolution...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Submit Resolution</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
