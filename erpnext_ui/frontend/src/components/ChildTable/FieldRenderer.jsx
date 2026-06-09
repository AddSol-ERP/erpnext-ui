import LinkField from "../LinkField";

function FieldRenderer({ type, value, options, onChange }) {
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
      const opts = typeof options === "string" ? options.split("\n") : [];
      return (
        <select
          className="form-select"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );

    case "checkbox":
      return (
        <div className="d-flex justify-content-center">
          <input
            type="checkbox"
            className="form-check-input"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          />
        </div>
      );

    case "link":
      return (
        <LinkField
          doctype={options}
          value={value}
          onChange={onChange}
          placeholder="Search..."
        />
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
