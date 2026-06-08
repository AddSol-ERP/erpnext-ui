export default function DataField({ field, value, onChange, error }) {
  return (
    <div>
      <input
        type="text"
        className={`form-control ${error ? "is-invalid" : ""}`}
        id={field.fieldname}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || ""}
        readOnly={field.read_only || field.is_virtual}
        disabled={field.read_only}
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
