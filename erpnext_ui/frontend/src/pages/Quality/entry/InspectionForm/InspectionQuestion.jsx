import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FormField } from "../../../../components/FormField";
import FormSelect from "../../../../components/FormSelect";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import StatusChip from "./StatusChip";

/**
 * ONE question, the way a question paper shows one.
 *
 * The whole point is that this is the only thing on the screen: the parameter
 * name, what is required of it, and ONE big input to type into. The old
 * screen put all of them in a three-column grid, so a phone showed one card
 * per screen and a desktop showed a wall of them -- and the answer to "which
 * ones have I done?" was a scroll.
 *
 * The reading input is deliberately LARGE (`h-12 text-lg`, centred). A number
 * typed with one thumb on a phone deserves a target bigger than the app's
 * default `h-8` field, and centring it puts it under the thumb rather than at
 * the edge of the screen.
 */
export default function InspectionQuestion({
  parameter,
  index,
  status,
  disabled = false,
  remarkOpen = false,
  onRemarkChange,
  onToggleRemark,
  onReadingChange,
  onReadingValueChange,
  onManualStatusChange,
  onNext,
  onPrevious,
  isFirst = false,
  isLast = false,
}) {
  const { t } = useTranslation();

  const config = parameter.responseConfig || {};
  const type = config.type || "numeric_range";
  const values = parameter.values || [];

  const readingRefs = useRef([]);
  const primaryRef = useRef(null);

  /**
   * Put the caret in the reading that needs attention.
   *
   * Only on a pointer-sized screen. On a phone this would raise the keyboard
   * over the question the user has not read yet, and hide the criterion they
   * are answering against -- the opposite of comfortable. The desktop gets it
   * because there the keyboard is already open and the question is on screen.
   *
   * The width is read HERE rather than through a media-query hook, because
   * the check happens per question change and a hook's value would be a
   * render behind.
   */
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return;
    const target = readingRefs.current.find(Boolean) || primaryRef.current;
    target?.focus({ preventScroll: true });
  }, [index]);

  /**
   * Enter moves on.
   *
   * In a question with several readings it moves to the next EMPTY one, so
   * the readings are filled in order without reaching for the mouse. In a
   * single-reading question it moves to the next question.
   */
  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();

    if (values.length > 1) {
      const nextEmpty = values.findIndex(
        (value) => value === "" || value == null,
      );
      if (nextEmpty >= 0) {
        onReadingChange?.(nextEmpty, "");
        readingRefs.current[nextEmpty]?.focus({ preventScroll: true });
        return;
      }
    }
    onNext?.();
  };

  /* ---------------- the criterion, in plain words ---------------- */
  const criterion = (() => {
    if (type === "numeric_range") {
      return t("quality.mustBeBetween", {
        min: parameter.min_value,
        max: parameter.max_value,
      });
    }
    if (type === "exact_value") {
      return t("quality.mustBeValue", { value: parameter.value });
    }
    if (type === "formula_numeric") {
      return t("quality.formulaAppliesToReadings");
    }
    if (type === "formula_text") {
      return t("quality.formulaAppliesToResult");
    }
    return "";
  })();

  const formula =
    type === "formula_numeric" || type === "formula_text"
      ? parameter.acceptance_formula || t("quality.formulaShownOnTemplate")
      : "";

  return (
    <div className="mx-auto flex w-full flex-col gap-3 px-1 pt-1">
      {/* THE QUESTION */}
      <div className="border border-border bg-card px-5 py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold leading-snug">
              {parameter.parameter}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {t(`quality.responseTypes.${type}`)}
              {criterion ? ` · ${criterion}` : ""}
            </div>
          </div>
          <StatusChip status={status} />
        </div>

        {formula ? (
          <p className="mt-4 border-l-2 border-border py-0.5 pl-3 text-xs text-muted-foreground">
            {criterion}
            <br />
            <code className="font-mono">{formula}</code>
          </p>
        ) : null}

        {/* THE ANSWER
            Its own breathing room below the question: the answer is what the
            user is here for, and it should not be crowded against the text
            it is answering. */}
        <div className="mt-5">
          {type === "numeric_range" || type === "formula_numeric" ? (
            <div
              className={cn(
                "grid gap-2",
                values.length > 1
                  ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
                  : "grid-cols-1",
              )}
            >
              {values.map((value, vi) => (
                <div key={vi} className="space-y-1">
                  {values.length > 1 ? (
                    <span className="block text-[10px] font-medium tabular-nums text-muted-foreground">
                      {t("quality.reading", { n: vi + 1 })}
                    </span>
                  ) : null}
                  <Input
                    ref={(el) => {
                      readingRefs.current[vi] = el;
                      if (vi === 0) primaryRef.current = el;
                    }}
                    className={cn(
                      "text-center",
                      values.length > 1 ? "h-10" : "h-12 text-lg",
                    )}
                    type="number"
                    inputMode="decimal"
                    value={value}
                    disabled={disabled}
                    onKeyDown={handleKeyDown}
                    onChange={(event) =>
                      onReadingChange?.(vi, event.target.value)
                    }
                  />
                </div>
              ))}
            </div>
          ) : type === "free_text" ? (
            <Textarea
              rows={3}
              value={parameter.readingValue || ""}
              disabled={disabled}
              placeholder={t("quality.enterObservation")}
              onKeyDown={handleKeyDown}
              onChange={(event) => onReadingValueChange?.(event.target.value)}
            />
          ) : type === "formula_text" || type === "exact_value" ? (
            <Input
              ref={primaryRef}
              className="h-12 text-lg text-center"
              value={parameter.readingValue || ""}
              disabled={disabled}
              placeholder={t("quality.enterResult")}
              onKeyDown={handleKeyDown}
              onChange={(event) => onReadingValueChange?.(event.target.value)}
            />
          ) : (
            <FormField label={t("quality.readingValue")}>
              <FormSelect
                value={parameter.readingValue || ""}
                disabled={disabled}
                placeholder={t("quality.chooseResult")}
                onChange={(value) => onReadingValueChange?.(value)}
                options={(config.choices || []).map((choice) => [
                  choice.value,
                  choice.value,
                ])}
              />
            </FormField>
          )}
        </div>

        {/* A free-text reading is judged by a person, so the decision is a
            control of its own rather than something inferred from the note. */}
        {type === "free_text" ? (
          <div className="mt-3">
            <FormField label={t("quality.manualDecision")}>
              <FormSelect
                value={parameter.manualStatus || ""}
                disabled={disabled}
                placeholder={t("quality.chooseResult")}
                onChange={(value) => onManualStatusChange?.(value)}
                options={[
                  ["Accepted", t("quality.statusAccepted")],
                  ["Rejected", t("quality.statusRejected")],
                ]}
              />
            </FormField>
          </div>
        ) : null}

        {/* REMARK
            Behind a button. A remark is the exception, not the rule, and an
            always-open textarea on every question was most of the scrolling
            on a phone. */}
        <div className="mt-3">
          {remarkOpen ? (
            <>
              <FormField label={t("quality.parameterRemarks")}>
                <Textarea
                  rows={2}
                  value={parameter.remark || ""}
                  disabled={disabled}
                  placeholder={t("quality.parameterRemarksHint")}
                  onChange={(event) => onRemarkChange?.(event.target.value)}
                />
              </FormField>
              {!parameter.remark ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-0 text-muted-foreground"
                  onClick={onToggleRemark}
                >
                  {t("quality.hideRemark")}
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start px-0 text-muted-foreground"
              onClick={onToggleRemark}
            >
              <MessageSquarePlus />
              {t("quality.addRemark")}
            </Button>
          )}
        </div>
      </div>

      {/* THE WALK */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onPrevious}
          disabled={isFirst || disabled}
        >
          <ArrowLeft className="rtl:rotate-180" />
          {t("common.previous")}
        </Button>

        <Button
          type="button"
          variant="default"
          onClick={onNext}
          disabled={disabled}
        >
          {isLast ? t("quality.reviewAnswers") : t("common.next")}
          <ArrowRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
