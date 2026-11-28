import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";
import { get, post, uploadFile } from "../../../../services/api";
import { useToast } from "../../../../context/ToastContext";
import { useRole } from "../../../../context/RoleContext";
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
  const { userRoles, currentUser } = useRole();
  const [loading, setLoading] = useState(false);
  const [fullDoc, setFullDoc] = useState(null);
  const [approvalFiles, setApprovalFiles] = useState({});
  const [attachmentDetails, setAttachmentDetails] = useState({});
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [approvalNotes, setApprovalNotes] = useState({});

  /** Complete is a two-step: the quantity is a measurement, so it is asked
   * for. This replaces the footer in place -- never a second dialog stacked
   * under this one (MEMORY §9.8e). */
  const [completing, setCompleting] = useState(false);
  const [qty, setQty] = useState("");

  const loadDoc = async () => {
    const res = await get(`resource/Job Card/${doc.name}`);
    setFullDoc(res.data);
    let events = [];
    try {
      const history = await get("method/erpnext_ui.api.get_job_card_approval_history", { name: doc.name });
      events = history.message || [];
      setApprovalHistory(events);
      setHistoryError("");
    } catch (error) {
      setApprovalHistory([]);
      setHistoryError(error.message || t("production.approvalHistoryError"));
    }
    const names = [...new Set([...(res.data.custom_approval_rules || []).map((rule) => rule.approval_attachment), ...events.map((event) => event.attachment)].filter(Boolean))];
    const files = await Promise.all(names.map(async (name) => {
      try { return [name, (await get(`resource/File/${encodeURIComponent(name)}`)).data]; }
      catch { return [name, null]; }
    }));
    setAttachmentDetails(Object.fromEntries(files));
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
    setApprovalFiles({});
    setApprovalNotes({});
    setApprovalHistory([]);
    setHistoryError("");
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
  const approvalPending = !!fullDoc?.custom_approval_stage && !fullDoc?.custom_approval_by;
  const newRules = fullDoc?.custom_approval_rules || [];
  const canApprove = (role) => role === "All" ? !!currentUser && currentUser !== "Guest" : !!role && userRoles?.includes(role);
  const afterWorkRules = newRules.filter((rule) => rule.approval_point === "After Work");
  const logs = fullDoc?.time_logs || [];
  const workRecorded = logs.length > 0 && logs.every((row) => row.to_time) &&
    logs.reduce((total, row) => total + (Number(row.completed_qty) || 0), 0) + (Number(fullDoc?.process_loss_qty) || 0) >= Number(fullDoc?.for_quantity || 0);
  const blocked = (action) => (approvalPending && (fullDoc.custom_approval_stage === "Before Start" || action === "complete")) ||
    (["start", "resume"].includes(action) && (newRules.some((rule) => !rule.approved_by && rule.approval_point === "Before Start") || (workRecorded && afterWorkRules.length > 0)));
  const approve = async (ruleName) => {
    try {
      setLoading(true);
      const selectedFile = typeof ruleName === "string" ? approvalFiles[ruleName] : null;
      if (selectedFile) {
        const body = new FormData();
        body.append("name", doc.name);
        body.append("rule_name", ruleName);
        body.append("remark", approvalNotes[ruleName] || "");
        body.append("file", selectedFile);
        await uploadFile("method/erpnext_ui.api.approve_operation_job_card", body);
      } else {
        await post("method/erpnext_ui.api.approve_operation_job_card", { name: doc.name, rule_name: typeof ruleName === "string" ? ruleName : undefined, remark: approvalNotes[typeof ruleName === "string" ? ruleName : "legacy"] || "" });
      }
      if (typeof ruleName === "string") setApprovalFiles((current) => { const next = { ...current }; delete next[ruleName]; return next; });
      await loadDoc();
      onSuccess?.();
    } catch (e) {
      toast.error(e?.message || t("production.actionFailed"));
    } finally { setLoading(false); }
  };
  const release = async () => {
    try {
      setLoading(true);
      await post("method/erpnext_ui.api.release_operation_job_card", { name: doc.name });
      await loadDoc();
      onSuccess?.();
      close();
    } catch (e) { toast.error(e?.message || t("production.actionFailed")); }
    finally { setLoading(false); }
  };

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
          disabled={loading || blocked(key)}
          onClick={() =>
            key === "complete" ? beginComplete() : handleAction(key)
          }
        >
          {loading ? t("production.processing") : t(ACTION_LABEL_KEY[key])}
        </Button>
      ))}
      {!!afterWorkRules.length && workRecorded && Number(fullDoc?.docstatus) === 0 && <Button disabled={loading || newRules.some((rule) => !rule.approved_by)} onClick={release}>{t("production.releaseOperation")}</Button>}
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
          {!!afterWorkRules.length && workRecorded && newRules.some((rule) => !rule.approved_by) && <p role="status" className="text-sm font-semibold text-amber-700">{t("production.awaitingOperationApproval")}</p>}
          {(newRules.length > 0 || fullDoc.custom_approval_stage) && <h3 className="text-sm font-semibold">{t("production.operationApprovals")}</h3>}
          {newRules.map((rule) => <div key={rule.name} className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-semibold">{rule.approved_by ? t("production.approvalGranted") : t("production.approvalPending")} · {rule.approval_point} · {rule.perspective}</p>
            <p>{rule.instruction_snapshot || rule.instruction}</p>
            {rule.note && <p>{rule.note}</p>}
            <p>{t("production.approvalRole")}: {rule.approval_role}</p>
            {!rule.approved_by && Number(rule.attachment_required) === 1 && <p className="text-xs font-medium">{t("production.approvalAttachmentHelp")}</p>}
            {rule.approved_by && rule.approval_attachment && (attachmentDetails[rule.approval_attachment]?.file_url ? <a className="inline-block text-xs text-primary underline" href={attachmentDetails[rule.approval_attachment].file_url} target="_blank" rel="noreferrer">{t("production.approvalAttachment")}: {attachmentDetails[rule.approval_attachment].file_name}</a> : <p className="text-xs">{t("production.approvalAttachment")}: {rule.approval_attachment}</p>)}
            {!rule.approved_by && Number(rule.attachment_required) === 1 && <label className="block text-xs">{t("production.approvalAttachment")} *<Input type="file" className="mt-1" disabled={loading} onChange={(event) => setApprovalFiles((current) => ({ ...current, [rule.name]: event.target.files?.[0] || null }))} /></label>}
            {!rule.approved_by && canApprove(rule.approval_role) && <label className="block text-xs">{t("production.approvalTransactionNote")}<Input className="mt-1" maxLength={1000} value={approvalNotes[rule.name] || ""} disabled={loading} onChange={(event) => setApprovalNotes((current) => ({ ...current, [rule.name]: event.target.value }))} /></label>}
            {rule.approved_by ? <p>{t("production.approvedBy")}: {rule.approved_by} · {rule.approved_at}</p> :
              canApprove(rule.approval_role) && <Button type="button" size="sm" disabled={loading || (rule.approval_point === "After Work" && !workRecorded) || (Number(rule.attachment_required) === 1 && !approvalFiles[rule.name])} onClick={() => approve(rule.name)}>{t("production.approveOperation")}</Button>}
          </div>)}
          {fullDoc.custom_approval_stage && <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-semibold">{fullDoc.custom_approval_by ? t("production.approvalGranted") : t("production.approvalPending")} · {fullDoc.custom_approval_stage}</p>
            <p>{fullDoc.custom_approval_reason}</p>
            <p>{t("production.approvalRole")}: {fullDoc.custom_approval_role}</p>
            {!fullDoc.custom_approval_by && canApprove(fullDoc.custom_approval_role) && <label className="block text-xs">{t("production.approvalTransactionNote")}<Input className="mt-1" maxLength={1000} value={approvalNotes.legacy || ""} disabled={loading} onChange={(event) => setApprovalNotes((current) => ({ ...current, legacy: event.target.value }))} /></label>}
            {fullDoc.custom_approval_by ? <p>{t("production.approvedBy")}: {fullDoc.custom_approval_by} · {fullDoc.custom_approval_at}</p> :
              canApprove(fullDoc.custom_approval_role) && <Button type="button" size="sm" disabled={loading} onClick={approve}>{t("production.approveOperation")}</Button>}
          </div>}
          <section className="space-y-2 border-t border-border pt-3" aria-label={t("production.approvalHistory")}>
            <h3 className="text-sm font-semibold">{t("production.approvalHistory")}</h3>
            {historyError ? <p role="alert" className="text-xs text-destructive">{t("production.approvalHistoryError")}: {historyError}</p> : !approvalHistory.length ? <p className="text-xs text-muted-foreground">{t("production.noApprovalHistory")}</p> : approvalHistory.map((event) => <div key={event.name} className="rounded border border-border p-2 text-xs">
              <p className="font-medium">{event.instruction || t("production.approvalGranted")} · {event.approval_point}{event.perspective ? ` · ${event.perspective}` : ""}</p>
              <p>{t("production.approvedBy")}: {event.approved_by} · {event.approved_at} · {event.approval_role}</p>
              {event.remark && <p>{t("production.approvalTransactionNote")}: {event.remark}</p>}
              {event.attachment && (attachmentDetails[event.attachment]?.file_url ? <a className="text-primary underline" href={attachmentDetails[event.attachment].file_url} target="_blank" rel="noreferrer">{t("production.approvalAttachment")}: {attachmentDetails[event.attachment].file_name}</a> : <p>{t("production.approvalAttachment")}: {event.attachment}</p>)}
            </div>)}
          </section>
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
