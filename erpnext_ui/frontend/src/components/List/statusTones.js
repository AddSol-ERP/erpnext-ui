/** Shared status → tone classes for list/detail badges. */
export const STATUS_BADGE = {
  open: "bg-muted text-muted-foreground ring-border",
  pending: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  complete:
    "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  danger: "bg-destructive/15 text-destructive ring-destructive/30",
  info: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  warning:
    "bg-orange-500/15 text-orange-600 ring-orange-500/30 dark:text-orange-400",
};

export function statusBadgeClass(tone = "open") {
  return STATUS_BADGE[tone] || STATUS_BADGE.open;
}
