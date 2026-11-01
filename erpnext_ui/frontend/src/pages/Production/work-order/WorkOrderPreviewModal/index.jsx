import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { get } from "../../../../services/api";
import { useToast } from "../../../../context/ToastContext";
import AppModal from "../../../../components/AppModal";
import { StatusBadge } from "../../../../components/List/StatusBadge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { WORK_ORDER_STATUS_UI, workOrderActionsFor } from "../../actions";
import {
  reopenWorkOrder,
  startNextJobCard,
  stopWorkOrder,
} from "../../jobActions";

/** Chrome per action; the label comes from i18n at render time. */
const ACTION_STYLE = {
  startNext: "bg-primary text-primary-foreground hover:bg-primary/90",
  stop: "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
  reopen:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20",
};

const ACTION_LABEL_KEY = {
  startNext: "production.startNextJob",
  stop: "production.stopOrder",
  reopen: "production.reopenOrder",
};

/**
 * Read-only preview of a Work Order's operations, plus the same stop / re-open
 * / start-next-job-card actions the dashboard rows offer.
 *
 * "Start next job" is what starting a Work ORDER means here: ERPNext has no WO
 * start -- its status is derived from stock movements and job cards, so
 * production begins when a job card begins (see `jobActions.startNextJobCard`).
 */
export default function WorkOrderPreviewModal({
  show,
  onClose,
  doc,
  onSuccess,
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [fullDoc, setFullDoc] = useState(null);
  const [busy, setBusy] = useState(null);

  const loadDoc = async () => {
    const res = await get(`resource/Work Order/${doc.name}`);
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

  const runAction = async (key) => {
    setBusy(key);
    try {
      if (key === "startNext") {
        const started = await startNextJobCard(doc.name);
        // Nothing ready: every remaining card is done or waiting on a later
        // operation. Throwing keeps one error path for both kinds of refusal.
        if (!started) throw new Error(t("production.noJobCardReady"));
        toast.success(t("production.startedCardToast", { name: started }));
      } else if (key === "stop") {
        await stopWorkOrder(doc.name);
        toast.success(t("production.woStoppedToast"));
      } else {
        await reopenWorkOrder(doc.name);
        toast.success(t("production.woReopenedToast"));
      }

      // Status is what changed, so the preview must show it before the
      // operator decides again.
      await loadDoc();
      onSuccess && onSuccess();
    } catch (e) {
      // The server's own sentence ("Transaction not allowed against stopped
      // Work Order") is the only explanation worth showing.
      console.error(e);
      toast.error(e?.message || t("production.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (!fullDoc) return null;

  const statusUi = WORK_ORDER_STATUS_UI[fullDoc.status] || {
    labelKey: "production.statusUnknown",
    tone: "open",
  };

  const actions = workOrderActionsFor(fullDoc.status);

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("production.workOrderTitle", { name: doc.name })}
      width="lg"
      footer={
        <div className="flex w-full gap-2">
          {actions.map((key) => (
            <Button
              key={key}
              variant={key === "startNext" ? "default" : "outline"}
              className={`flex-1 ${ACTION_STYLE[key]}`}
              disabled={busy !== null}
              onClick={() => runAction(key)}
            >
              {busy === key ? t("production.processing") : t(ACTION_LABEL_KEY[key])}
            </Button>
          ))}
        </div>
      }
    >
      <div className="mb-2 font-semibold">{fullDoc.production_item}</div>

      <div className="mb-2 text-xs text-muted-foreground">
        {t("production.woQty", {
          produced: fullDoc.produced_qty || 0,
          total: fullDoc.qty || 0,
        })}
      </div>

      <div className="mb-3">
        <StatusBadge tone={statusUi.tone}>{t(statusUi.labelKey)}</StatusBadge>
      </div>

      <div>
        <div className="mb-2 font-semibold">{t("production.operations")}</div>

        {(fullDoc.operations || []).map((op) => (
          <div
            key={op.name}
            className="mb-2 rounded-lg border border-border p-2"
          >
            <div className="font-semibold">{op.operation}</div>
            <div className="text-xs text-muted-foreground">
              {t("production.workstation", { name: op.workstation || "-" })}
            </div>
            <div className="text-xs">
              {op.completed_qty || 0} / {op.qty || 0}
            </div>
          </div>
        ))}
      </div>
    </AppModal>
  );
}
