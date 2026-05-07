import { BasePreview } from "..";

export default function LeavePreview({ doc }) {
  return (
    <BasePreview>
      {/* HEADER */}
      <div className="d-flex justify-content-between mb-3">
        <div>
          <div className="fw-semibold">{doc.employee_name || doc.employee}</div>
          <div className="small text-muted">{doc.leave_type}</div>
        </div>

        <div className="text-end">
          <span className="badge bg-warning text-dark">
            {doc.workflow_state || doc.status}
          </span>
        </div>
      </div>

      {/* DATES */}
      <div className="row mb-3">
        <div className="col-6">
          <div className="text-muted small">From</div>
          <div>{doc.from_date}</div>
        </div>

        <div className="col-6">
          <div className="text-muted small">To</div>
          <div>{doc.to_date}</div>
        </div>
      </div>

      {/* DAYS */}
      <div className="mb-3">
        <div className="text-muted small">Total Days</div>
        <div className="fw-semibold">{doc.total_leave_days}</div>
      </div>

      {/* REASON */}
      {doc.description && (
        <div className="mb-3">
          <div className="fw-semibold mb-1">Reason</div>
          <div className="small text-muted">{doc.description}</div>
        </div>
      )}

      {/* OPTIONAL: LEAVE BALANCE */}
      {doc.leave_balance && (
        <div className="small text-muted">Balance: {doc.leave_balance}</div>
      )}
    </BasePreview>
  );
}
