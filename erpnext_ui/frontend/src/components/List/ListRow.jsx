export function ListRow({ item }) {
  return (
    <div className="list-row">
      {/* LEFT */}
      <div className="list-col main">
        <div className="list-title">{item.title}</div>
        <div className="list-sub text-muted">{item.subtitle}</div>
      </div>

      {/* MIDDLE (DESKTOP ONLY) */}
      <div className="list-col meta d-none d-md-block">{item.meta}</div>

      {/* RIGHT */}
      <div className="list-col actions">
        <span className={`badge status-${item.status}`}>{item.status}</span>

        <button className="btn btn-icon">
          <i className="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}
