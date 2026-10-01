import { Input } from "@/components/ui/input";

export default function IntField({
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
        step="1"
        id={field.fieldname}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value ? parseInt(e.target.value, 10) : null)
        }
        disabled={disabled || field.read_only}
        aria-invalid={!!error}
      />
    </div>
  );
}
