import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";
import { get } from "../../../../services/api";
import { useToast } from "../../../../context/ToastContext";
import AppModal from "../../../../components/AppModal";
import { StatusBadge } from "../../../../components/List/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { JOB_CARD_STATUS_UI, jobCardActionsFor } from "../../actions";
import {
  completeJobCard,
  pauseJobCard,
  resumeJobCard,
  startJobCard,
} from "../../jobActions";

/**
 * Chrome per action; the label comes from i18n at render time so an
 * admin-authored translation cannot drift from the button that fires it.
 */
const ACTION_STYLE = {
  start: "",
  pause: "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
  resume:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20",
  complete: "bg-emerald-600 text-white hover:bg-emerald-600/85",
};

const ACTION_LABEL_KEY = {
  start: "production.startJob",
  pause: "production.pauseJob",
  resume: "production.resumeJob",
  complete: "production.completeJob",
};

const DONE_TOAST_KEY = {
  start: "production.jobStartedToast",
  pause: "production.jobPausedToast",
  resume: "production.jobResumedToast",
};

export default function JobCardPreviewModal({ show, onClose, doc, onSuccess }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [fullDoc, setFullDoc] = useState(null);

  /** Complete is a two-step: the quantity is a measurement, so it is asked
   * for. This replaces the footer in place -- never a second dialog stacked
   * under this one (MEMORY §9.8e). */
  const [completing, setCompleting] = useState(false);
  const [qty, setQty] = useState("");

  const loadDoc = async () => {
    const res = await get(`resource/Job Card/${doc.name}`);
    setFullDoc(res.data);
  };

  useEffect(() => {
    if (show && doc) {
      // loadDoc only setStates after an awaited API response.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDoc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, doc]);

  /** Closing also dismisses the in-place quantity editor, so reopening the
   * card (or the next one) starts from the summary, not from a stale form. */
  const close = () => {
    setCompleting(false);
    setQty("");
    onClose();
  };

  /* ===============================
     ACTIONS
  ============================== */

  /**
   * Start / pause / resume only -- "complete" never comes here, because it
   * first asks for a quantity (see the footer). Every branch goes through
   * `jobActions.js`, which posts to `job_card.make_time_log`, the endpoint
   * desk itself uses. The previous version called `start_job` / `pause_job` /
   * `complete_job`, none of which exist in ERPNext v15, so all three buttons
   * failed with a generic "Action failed" (MEMORY §9.8q).
   */
  const handleAction = async (action) => {
    try {
      setLoading(true);

      if (action === "start") await startJobCard(doc.name);
      if (action === "pause") await pauseJobCard(doc.name);
      if (action === "resume") await resumeJobCard(doc.name);

      toast.success(t(DONE_TOAST_KEY[action]));
      await loadDoc();
      onSuccess && onSuccess();
      close();
    } catch (e) {
      // The server's own sentence ("Materials needs to be transferred to the
      // work in progress warehouse...") is what tells the operator what to do
      // next; the generic fallback hides it behind an unexplained failure.
      console.error(e);
      toast.error(e?.message || t("production.actionFailed"));
    } finally {
      setLoading(false);
    }
  };

  const outstanding = fullDoc
    ? Math.max(
        0,
        (fullDoc.for_quantity || 0) - (fullDoc.total_completed_qty || 0),
      )
    : 0;

  const parsedQty = qty.trim() === "" ? NaN : Number(qty);
  const qtyValid = Number.isFinite(parsedQty) && parsedQty >= 0;

  /** Seed the field with the outstanding quantity -- the case desk defaults
   * to too -- so "Complete" is one click for a full lot, and an override is
   * still one edit away. */
  const beginComplete = () => {
    setQty(String(outstanding));
    setCompleting(true);
  };

  const handleComplete = async () => {
    if (!qtyValid) return;
    try {
      setLoading(true);
      await completeJobCard(doc.name, parsedQty);
      toast.success(t("production.jobCompletedToast"));
      await loadDoc();
      onSuccess && onSuccess();
      close();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || t("production.actionFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     STATE LOGIC
  ============================== */

  // Driven by the shared matrix (actions.js), so this modal and the dashboard
  // can never disagree about which status offers which button. "On Hold" now
  // offers Resume -- it previously offered nothing, so a paused card had no
  // way back to work from this UI at all.
  const actions = fullDoc ? jobCardActionsFor(fullDoc.status) : [];

  /* ===============================
     STATUS BADGE
  ============================== */

  const statusUi = fullDoc
    ? JOB_CARD_STATUS_UI[fullDoc.status] || {
        labelKey: "production.statusUnknown",
        tone: "open",
      }
    : null;

  /* ===============================
     CALCULATIONS
  ============================== */

  const progress = fullDoc?.for_quantity
    ? Math.round((fullDoc.total_completed_qty / fullDoc.for_quantity) * 100)
    : 0;

  /* ===============================
     UI
  ============================== */

  const footer = completing ? (
    <div className="flex w-full gap-2">
      <Button
        variant="outline"
        className="flex-1"
        disabled={loading}
        onClick={() => setCompleting(false)}
      >
        {t("common.cancel")}
      </Button>
      <Button
        className="flex-1 bg-emerald-600 text-white hover:bg-emerald-600/85"
        disabled={loading || !qtyValid}
        onClick={handleComplete}
      >
        {loading ? t("production.processing") : t("production.completeConfirm")}
      </Button>
    </div>
  ) : (
    <div className="flex w-full gap-2">
      {actions.map((key) => (
        <Button
          key={key}
          variant={key === "start" || key === "resume" ? "default" : "outline"}
          className={`flex-1 ${ACTION_STYLE[key]}`}
          disabled={loading}
          onClick={() =>
            key === "complete" ? beginComplete() : handleAction(key)
          }
        >
          {loading ? t("production.processing") : t(ACTION_LABEL_KEY[key])}
        </Button>
      ))}
    </div>
  );

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("production.jobCardTitle", { name: doc?.name })}
      width="lg"
      footer={footer}
    >
      {!fullDoc ? (
        <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
          <Spinner className="size-4 text-primary" />
          {t("common.loading")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* STATUS HEADER */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-lg font-semibold">{fullDoc.operation}</div>
            {statusUi && (
              <StatusBadge tone={statusUi.tone}>
                {t(statusUi.labelKey)}
              </StatusBadge>
            )}
          </div>

          {/* WORK ORDER */}
          <div className="text-xs text-muted-foreground">
            {t("production.workOrder")}: {fullDoc.work_order}
          </div>

          {/* COMPLETE — the quantity question, in place of the summary's
              action footer rather than on top of it. */}
          {completing && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {t("production.completeJobFor", { name: fullDoc.name })}
              </div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="job-card-complete-qty"
              >
                {t("production.completedQty")}
              </label>
              <Input
                id="job-card-complete-qty"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                autoFocus
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <div className="mt-1 text-xs text-muted-foreground">
                {t("production.outstandingQty", { qty: outstanding })}
              </div>
              {!qtyValid && (
                <div className="mt-1 text-xs text-destructive">
                  {t("production.invalidQty")}
                </div>
              )}
            </div>
          )}

          {/* PROGRESS BAR */}
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>{t("production.progress")}</span>
              <span>
                {fullDoc.total_completed_qty || 0} /{" "}
                {fullDoc.for_quantity || 0}
              </span>
            </div>

            <Progress value={progress} className="h-2" />
          </div>

          {/* TIMER PLACEHOLDER */}
          {fullDoc.status === "Work In Progress" && (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Timer className="size-3.5" />
              {t("production.jobInProgress")}
            </div>
          )}
        </div>
      )}
    </AppModal>
  );
}
