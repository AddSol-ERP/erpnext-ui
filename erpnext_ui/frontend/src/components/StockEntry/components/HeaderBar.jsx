export default function HeaderBar({
  scan,
  setScan,
  handleScan,
  mode,
  setMode,
}) {
  return (
    <div className="page-header d-flex gap-2">
      <input
        className="form-control"
        placeholder="🔍 Scan or enter item"
        value={scan}
        onChange={(e) => setScan(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleScan(scan);
          }
        }}
        autoFocus
      />

      <select
        className="form-select"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="incoming">Incoming</option>
        <option value="outgoing">Outgoing</option>
        <option value="transfer">Transfer</option>
        <option value="adjustment">Adjustment</option>
      </select>
    </div>
  );
}
