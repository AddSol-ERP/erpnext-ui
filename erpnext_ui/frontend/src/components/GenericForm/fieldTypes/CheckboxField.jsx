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
        className={`flex min-h-8 items-center gap-2 text-sm text-foreground md:min-h-7 ${
          disabled || field.read_only ? "cursor-not-allowed opacity-70" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          id={field.fieldname}
          className="size-4 shrink-0 accent-[var(--brand-primary)]"
          checked={value === true || Number(value) === 1}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          disabled={disabled || field.read_only}
        />
        {field.label}
      </label>
    </div>
  );
}
