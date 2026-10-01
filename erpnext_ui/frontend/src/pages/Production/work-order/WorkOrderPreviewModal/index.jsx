import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { get } from "../../../../services/api";
import AppModal from "../../../../components/AppModal";
import { Badge } from "@/components/ui/badge";

export default function WorkOrderPreviewModal({ show, onClose, doc }) {
  const { t } = useTranslation();
  const [fullDoc, setFullDoc] = useState(null);

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

  if (!fullDoc) return null;

  const statusLabel =
    fullDoc.status === "Completed"
      ? t("production.statusCompleted")
      : fullDoc.status === "In Process"
        ? t("production.statusInProgress")
        : fullDoc.status === "Not Started"
          ? t("common.open")
          : fullDoc.status;

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("production.workOrderTitle", { name: doc.name })}
      width="lg"
    >
      <div className="mb-2 font-semibold">{fullDoc.production_item}</div>

      <div className="mb-2 text-xs text-muted-foreground">
        {t("production.woQty", {
          produced: fullDoc.produced_qty || 0,
          total: fullDoc.qty || 0,
        })}
      </div>

      <Badge
        variant="outline"
        className="mb-3 bg-sky-500/15 text-sky-600 ring-sky-500/30"
      >
        {statusLabel}
      </Badge>

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
