export default function CheckboxField({
  field,
  value,
  onChange,
  error,
  disabled = false,
}) {
  return (
    <div aria-invalid={error ? true : undefined}>
      <label
        htmlFor={field.fieldname}
        className={`items-center gap-2 text-sm text-foreground ${
          disabled || field.read_only ? "cursor-not-allowed opacity-70" : "flex cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          id={field.fieldname}
          className="size-4 accent-[var(--brand-primary)]"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          disabled={disabled || field.read_only}
        />
        {field.label}
      </label>
    </div>
  );
}
