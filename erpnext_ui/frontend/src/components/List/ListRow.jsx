import { ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

export function ListRow({ item, onClick, index, className = "" }) {
  const status = item.statusLabel || item.status;
  const statusColor = item.statusColor || item.status;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={
        `group relative flex min-h-[56px] items-center gap-3 border-b border-border/50 bg-transparent px-4 py-3 transition-all motion-safe:duration-150 last:border-b-0 ${className}` +
        (onClick
          ? " cursor-pointer hover:bg-primary/[0.04] focus-visible:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
          : "")
      }
      onClick={onClick ? () => onClick(item.raw ?? item) : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(item.raw ?? item);
              }
            }
          : undefined
      }
    >
      {/* Leading accent rail — revealed on hover / keyboard focus */}
      {onClick ? (
        <span
          aria-hidden
          className="absolute inset-y-0 start-0 w-[3px] origin-bottom scale-y-0 bg-primary transition-transform motion-safe:duration-150 group-hover:scale-y-100 group-focus-visible:scale-y-100"
        />
      ) : null}

      {index != null && (
        <span className="w-7 shrink-0 text-xs tabular-nums text-muted-foreground">
          {index}
        </span>
      )}

      {/* LEFT */}
      <div className="min-w-0 flex-grow">
        <div className="truncate text-sm font-semibold text-foreground">
          {item.title}
        </div>
        {item.subtitle && (
          <div className="truncate text-xs text-muted-foreground">
            {item.subtitle}
          </div>
        )}
      </div>

      {/* MIDDLE (DESKTOP ONLY) */}
      <div className="hidden min-w-0 truncate text-xs text-muted-foreground md:block">
        {item.meta}
      </div>

      {/* RIGHT */}
      <div className="flex shrink-0 items-center gap-2">
        {status ? (
          <StatusBadge tone={statusColor || "open"}>{status}</StatusBadge>
        ) : null}

        {onClick && (
          <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-all motion-safe:duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:opacity-100 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 rtl:group-focus-visible:-translate-x-0.5" />
        )}
      </div>
    </div>
  );
}
