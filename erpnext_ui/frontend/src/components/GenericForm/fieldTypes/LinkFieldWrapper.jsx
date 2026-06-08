import LinkField from "../../LinkField";

export default function LinkFieldWrapper({ field, value, onChange, error }) {
  return (
    <div>
      <LinkField
        doctype={field.options}
        value={value || ""}
        onChange={(val) => onChange(val)}
        placeholder={`Search ${field.options || field.label}...`}
      />
      {error && (
        <div className="text-danger small mt-1">{error}</div>
      )}
    </div>
  );
}
