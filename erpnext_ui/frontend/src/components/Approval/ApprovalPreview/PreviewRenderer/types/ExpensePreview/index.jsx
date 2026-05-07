import { BasePreview } from "..";

const getCurrencySymbol = (currency) => {
  const map = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "د.إ",
  };
  return map[currency] || currency || "";
};

export default function ExpensePreview({ doc }) {
  const symbol = getCurrencySymbol(doc.currency);

  return (
    <BasePreview>
      {/* ================= HEADER ================= */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="fw-semibold">{doc.name}</div>
          <div className="small text-muted">{doc.employee}</div>
          <div className="small text-muted">{doc.company}</div>
        </div>

        <div className="text-end">
          <div className="small text-muted">
            {doc.posting_date || doc.creation}
          </div>

          <span className="badge bg-warning text-dark">
            {doc.workflow_state || doc.approval_status || doc.status}
          </span>

          <div className="fw-bold mt-1">
            {symbol}
            {doc.total_claimed_amount}
          </div>
        </div>
      </div>

      {/* ================= EXPENSE LIST ================= */}
      <div
        style={{
          maxHeight: "55vh",
          overflowY: "auto",
          paddingRight: "6px",
        }}
      >
        <div className="fw-semibold mb-2">Expenses</div>

        <div className="d-flex flex-column gap-2">
          {doc.expenses?.map((e) => (
            <div key={e.name} className="p-2 border rounded">
              {/* TOP */}
              <div className="d-flex justify-content-between">
                <div className="fw-semibold">{e.expense_type}</div>
                <div className="fw-semibold">
                  {symbol}
                  {e.amount}
                </div>
              </div>

              {/* DETAILS */}
              <div className="small text-muted mt-1 d-flex flex-wrap gap-2">
                {e.expense_date && <span>📅 {e.expense_date}</span>}
                {e.project && <span>📁 {e.project}</span>}
              </div>

              {/* DESCRIPTION */}
              {e.description && (
                <div
                  className="small text-muted mt-1"
                  dangerouslySetInnerHTML={{ __html: e.description }}
                />
              )}

              {/* RECEIPT */}
              {e.receipt && (
                <div className="mt-1">
                  <a
                    href={e.receipt}
                    target="_blank"
                    rel="noreferrer"
                    className="small"
                  >
                    📎 View Receipt
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ================= TOTAL ================= */}
      <div className="border-top pt-2 mt-3">
        <div className="d-flex justify-content-between fw-bold">
          <span>Total Claimed</span>
          <span>
            {symbol}
            {doc.total_claimed_amount}
          </span>
        </div>
      </div>

      {/* ================= REMARKS ================= */}
      {doc.remark && (
        <div className="mt-3">
          <div className="fw-semibold small mb-1">Remarks</div>
          <div className="small text-muted">{doc.remark}</div>
        </div>
      )}
    </BasePreview>
  );
}
