import { CheckCircle2, ClipboardList, Lock, Unlock } from "lucide-react";

export default function MetricsBar({ stats }) {
  const cards = [
    {
      label: "Total Queue",
      value: stats.total,
      subtext: "Dallas & regional lanes",
      icon: ClipboardList,
      iconClasses: "bg-slate-100 text-slate-700",
    },
    {
      label: "Available Now",
      value: stats.available,
      subtext: "Ready to claim",
      icon: Unlock,
      iconClasses: "bg-sky-50 text-sky-700",
    },
    {
      label: "Actively Locked",
      value: stats.locked,
      subtext: "Collision-protected",
      icon: Lock,
      iconClasses: "bg-amber-50 text-amber-700",
    },
    {
      label: "Resolved",
      value: stats.resolved,
      subtext: "Completed dispatches",
      icon: CheckCircle2,
      iconClasses: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <section
      aria-label="Queue operational metrics"
      className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div>
              <p className="text-xs font-medium text-slate-600">{card.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {card.value}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{card.subtext}</p>
            </div>
            <div className={`rounded-lg p-2 ${card.iconClasses}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
        );
      })}
    </section>
  );
}
