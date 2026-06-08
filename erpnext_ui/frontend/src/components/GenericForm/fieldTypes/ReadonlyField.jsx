export default function ReadonlyField({ field, value }) {
  return (
    <div>
      <input
        type="text"
        className="form-control bg-light"
        id={field.fieldname}
        value={value || ""}
        readOnly
        disabled
        tabIndex={-1}
      />
      <div className="text-muted small mt-1">
        {field.fieldname === "name" ? "System-generated ID" : "Read-only field"}
      </div>
    </div>
  );
}
