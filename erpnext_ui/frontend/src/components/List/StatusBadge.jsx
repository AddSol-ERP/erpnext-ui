import { cn } from "cn";
import { statusBadgeClass } from "./statusTones";

export function StatusBadge({ children, tone = "open", className }) {
  if (children == null || children === "") return null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        statusBadgeClass(tone),
        className,
      )}
    >
      {/* Leading status dot — tone color carried by text/currentColor */}
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-current opacity-75"
      />
      <span className="truncate">{children}</span>
    </span>
  );
}
