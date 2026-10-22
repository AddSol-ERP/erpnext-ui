import { ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";

/**
 * The question rail: one chip per question, plus a chip for the review.
 *
 * THE POINT OF THE RAIL
 * ---------------------
 * The complaint that produced the question paper was that scrolling a long
 * list of readings made it easy to lose your place and skip one. A chip per
 * question turns "which ones have I done?" into a glance, and makes every
 * question one tap away -- so the user never has to scroll to find their
 * place at all.
 *
 * The chips carry TWO pieces of information:
 *   * the FILL is the answer state (answered / within criterion / outside it),
 *   * the OUTLINE marks the question you are on.
 *
 * They are separate devices on purpose. A current question that was rejected
 * must still look rejected -- colouring the current chip by position would
 * hide the one reading that needs attention.
 *
 * The strip scrolls horizontally (`overflow-x-auto`), and the current chip
 * scrolls itself into view, so a long paper still keeps its place.
 *
 * The chip row carries VERTICAL padding for a reason that is easy to lose:
 * `overflow-x-auto` computes `overflow-y` to `auto` too, so the row clips
 * vertically at its padding edge. The current chip is marked with an
 * `outline` (which sits OUTSIDE the border box), so without that padding the
 * outline is sliced off and the chip you are on does not look different from
 * the ones around it -- which is the one thing the rail has to show.
 */
export default function QuestionRail({
  parameters = [],
  states = [],
  current = 0,
  onSelect,
  railRef,
  remaining = 0,
}) {
  const { t } = useTranslation();

  const total = parameters.length;
  const onReview = current >= total;

  const chipClass = (state) =>
    cn(
      "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors",
      state === "accepted" &&
        "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30",
      state === "rejected" &&
        "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
      state === "answered" &&
        "bg-muted text-muted-foreground ring-1 ring-border",
      state === "todo" &&
        "border border-border bg-card text-muted-foreground/60",
    );

  const stateLabel = (state) =>
    state === "accepted"
      ? t("quality.statusAccepted")
      : state === "rejected"
        ? t("quality.statusRejected")
        : state === "answered"
          ? t("quality.answered")
          : t("quality.notAnswered");

  return (
    <div
      ref={railRef}
      className="sticky top-0 z-20 border-b border-border bg-background/95 py-1.5 backdrop-blur"
    >
      {/* The rail's CONTENT is constrained to the SAME column as the question
          card. The strip used to start at the far left of the page while the
          question it controls sat 260px in the middle -- so the label and its
          control had no visible relationship, and the label was not really
          "visible" at all. The bar's background still spans the full width;
          only what is inside it is aligned. */}
      <div className="mx-auto w-full px-2">
        {/* The label, so the control says what it is. The chips are numbered
            circles, which reads as "tap me" -- but a strip of numbers with no
            name is a puzzle the first time. */}
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("quality.jumpToQuestion")}
        </p>

        <div
          className="mt-1.5 flex items-center gap-1.5 overflow-x-auto py-1.5 px-1"
          role="tablist"
          aria-label={t("quality.jumpToQuestion")}
        >
          {parameters.map((parameter, index) => {
            const state = states[index] || "todo";
            const isCurrent = index === current;
            return (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                aria-label={`${t("quality.question", { n: index + 1 })} — ${stateLabel(state)}`}
                title={`${index + 1}. ${parameter.parameter || ""}`}
                onClick={() => onSelect?.(index)}
                className={cn(
                  chipClass(state),
                  isCurrent &&
                    "outline outline-2 outline-primary outline-offset-1",
                )}
              >
                {index + 1}
              </button>
            );
          })}

          {/* The review is the position AFTER the last question -- not another
            screen. It sits in the rail so it is one tap away from anywhere. */}
          <button
            type="button"
            role="tab"
            aria-selected={onReview}
            aria-label={t("quality.reviewAnswers")}
            title={t("quality.reviewAnswers")}
            onClick={() => onSelect?.(total)}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
              onReview
                ? "bg-primary text-primary-foreground outline outline-2 outline-primary outline-offset-1"
                : "border border-border bg-card text-muted-foreground/60 hover:border-primary/40 hover:text-primary",
            )}
          >
            <ClipboardCheck className="size-4" />
          </button>
        </div>

        <p className="mt-1.5 text-xs text-muted-foreground">
          {onReview
            ? t("quality.reviewAnswers")
            : t("quality.questionOf", {
                current: current + 1,
                total,
              })}
          {remaining > 0
            ? ` · ${t("quality.inspectionRemaining", { count: remaining })}`
            : ""}
        </p>
      </div>
    </div>
  );
}
