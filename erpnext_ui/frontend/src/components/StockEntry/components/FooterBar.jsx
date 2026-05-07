export default function FooterBar({ totalQty, submit }) {
  return (
    <div className="page-header d-flex justify-content-between">
      <div>
        Total Qty: <strong>{totalQty}</strong>
      </div>

      <button className="btn btn-primary" onClick={submit}>
        Submit Entry
      </button>
    </div>
  );
}
