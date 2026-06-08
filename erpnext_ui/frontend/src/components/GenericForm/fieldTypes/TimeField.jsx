export default function TimeField({ field, value, onChange, error }) {
  return (
    <div>
      <input
        type="time"
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
