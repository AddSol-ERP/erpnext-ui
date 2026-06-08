export default function CurrencyField({ field, value, onChange, error }) {
  return (
    <div>
      <div className="input-group">
        <span className="input-group-text">
          <i className="bi bi-currency-rupee"></i>
        </span>
        <input
          type="number"
          step="0.01"
          className={`form-control ${error ? "is-invalid" : ""}`}
          id={field.fieldname}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
          disabled={field.read_only}
        />
      </div>
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
