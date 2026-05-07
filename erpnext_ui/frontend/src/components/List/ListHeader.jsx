export function ListHeader({ onSearch }) {
  return (
    <div className="list-header d-flex justify-content-between align-items-center flex-wrap gap-2">
      <input
        type="text"
        className="form-control list-search"
        placeholder="Search..."
        onChange={(e) => onSearch(e.target.value)}
      />

      <div className="d-flex gap-2">
        <button className="btn btn-soft">Filter</button>
        <button className="btn btn-primary">+ New</button>
      </div>
    </div>
  );
}
