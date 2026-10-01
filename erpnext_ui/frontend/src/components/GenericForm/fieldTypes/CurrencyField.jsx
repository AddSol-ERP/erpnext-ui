import { Input } from "@/components/ui/input";

export default function CurrencyField({
  field,
  value,
  onChange,
  error,
  disabled = false,
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-8 items-center justify-center text-sm text-muted-foreground">
          ₹
        </span>
        <Input
          type="number"
          step="0.01"
          className="ps-8"
          id={field.fieldname}
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value ? parseFloat(e.target.value) : null)
          }
          disabled={disabled || field.read_only}
          aria-invalid={!!error}
        />
      </div>
    </div>
  );
}
