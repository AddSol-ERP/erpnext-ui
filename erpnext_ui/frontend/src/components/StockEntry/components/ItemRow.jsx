export default function ItemRow({ item, updateQty, removeItem, updateUOM }) {
  const available = (item.stockQty || 0) - (item.reservedQty || 0);
  const isOver = item.qty > available;
  const isLow = available > 0 && item.qty > available * 0.7;

  const getStockClass = () => {
    if (available <= 0) return "text-danger";
    if (isOver) return "text-danger";
    if (isLow) return "text-warning";
    return "text-success";
  };

  return (
    <div className="list-row">
      <div className="list-col main">
        <div className="list-title">{item.name}</div>
        <div className="list-sub text-muted">{item.code}</div>
      </div>
      <div className="list-col main">
        <div className="text-start small">
          <div className={`fw-semibold ${getStockClass()}`}>
            {available} {item.stockUOM || item.uom}
          </div>

          <div className="text-muted">
            {available <= 0
              ? "Out of stock"
              : isOver
                ? "Exceeds stock"
                : isLow
                  ? "Low stock"
                  : "Available"}
          </div>

          {/* 🔥 NEW UX MESSAGE */}
          {item.stockMode === "strict" && (
            <>
              {available <= 0 && (
                <div className="text-danger small">Will be removed</div>
              )}

              {available > 0 && isOver && (
                <div className="text-warning small">
                  Will adjust to {available}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="list-col actions">
        <button
          className="btn-icon"
          onClick={() => updateQty(item.code, item.qty - 1)}
        >
          -
        </button>

        <input
          type="number"
          className="form-control"
          value={item.qty}
          onChange={(e) => updateQty(item.code, e.target.value)}
          style={{ width: "20%" }}
        />

        <select
          className="form-select form-select-sm"
          value={item.uom}
          onChange={(e) => updateUOM(item.code, e.target.value)}
          style={{ width: 80 }}
        >
          {(item.uomOptions || ["Nos"]).map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <button
          className="btn-icon"
          onClick={() => updateQty(item.code, item.qty + 1)}
        >
          +
        </button>

        <button className="btn-icon" onClick={() => removeItem(item.code)}>
          🗑
        </button>
      </div>
    </div>
  );
}
