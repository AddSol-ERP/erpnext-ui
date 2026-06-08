export default function IntField({ field, value, onChange, error }) {
  return (
    <div>
      <input
        type="number"
        step="1"
        className={`form-control ${error ? "is-invalid" : ""}`}
        id={field.fieldname}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
        disabled={field.read_only}
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
