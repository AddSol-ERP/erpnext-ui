const DEFAULT_COLOR = "var(--brand-primary)";

/**
 * Premium KPI card used on dashboards and reports.
 * API: { value, label, icon, color?, hint?, loading?, className? }
 * `icon` accepts a lucide component or a bootstrap-icon class string.
 * Sharp base — corners injected by parent via gridCorners / card-stack.
 */
export default function StatCard({ value, label, icon, color, hint, loading, className = "" }) {
  const resolved = color || DEFAULT_COLOR;
  const Icon = icon;
  const isStringIcon = typeof Icon === "string";

  return (
    <div className={`group flex items-center gap-3 bg-card p-4 ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-primary/40 ${className}`}>
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${resolved} 12%, transparent)` }}
      >
        {isStringIcon ? (
          <i className={Icon} style={{ color: resolved, fontSize: 18 }} />
        ) : (
          <Icon className="size-5" style={{ color: resolved }} />
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate text-xl font-bold tabular-nums leading-tight">
          {loading ? "—" : value}
        </div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        {hint ? (
          <div className="truncate text-[11px] text-muted-foreground/80">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}
