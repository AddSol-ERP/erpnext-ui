import { useTranslation } from "react-i18next";
import { BasePreview } from "..";
import { Badge } from "@/components/ui/badge";

export default function LeavePreview({ doc }) {
  const { t } = useTranslation();

  return (
    <BasePreview>
      {/* HEADER */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {doc.employee_name || doc.employee}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.leave_type}
          </div>
        </div>

        <div className="shrink-0 text-end">
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
            {doc.workflow_state || doc.status}
          </Badge>
        </div>
      </div>

      {/* DATES */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            {t("approvals.preview.from")}
          </div>
          <div>{doc.from_date}</div>
        </div>

        <div>
          <div className="text-sm text-muted-foreground">
            {t("approvals.preview.to")}
          </div>
          <div>{doc.to_date}</div>
        </div>
      </div>

      {/* DAYS */}
      <div className="mb-3">
        <div className="text-sm text-muted-foreground">
          {t("approvals.preview.totalDays")}
        </div>
        <div className="font-semibold">{doc.total_leave_days}</div>
      </div>

      {/* REASON */}
      {doc.description && (
        <div className="mb-3">
          <div className="mb-1 font-semibold">
            {t("approvals.preview.reason")}
          </div>
          <div className="break-words text-sm text-muted-foreground">
            {doc.description}
          </div>
        </div>
      )}

      {/* OPTIONAL: LEAVE BALANCE */}
      {doc.leave_balance && (
        <div className="text-sm text-muted-foreground">
          {t("approvals.preview.balance", { value: doc.leave_balance })}
        </div>
      )}
    </BasePreview>
  );
}
