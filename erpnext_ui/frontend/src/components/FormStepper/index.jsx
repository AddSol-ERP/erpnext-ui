import { cn } from "cn";
import { Check } from "lucide-react";

/**
 * Numbered form stepper header (premium Modulix).
 * Steps: completed / active / upcoming; error badge when `errorSteps` has index.
 *
 * props:
 *  - steps: [{ id, label }]
 *  - current: number (0-based)
 *  - maxReached: number — highest step the user may open
 *  - errorSteps: Set<number> | number[]
 *  - onSelect(index) — only allowed when index <= maxReached
 */
export default function FormStepper({
  steps = [],
  current = 0,
  maxReached = 0,
  errorSteps,
  onSelect,
  className,
}) {
  const errors = errorSteps instanceof Set ? errorSteps : new Set(errorSteps || []);

  return (
    <nav
      aria-label="Form steps"
      className={cn(
        "flex w-full items-start gap-1 overflow-x-auto border-b border-border/60 bg-muted/20 px-3 pt-3 pb-0 sm:gap-0 sm:px-4",
        className,
      )}
    >
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const state =
          i === current
            ? "active"
            : i <= maxReached
              ? i < current
                ? "complete"
                : "reachable"
              : "upcoming";
        const clickable = i <= maxReached && onSelect;

        return (
          <div key={step.id || i} className={cn("flex min-w-0 flex-1 items-start")}>
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSelect(i) : undefined}
              className={cn(
                "group flex min-w-0 flex-1 flex-col items-center gap-1.5 pb-2.5 text-center outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                !clickable && "cursor-default",
              )}
              aria-current={state === "active" ? "step" : undefined}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "relative flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums transition-all",
                    state === "complete" &&
                      "border-primary bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(79,70,229,0.35)]",
                    state === "active" &&
                      "border-primary bg-primary/10 text-primary ring-2 ring-primary/40 shadow-[0_0_0_4px_rgba(79,70,229,0.08)]",
                    state === "reachable" &&
                      "border-border bg-card text-muted-foreground group-hover:border-primary/40 group-hover:text-primary group-hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)]",
                    state === "upcoming" &&
                      "border-border bg-card text-muted-foreground/60",
                  )}
                >
                  {state === "complete" ? (
                    <Check className="size-4" />
                  ) : (
                    i + 1
                  )}
                  {errors.has(i) && (
                    <span className="absolute -end-1 -top-1 size-2.5 rounded-full bg-destructive ring-2 ring-card" />
                  )}
                </span>
              </span>
              <span
                className={cn(
                  "max-w-full truncate px-1 text-[11px] leading-tight sm:text-xs",
                  state === "active"
                    ? "font-semibold text-primary"
                    : state === "complete"
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                )}
                title={step.label || undefined}
              >
                {step.label || `Step ${i + 1}`}
              </span>
            </button>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "mt-[15px] h-0.5 w-full min-w-6 flex-1 rounded-full transition-colors",
                  i < maxReached || i < current
                    ? "bg-primary/60"
                    : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
