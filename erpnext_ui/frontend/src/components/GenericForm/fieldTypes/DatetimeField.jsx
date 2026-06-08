/**
 * Converts ERPNext datetime (YYYY-MM-DD HH:MM:SS) to/from
 * HTML datetime-local input format (YYYY-MM-DDTHH:MM).
 */
function toInput(val) {
  if (!val) return "";
  // "2024-01-15 14:30:00" → "2024-01-15T14:30"
  return val.replace(" ", "T").substring(0, 16);
}

function fromInput(val) {
  if (!val) return "";
  // "2024-01-15T14:30" → "2024-01-15 14:30:00"
  return val.replace("T", " ") + ":00";
}

export default function DatetimeField({ field, value, onChange, error }) {
  return (
    <div>
      <input
        type="datetime-local"
        className={`form-control ${error ? "is-invalid" : ""}`}
        id={field.fieldname}
        value={toInput(value)}
        onChange={(e) => onChange(fromInput(e.target.value))}
        disabled={field.read_only}
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
