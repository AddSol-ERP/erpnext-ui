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

export default function PurchaseOrderPreview({ doc }) {
  const symbol = getCurrencySymbol(doc.currency);

  return (
    <BasePreview>
      {/* ================= HEADER ================= */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="fw-semibold">{doc.name}</div>
          <div className="small text-muted">{doc.supplier}</div>
          <div className="small text-muted">
            {doc.contact_mobile} · {doc.contact_email}
          </div>
        </div>

        <div className="text-end">
          <div className="small text-muted">{doc.transaction_date}</div>

          <span className="badge bg-warning text-dark">
            {doc.workflow_state || doc.status}
          </span>

          <div className="fw-bold mt-1">
            {symbol}
            {doc.rounded_total || doc.grand_total}
          </div>
        </div>
      </div>

      <div className="container-fluid px-0">
        <div className="row g-3">
          {/* LEFT */}
          <div className="col-12 col-md-7">
            <div
              style={{
                maxHeight: "60vh",
                overflowY: "auto",
                overflowX: "hidden",
              }}
            >
              <div className="fw-semibold mb-2">Items</div>

              <div className="d-flex flex-column gap-2">
                {doc.items?.map((i) => (
                  <div key={i.name} className="p-2 border rounded">
                    <div className="fw-semibold">{i.item_code}</div>

                    <div
                      className="small text-muted mb-1"
                      style={{ wordBreak: "break-word" }}
                      dangerouslySetInnerHTML={{ __html: i.description }}
                    />

                    <div className="small text-muted">
                      Project: {i.project || "-"}
                    </div>

                    <div className="d-flex justify-content-between small mt-1">
                      <span>
                        Qty: {i.qty} {i.uom || ""}
                      </span>

                      <span>
                        {symbol}
                        {i.rate} / {i.uom || ""}
                      </span>

                      <span className="fw-semibold">
                        {symbol}
                        {i.amount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="col-12 col-md-5">
            <div className="d-flex flex-column gap-3">
              {/* ADDRESS */}
              <div>
                <div className="fw-semibold small">Supplier</div>
                <div
                  className="small text-muted"
                  style={{ wordBreak: "break-word" }}
                  dangerouslySetInnerHTML={{
                    __html: doc.address_display || "-",
                  }}
                />
              </div>

              <div>
                <div className="fw-semibold small">Shipping</div>
                <div
                  className="small text-muted"
                  style={{ wordBreak: "break-word" }}
                  dangerouslySetInnerHTML={{
                    __html: doc.shipping_address_display || "-",
                  }}
                />
              </div>

              {/* TOTALS */}
              <div className="border-top pt-2">
                <div className="d-flex justify-content-between small">
                  <span>Sub Total</span>
                  <span>
                    {symbol}
                    {doc.net_total}
                  </span>
                </div>

                {doc.taxes?.map((t) => (
                  <div
                    key={t.name}
                    className="d-flex justify-content-between small"
                  >
                    <span>
                      {t.description} ({t.rate}%)
                    </span>
                    <span>
                      {symbol}
                      {t.tax_amount}
                    </span>
                  </div>
                ))}

                <div className="d-flex justify-content-between fw-bold mt-2">
                  <span>Total</span>
                  <span>
                    {symbol}
                    {doc.rounded_total || doc.grand_total}
                  </span>
                </div>
              </div>

              {/* PAYMENT */}
              {doc.payment_schedule?.length > 0 && (
                <div>
                  <div className="fw-semibold small mb-1">Payment</div>

                  {doc.payment_schedule.map((p) => (
                    <div
                      key={p.name}
                      className="d-flex justify-content-between small"
                    >
                      <span>{p.due_date}</span>
                      <span>
                        {symbol}
                        {p.payment_amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </BasePreview>
  );
}
