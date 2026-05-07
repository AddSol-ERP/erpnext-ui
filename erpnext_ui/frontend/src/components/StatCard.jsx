export default function StatCard({ value, label, icon, color }) {
  return (
    <div className="card">
      <div className="d-flex align-items-center">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center me-3"
          style={{
            width: "42px",
            height: "42px",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <i className={`bi ${icon}`} style={{ color, fontSize: "18px" }} />
        </div>

        <div>
          <div className="fw-bold">{value}</div>
          <div className="small text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}
