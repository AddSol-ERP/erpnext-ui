export default function FloatField({ field, value, onChange, error }) {
  return (
    <div>
      <input
        type="number"
        step="any"
        className={`form-control ${error ? "is-invalid" : ""}`}
        id={field.fieldname}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        disabled={field.read_only}
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
