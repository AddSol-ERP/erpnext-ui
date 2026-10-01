import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mapVariant } from "@/lib/mapVariant";

function ActionIcon({ icon }) {
  if (!icon) return null;
  if (typeof icon === "string") return <i className={icon} />;
  const Icon = icon;
  return <Icon className="size-4" />;
}

/** Page actions as labeled buttons, aligned to the end (right in LTR). */
function ActionGroup({ actions }) {
  if (!actions?.length) return null;

  return (
    <div className="ms-auto flex flex-wrap items-center justify-end gap-1.5">
      {actions.map((action, i) => {
        const map = mapVariant(action.variant);
        return (
          <Button
            key={`${action.label ?? i}-${i}`}
            size="sm"
            variant={map.variant}
            className={map.className}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.label}
          >
            <ActionIcon icon={action.icon} />
            <span className="truncate">{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

/** Status filter pills (desktop) + native select (mobile). */
function StatusGroup({ statusList, statusFilter, setStatusFilter }) {
  if (!statusList?.length) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div className="hidden flex-wrap gap-1.5 sm:flex">
        {statusList.map((s) => (
          <button
            key={s}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : "text-chrome-muted hover:bg-muted hover:text-chrome-foreground"
            }`}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <select
        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        aria-label="Status filter"
      >
        {statusList.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Sticky validation notice pill (start side); click focuses first error. */
function ErrorNotice({ count, onClick }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 text-xs font-semibold text-destructive ring-1 ring-destructive/30 transition-colors hover:bg-destructive/25"
    >
      <AlertTriangle className="size-3.5" />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

/**
 * Fixed light chrome bottom bar for setHeader page actions + status chips.
 * Chips / error notice on the start side, actions aligned to the end (right in LTR).
 * Renders nothing when all inputs are empty.
 */
export default function PageToolbar({
  actions = [],
  statusList = [],
  statusFilter = "",
  setStatusFilter = () => {},
  errorCount = 0,
  onErrorsClick,
}) {
  const hasActions = actions?.length > 0;
  const hasStatus = statusList?.length > 0;
  const hasErrors = errorCount > 0;
  if (!hasActions && !hasStatus && !hasErrors) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-chrome px-3 py-2 text-chrome-foreground shadow-[0_-4px_24px_rgba(15,23,42,0.06)] pb-[max(0.5rem,env(safe-area-inset-bottom))] print:hidden md:px-4"
      style={{
        "--foreground": "var(--chrome-foreground)",
        "--muted-foreground": "var(--chrome-muted)",
        "--muted": "var(--sidebar-accent)",
        "--accent": "var(--sidebar-accent)",
        "--border": "var(--chrome-border)",
        "--background": "var(--chrome)",
        "--card": "var(--chrome)",
      }}
      role="toolbar"
      aria-label="Page actions"
    >
      <ErrorNotice count={errorCount} onClick={onErrorsClick} />
      <StatusGroup
        statusList={statusList}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />
      <ActionGroup actions={actions} />
    </div>
  );
}
