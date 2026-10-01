import { Input } from "@/components/ui/input";

export default function FloatField({
  field,
  value,
  onChange,
  error,
  disabled = false,
}) {
  return (
    <div className="flex flex-col gap-1">
      <Input
        type="number"
        step="any"
        id={field.fieldname}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value ? parseFloat(e.target.value) : null)
        }
        disabled={disabled || field.read_only}
        aria-invalid={!!error}
      />
    </div>
  );
}
