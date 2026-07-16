import { BasePreview } from "..";

export default function OvertimeLogPreview({ doc }) {
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

  return (
    <BasePreview>
      {/* HEADER */}
      <div className="d-flex justify-content-between mb-3">
        <div>
          <div className="fw-semibold">{doc.employee_name || doc.employee}</div>
          <div className="small text-muted">{doc.employee}</div>
        </div>

        <div className="text-end">
          <span
            className={`badge ${
              doc.status === "Approved"
                ? "bg-success"
                : doc.status === "Rejected"
                  ? "bg-danger"
                  : "bg-warning text-dark"
            }`}
          >
            {doc.status || "Draft"}
          </span>
        </div>
      </div>

      {/* OT HOURS */}
      <div className="mb-3">
        <div className="text-muted small">Overtime Hours</div>
        <div className="fw-semibold" style={{ fontSize: "1.25rem" }}>
          {doc.overtime_hours || 0} hrs
        </div>
      </div>

      {/* ATTENDANCE DATE */}
      <div className="mb-3">
        <div className="text-muted small">Attendance Date</div>
        <div>{doc.attendance_date || "—"}</div>
      </div>

      {/* SHIFT */}
      {doc.shift && (
        <div className="mb-3">
          <div className="text-muted small">Shift</div>
          <div>{doc.shift}</div>
        </div>
      )}

      {/* IN/OUT TIMES */}
      <div className="row mb-3">
        <div className="col-6">
          <div className="text-muted small">In Time</div>
          <div>{formatDateTime(doc.in_time)}</div>
        </div>

        <div className="col-6">
          <div className="text-muted small">Out Time</div>
          <div>{formatDateTime(doc.out_time)}</div>
        </div>
      </div>

      {/* ATTENDANCE LINK */}
      {doc.attendance && (
        <div className="mb-3">
          <div className="text-muted small">Attendance</div>
          <div>{doc.attendance}</div>
        </div>
      )}

      {/* REMARKS */}
      {doc.remarks && (
        <div className="mb-3">
          <div className="fw-semibold mb-1">Remarks</div>
          <div className="small text-muted">{doc.remarks}</div>
        </div>
      )}

      {/* APPROVAL INFO */}
      {doc.approved_by && (
        <div className="small text-muted">
          Approved by: {doc.approved_by}
          {doc.approval_date && ` on ${formatDateTime(doc.approval_date)}`}
        </div>
      )}
    </BasePreview>
  );
}
