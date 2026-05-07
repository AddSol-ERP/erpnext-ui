function FieldRenderer({ type, value, onChange }) {
  switch (type) {
    case "number":
      return (
        <input
          type="number"
          className="form-control"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "select":
      return (
        <select
          className="form-select"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select</option>
          <option>Option 1</option>
          <option>Option 2</option>
        </select>
      );

    default:
      return (
        <input
          className="form-control"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export default FieldRenderer;
