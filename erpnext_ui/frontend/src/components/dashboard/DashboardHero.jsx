/**
 * Compact hero strip for dashboards — description context under the top bar title.
 * Does not repeat the page title (title lives in AppShell).
 */
export default function DashboardHero({ icon: Icon, description, meta, actions }) {
  if (!description && !meta && !actions && !Icon) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-none bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
          {meta ? (
            <p className="mt-0.5 text-xs font-medium text-primary">{meta}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
