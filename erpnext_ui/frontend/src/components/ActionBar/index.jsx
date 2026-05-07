export default function ActionBar({
  onSearch,
  onFilter,
  onPrint,
  onExport,
  extra = null,
}) {
  return (
    <div className="action-bar d-flex align-items-center gap-2 flex-wrap">
      {/* SEARCH (FULL WIDTH FLEX) */}
      <div className="flex-grow-1">
        <input
          type="text"
          className="form-control action-search w-100"
          placeholder="Search..."
          onChange={(e) => onSearch && onSearch(e.target.value)}
        />
      </div>

      {/* ACTIONS */}
      <div className="d-flex align-items-center gap-2">
        {extra}

        <button className="btn btn-soft" onClick={onPrint}>
          <i className="bi bi-printer"></i>
        </button>

        <button className="btn btn-soft" onClick={onExport}>
          <i className="bi bi-download"></i>
        </button>

        <button className="btn btn-filter" onClick={onFilter}>
          <i className="bi bi-funnel"></i>
        </button>
      </div>
    </div>
  );
}
