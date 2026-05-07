export default function StockEntryTypeSelector({
  types,
  selectedType,
  setSelectedType,
}) {
  if (!types?.length) return null;

  return (
    <div className="">
      <label className="form-label">Entry Type</label>
      <select
        className="form-select"
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
      >
        <option value="">Select Entry Type</option>

        {types.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
