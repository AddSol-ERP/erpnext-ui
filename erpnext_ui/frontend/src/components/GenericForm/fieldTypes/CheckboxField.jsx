export default function CheckboxField({ field, value, onChange, error }) {
  return (
    <div>
      <div className="form-check">
        <input
          type="checkbox"
          className={`form-check-input ${error ? "is-invalid" : ""}`}
          id={field.fieldname}
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          disabled={field.read_only}
        />
        <label className="form-check-label" htmlFor={field.fieldname}>
          {field.label}
        </label>
      </div>
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
