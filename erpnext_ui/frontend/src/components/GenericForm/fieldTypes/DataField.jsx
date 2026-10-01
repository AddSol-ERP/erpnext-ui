import { Input } from "@/components/ui/input";

export default function DataField({ field, value, onChange, error, disabled = false }) {
  const isDisabled = disabled || field.read_only;
  return (
    <div className="flex flex-col gap-1">
      <Input
        type="text"
        id={field.fieldname}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || ""}
        readOnly={field.is_virtual || isDisabled}
        disabled={isDisabled}
        aria-invalid={!!error}
      />
    </div>
  );
}
