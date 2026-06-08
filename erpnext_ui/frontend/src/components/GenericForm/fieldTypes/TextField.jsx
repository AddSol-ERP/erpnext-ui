export default function TextField({ field, value, onChange, error }) {
  return (
    <div>
      <textarea
        className={`form-control ${error ? "is-invalid" : ""}`}
        id={field.fieldname}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || ""}
        rows={field.fieldtype === "Text" ? 4 : 2}
        readOnly={field.read_only}
        disabled={field.read_only}
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}
