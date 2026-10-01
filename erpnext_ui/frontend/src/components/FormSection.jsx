import { useState } from "react";
import { ChevronDown, LayoutList } from "lucide-react";
import { cn } from "cn";

/**
 * Premium card shell for a form block (Direction A: sharp Modulix + accent).
 * Sharp base (rounded-none) — outer corners applied by page/stack rules.
 *
 * - `icon`: leading icon for the header (defaults to a neutral list icon)
 * - accent rail on the start side when open / errored
 * - collapsible: title becomes a toggle; errorCount > 0 force-opens and
 *   shows a destructive count badge on the header.
 */
export default function FormSection({
  title,
  description,
  action,
  icon: Icon,
  children,
  className,
  contentClassName,
  collapsible = false,
  defaultOpen = true,
  errorCount = 0,
  open: controlledOpen,
  onOpenChange,
}) {
  const hasErrors = Number(errorCount) > 0;
  const [internalOpen, setInternalOpen] = useState(defaultOpen || hasErrors);
  const isControlled = controlledOpen !== undefined;
  const isOpen = hasErrors
    ? true
    : isControlled
      ? controlledOpen
      : internalOpen;

  const toggle = () => {
    if (!collapsible || hasErrors) return;
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const showHeader = Boolean(title || action || collapsible);
  const SectionIcon = Icon || LayoutList;

  return (
    <section
      className={cn(
        "group/section relative overflow-hidden rounded-none bg-card ring-1 ring-foreground/10",
        "transition-shadow duration-200 hover:shadow-[var(--shadow-soft)]",
        !collapsible && "p-4",
        className,
      )}
    >
      {/* Start-side accent rail */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 start-0 w-[3px] transition-colors",
          hasErrors
            ? "bg-destructive"
            : isOpen
              ? "bg-primary/60"
              : "bg-transparent group-hover/section:bg-primary/25",
        )}
      />

      {showHeader && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2",
            collapsible
              ? cn(
                  "px-4 py-3",
                  isOpen && "border-b border-border/60 bg-muted/40",
                )
              : "mb-3",
          )}
        >
          <div
            className={cn(
              "min-w-0",
              collapsible &&
                "flex cursor-pointer items-start gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
            )}
            onClick={collapsible ? toggle : undefined}
            onKeyDown={
              collapsible
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle();
                    }
                  }
                : undefined
            }
            role={collapsible ? "button" : undefined}
            tabIndex={collapsible ? 0 : undefined}
            aria-expanded={collapsible ? isOpen : undefined}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                hasErrors
                  ? "bg-destructive/15 text-destructive"
                  : "bg-[var(--icon-box-bg)] text-primary",
              )}
            >
              <SectionIcon className="size-4" />
            </span>
            <div className="min-w-0">
              {title && (
                <h3 className="text-sm font-semibold text-foreground">
                  {title}
                </h3>
              )}
              {description && (!collapsible || isOpen) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {hasErrors && (
              <span className="ms-1 inline-flex h-5 shrink-0 items-center rounded-full bg-destructive/15 px-2 text-[11px] font-semibold text-destructive ring-1 ring-destructive/30">
                {errorCount}
              </span>
            )}
            {collapsible && (
              <ChevronDown
                className={cn(
                  "ms-1 mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                  !isOpen && "-rotate-90",
                )}
              />
            )}
          </div>
          {action && (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          )}
        </div>
      )}

      {(!collapsible || isOpen) && (
        <div
          className={cn(collapsible && "px-4 pt-3 pb-4", contentClassName)}
        >
          {children}
        </div>
      )}
    </section>
  );
}
