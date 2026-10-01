import { Textarea } from "@/components/ui/textarea";

export default function TextField({
  field,
  value,
  onChange,
  error,
  disabled = false,
}) {
  const isDisabled = disabled || field.read_only;
  return (
    <div className="flex flex-col gap-1">
      <Textarea
        id={field.fieldname}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || ""}
        rows={field.fieldtype === "Text" ? 4 : 2}
        readOnly={isDisabled}
        disabled={isDisabled}
        aria-invalid={!!error}
      />
    </div>
  );
}
