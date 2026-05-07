import AppModal from "../../AppModal";

function StockFixModal({ show, onClose, invalidItems, onRemove, onAdjust }) {
  return (
    <AppModal show={show} onClose={onClose} title="⚠ Stock Issue">
      <div className="mb-3">
        <strong>{invalidItems.length}</strong> items are out of stock.
      </div>

      <div className="mb-3 small text-muted">
        {invalidItems.slice(0, 5).map((i) => (
          <div key={i.code}>{i.code}</div>
        ))}
        {invalidItems.length > 5 && (
          <div>+ {invalidItems.length - 5} more...</div>
        )}
      </div>

      <div className="d-flex gap-2">
        <button className="btn btn-danger w-100" onClick={onRemove}>
          Remove Items
        </button>

        <button className="btn btn-warning w-100" onClick={onAdjust}>
          Adjust Qty
        </button>
      </div>
    </AppModal>
  );
}

export default StockFixModal;
