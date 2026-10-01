import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";
import { get, post } from "../../../../services/api";
import { useToast } from "../../../../context/ToastContext";
import AppModal from "../../../../components/AppModal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

export default function JobCardPreviewModal({ show, onClose, doc, onSuccess }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [fullDoc, setFullDoc] = useState(null);

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

  /* ===============================
     ACTIONS
  ============================== */

  const handleAction = async (action) => {
    try {
      setLoading(true);

      if (action === "start") {
        await post(
          "method/erpnext.manufacturing.doctype.job_card.job_card.start_job",
          { job_card: doc.name },
        );
      }

      if (action === "complete") {
        await post(
          "method/erpnext.manufacturing.doctype.job_card.job_card.complete_job",
          { job_card: doc.name },
        );
      }

      if (action === "pause") {
        await post(
          "method/erpnext.manufacturing.doctype.job_card.job_card.pause_job",
          { job_card: doc.name },
        );
      }

      onSuccess && onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(t("production.actionFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     STATE LOGIC
  ============================== */

  const getActions = () => {
    if (!fullDoc) return [];

    const status = fullDoc.status;

    if (status === "Open") {
      return [
        {
          key: "start",
          label: t("production.startJob"),
          variant: "default",
          className: "",
        },
      ];
    }

    if (status === "Work In Progress") {
      return [
        {
          key: "pause",
          label: t("production.pauseJob"),
          variant: "outline",
          className:
            "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
        },
        {
          key: "complete",
          label: t("production.completeJob"),
          variant: "default",
          className: "bg-emerald-600 text-white hover:bg-emerald-600/85",
        },
      ];
    }

    return [];
  };

  const actions = getActions();

  /* ===============================
     STATUS BADGE
  ============================== */

  const statusLabel = (() => {
    if (!fullDoc) return "";
    if (fullDoc.status === "Work In Progress")
      return t("production.statusInProgress");
    if (fullDoc.status === "Open") return t("common.open");
    if (fullDoc.status === "Completed") return t("production.statusCompleted");
    return fullDoc.status;
  })();

  const statusClass = (() => {
    if (!fullDoc) return "";
    if (fullDoc.status === "Work In Progress")
      return "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30";
    if (fullDoc.status === "Open")
      return "bg-amber-500/15 text-amber-600 ring-amber-500/30";
    return "bg-muted text-muted-foreground ring-border";
  })();

  /* ===============================
     CALCULATIONS
  ============================== */

  const progress = fullDoc?.for_quantity
    ? Math.round((fullDoc.total_completed_qty / fullDoc.for_quantity) * 100)
    : 0;

  /* ===============================
     UI
  ============================== */

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("production.jobCardTitle", { name: doc?.name })}
      width="lg"
      footer={
        <div className="flex w-full gap-2">
          {actions.map((a) => (
            <Button
              key={a.key}
              variant={a.variant}
              className={`flex-1 ${a.className}`}
              disabled={loading}
              onClick={() => handleAction(a.key)}
            >
              {loading ? t("production.processing") : a.label}
            </Button>
          ))}
        </div>
      }
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
            <Badge variant="outline" className={statusClass}>
              {statusLabel}
            </Badge>
          </div>

          {/* WORK ORDER */}
          <div className="text-xs text-muted-foreground">
            {t("production.workOrder")}: {fullDoc.work_order}
          </div>

          {/* PROGRESS BAR */}
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>{t("production.progress")}</span>
              <span>
                {fullDoc.total_completed_qty || 0} / {fullDoc.for_quantity || 0}
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
