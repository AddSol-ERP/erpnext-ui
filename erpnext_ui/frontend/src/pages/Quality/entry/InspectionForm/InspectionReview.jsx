import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  Clock,
  ClipboardList,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ListRow } from "../../../../components/List/ListRow";
import StatCard from "../../../../components/StatCard";
import StatRow from "../../../../components/dashboard/StatRow";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { describeAnswer } from "../../../../lib/inspectionPaper";

/**
 * The review: every question, what was answered, and what came of it.
 *
 * It is the position AFTER the last question -- not a separate screen. The
 * user reaches it by answering down, or by tapping the last chip on the rail,
 * and it does the same job the old bottom-of-page "Final Result" card did,
 * except that it now also shows the WORK, so the user can check it before
 * submitting.
 *
 * Every row is tappable and jumps back to that question. That is the point:
 * the summary is not a report, it is the fastest way to fix the one reading
 * you are not happy with.
 */
export default function InspectionReview({
  parameters = [],
  states = [],
  progress,
  overallStatus,
  remarks,
  onRemarksChange,
  onJump,
  onBack,
  onSubmit,
  saving = false,
  disabled = false,
}) {
  const { t } = useTranslation();

  const verdictLabel =
    overallStatus === "Accepted"
      ? t("quality.statusAccepted")
      : overallStatus === "Rejected"
        ? t("quality.statusRejected")
        : t("quality.statusPending");

  const verdictColor =
    overallStatus === "Accepted"
      ? "var(--chart-2)"
      : overallStatus === "Rejected"
        ? "var(--chart-5)"
        : "var(--muted-foreground)";

  const VerdictIcon =
    overallStatus === "Accepted"
      ? CircleCheck
      : overallStatus === "Rejected"
        ? CircleX
        : Clock;

  return (
    <div className="mx-auto flex w-full flex-col gap-4 px-1 pt-1">
      <div>
        <h2 className="text-base font-semibold">
          {t("quality.reviewAnswers")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("quality.reviewHint")}
        </p>
      </div>

      {/* THE SCORE */}
      <StatRow>
        <StatCard
          value={progress.total}
          label={t("quality.questionCount")}
          icon={ClipboardList}
        />
        <StatCard
          value={progress.complete}
          label={t("quality.answered")}
          icon={CircleCheck}
          color="var(--chart-2)"
        />
        <StatCard
          value={progress.remaining}
          label={t("quality.stillToDo")}
          icon={Clock}
          color="var(--chart-4)"
        />
        <StatCard
          value={verdictLabel}
          label={t("quality.finalResult")}
          icon={VerdictIcon}
          color={verdictColor}
        />
      </StatRow>

      {/* THE WORK
          Its OWN scroll container. A review of forty questions must not turn
          the page into a ten-screen scroll with the Submit button at the
          bottom of it — the list scrolls, the page does not, and the verdict
          and the button stay where the user can reach them.

          `overscroll-contain` stops the scroll chaining: once the list hits
          its end, the wheel does not carry on into the page behind it. */}
      <div className="max-h-[40vh] overflow-y-auto overscroll-contain border border-border bg-card md:max-h-[55vh]">
        {parameters.map((parameter, index) => {
          const state = states[index] || "todo";
          const answer = describeAnswer(parameter);
          const answered = state !== "todo";

          return (
            <ListRow
              key={index}
              index={index + 1}
              className={cn(
                "cursor-pointer",
                !answered && "ring-2 ring-inset ring-amber-500/40",
              )}
              item={{
                title: parameter.parameter,
                subtitle: answer || t("quality.notAnswered"),
                statusLabel:
                  state === "accepted"
                    ? t("quality.statusAccepted")
                    : state === "rejected"
                      ? t("quality.statusRejected")
                      : state === "answered"
                        ? t("quality.answered")
                        : t("quality.notAnswered"),
                // The module's own convention: a pending reading is a NORMAL
                // state, not an alarm. The app's `statusTone` would colour it
                // amber, which is right for a document and wrong for a row.
                statusColor:
                  state === "accepted"
                    ? "complete"
                    : state === "rejected"
                      ? "danger"
                      : "open",
              }}
              onClick={() => onJump?.(index)}
            />
          );
        })}
      </div>

      {/* THE OVERALL REMARK */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("quality.inspectionRemarks")}
        </label>
        <Textarea
          rows={3}
          className="mt-1.5"
          value={remarks || ""}
          disabled={disabled}
          onChange={(event) => onRemarksChange?.(event.target.value)}
        />
      </div>

      {/* THE COMMIT */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={saving}
        >
          <ArrowLeft className="rtl:rotate-180" />
          {t("quality.backToQuestions")}
        </Button>

        <Button
          type="button"
          variant="default"
          onClick={onSubmit}
          disabled={saving || disabled}
        >
          {saving ? t("common.submitting") : t("quality.submitInspection")}
        </Button>
      </div>

      {progress.remaining > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {t("quality.stillToDoCount", { count: progress.remaining })}
        </p>
      ) : null}
    </div>
  );
}
