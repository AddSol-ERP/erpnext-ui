import { useTranslation } from "react-i18next";
import { BasePreview } from "..";
import { Badge } from "@/components/ui/badge";

export default function OvertimeLogPreview({ doc }) {
  const { t } = useTranslation();

  const formatDateTime = (dt) => {
    if (!dt) return "—";
    try {
      return new Date(dt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dt;
    }
  };

  const statusBadge =
    doc.status === "Approved"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : doc.status === "Rejected"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/15 text-amber-600 dark:text-amber-400";

  return (
    <BasePreview>
      {/* HEADER */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {doc.employee_name || doc.employee}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.employee}
          </div>
        </div>

        <div className="shrink-0 text-end">
          <Badge className={statusBadge}>
            {doc.status || t("approvals.status.draft")}
          </Badge>
        </div>
      </div>

      {/* OT HOURS */}
      <div className="mb-3">
        <div className="text-sm text-muted-foreground">
          {t("approvals.preview.overtimeHours")}
        </div>
        <div className="text-xl font-semibold">
          {t("approvals.preview.hours", { hours: doc.overtime_hours || 0 })}
        </div>
      </div>

      {/* ATTENDANCE DATE */}
      <div className="mb-3">
        <div className="text-sm text-muted-foreground">
          {t("approvals.preview.attendanceDate")}
        </div>
        <div>{doc.attendance_date || "—"}</div>
      </div>

      {/* SHIFT */}
      {doc.shift && (
        <div className="mb-3">
          <div className="text-sm text-muted-foreground">
            {t("approvals.preview.shift")}
          </div>
          <div>{doc.shift}</div>
        </div>
      )}

      {/* IN/OUT TIMES */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            {t("approvals.preview.inTime")}
          </div>
          <div>{formatDateTime(doc.in_time)}</div>
        </div>

        <div>
          <div className="text-sm text-muted-foreground">
            {t("approvals.preview.outTime")}
          </div>
          <div>{formatDateTime(doc.out_time)}</div>
        </div>
      </div>

      {/* ATTENDANCE LINK */}
      {doc.attendance && (
        <div className="mb-3">
          <div className="text-sm text-muted-foreground">
            {t("approvals.preview.attendance")}
          </div>
          <div>{doc.attendance}</div>
        </div>
      )}

      {/* REMARKS */}
      {doc.remarks && (
        <div className="mb-3">
          <div className="mb-1 font-semibold">
            {t("approvals.preview.remarks")}
          </div>
          <div className="break-words text-sm text-muted-foreground">
            {doc.remarks}
          </div>
        </div>
      )}

      {/* APPROVAL INFO */}
      {doc.approved_by && (
        <div className="text-sm text-muted-foreground">
          {doc.approval_date
            ? t("approvals.preview.approvedByOn", {
                name: doc.approved_by,
                date: formatDateTime(doc.approval_date),
              })
            : t("approvals.preview.approvedBy", { name: doc.approved_by })}
        </div>
      )}
    </BasePreview>
  );
}
