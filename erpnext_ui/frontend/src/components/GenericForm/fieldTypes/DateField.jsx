import { Input } from "@/components/ui/input";

export default function DateField({
  field,
  value,
  onChange,
  error,
  disabled = false,
}) {
  return (
    <div className="flex flex-col gap-1">
      <Input
        type="date"
        id={field.fieldname}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || field.read_only}
        aria-invalid={!!error}
      />
    </div>
  );
}
