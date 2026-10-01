import LinkField from "../../LinkField";

export default function LinkFieldWrapper({
  field,
  value,
  onChange,
  error,
  disabled = false,
}) {
  const isDisabled = disabled || field.read_only;
  return (
    <div className="flex flex-col gap-1" aria-invalid={error ? true : undefined}>
      <LinkField
        doctype={field.options}
        value={value || ""}
        onChange={(val) => onChange(val)}
        placeholder={`Search ${field.options || field.label}...`}
        disabled={isDisabled}
      />
    </div>
  );
}
