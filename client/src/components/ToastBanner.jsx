import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const TONE_STYLES = {
  error: "border-red-300 bg-red-50 text-red-900",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  success: "border-emerald-300 bg-emerald-50 text-emerald-950",
  info: "border-sky-300 bg-sky-50 text-sky-950",
};

const TONE_ICONS = {
  error: AlertTriangle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

export default function ToastBanner({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:right-6 sm:bottom-6"
    >
      {toasts.map((toast) => {
        const Icon = TONE_ICONS[toast.tone] || Info;
        return (
          <div
            key={toast.id}
            role={
              toast.tone === "error" || toast.tone === "warning"
                ? "alert"
                : "status"
            }
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs font-medium shadow-md ${
              TONE_STYLES[toast.tone] || TONE_STYLES.info
            }`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="flex-1 leading-relaxed">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-0.5 opacity-75 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
