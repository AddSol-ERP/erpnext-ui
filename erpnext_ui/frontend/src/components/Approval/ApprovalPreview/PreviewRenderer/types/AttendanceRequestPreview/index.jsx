import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { BasePreview } from "..";

export default function AttendanceRequestPreview({ doc }) {
  const { t } = useTranslation();

  return (
    <BasePreview title={doc.name} meta={t("approvals.preview.attendanceRequestApproval")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {doc.employee_name || doc.employee || "—"}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.reason || "—"}
          </div>
        </div>
        {doc.workflow_state ? <Badge variant="outline">{doc.workflow_state}</Badge> : null}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{t("approvals.preview.from")}</div>
          <div>{doc.from_date || "—"}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">{t("approvals.preview.to")}</div>
          <div>{doc.to_date || "—"}</div>
        </div>
      </div>

      {doc.half_day ? (
        <div className="mb-3 text-sm">
          {t("approvals.preview.halfDay")}: {doc.half_day_date || t("common.yes")}
        </div>
      ) : null}
      {doc.shift ? (
        <div className="mb-3 text-sm">
          <span className="text-muted-foreground">{t("approvals.preview.shift")}: </span>
          {doc.shift}
        </div>
      ) : null}
      {doc.explanation ? (
        <div>
          <div className="mb-1 font-semibold">{t("approvals.preview.reason")}</div>
          <div className="break-words text-sm text-muted-foreground">{doc.explanation}</div>
        </div>
      ) : null}
    </BasePreview>
  );
}
