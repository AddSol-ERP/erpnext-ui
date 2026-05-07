export function FormField({ label, required = false, children }) {
  return (
    <div className="form-field">
      <label className="form-label">
        {label}
        {required && <span className="text-danger ms-1">*</span>}
      </label>

      {children}
    </div>
  );
}
