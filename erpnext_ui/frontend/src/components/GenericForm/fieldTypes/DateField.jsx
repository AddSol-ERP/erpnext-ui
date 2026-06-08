export default function DateField({ field, value, onChange, error }) {
  return (
    <div>
      <input
        type="date"
        className={`form-control ${error ? "is-invalid" : ""}`}
        id={field.fieldname}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={field.read_only}
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
