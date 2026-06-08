export default function SelectField({ field, value, onChange, error }) {
  const options = field.options
    ? field.options.split("\n").map((o) => o.trim()).filter(Boolean)
    : [];

  return (
    <div>
      <select
        className={`form-select ${error ? "is-invalid" : ""}`}
        id={field.fieldname}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={field.read_only}
      >
        <option value="">Select {field.label}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
