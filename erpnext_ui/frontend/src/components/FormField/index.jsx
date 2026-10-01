import { cn } from "cn";

/**
 * FormField: label + control + optional hint/error.
 *
 * - `name` sets data-field so focusFirstError can target the control.
 * - `error` renders role="alert" text and marks the wrapper aria-invalid.
 * - `hint` renders helper text only when there is no error.
 * - Micro-label style: uppercase, letterspaced, semibold (premium form look).
 */
export function FormField({
  label,
  required = false,
  htmlFor,
  name,
  error,
  hint,
  children,
  className,
}) {
  // ERPNext meta can pass reqd as 0/1 — never render a raw number in JSX.
  const showRequired = Boolean(required);

  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      data-field={name}
      aria-invalid={error ? true : undefined}
    >
      {label && (
        <label
          htmlFor={htmlFor || name}
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {label}
          {showRequired && <span className="ms-1 text-destructive">*</span>}
        </label>
      )}
      {children}
      {!error && hint && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p
          role="alert"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
