export default function ActionTile({ tile, onClick }) {
  return (
    <div
      className="card h-100 cursor-pointer d-flex flex-column"
      onClick={() => onClick(tile)}
      style={{
        borderTop: `3px solid ${tile.color}`,
      }}
    >
      {/* HEADER */}
      <div className="d-flex align-items-start mb-3">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center me-3"
          style={{
            width: "50px",
            height: "50px",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <i
            className={tile.icon}
            style={{ color: tile.color, fontSize: "20px" }}
          />
        </div>

        <div>
          <div className="tile-title fw-semibold">{tile.title}</div>
          <div className="small text-muted mt-1">{tile.description}</div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="mt-auto d-flex justify-content-end">
        {tile.createRoute && (
          <button
            className="btn btn-primary btn-sm d-flex align-items-center justify-content-center"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onClick(tile, true);
            }}
          >
            <i className="bi bi-plus"></i>
          </button>
        )}
      </div>
    </div>
  );
}
