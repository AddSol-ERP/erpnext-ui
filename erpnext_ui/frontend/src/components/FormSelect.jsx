import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";
import { toSelectItems } from "../lib/selectItems";

const EMPTY = "__all__";

/**
 * Thin wrapper over shadcn/Radix Select for form usage.
 * - Controlled value (string); empty string maps to placeholder.
 * - options: string[] | [string, string][] | {value, label}[]
 *   (normalised by toSelectItems in lib/selectItems, which is unit-tested).
 * - Matches FormField controls (h-8 trigger, w-full).
 *
 * Note: Radix forbids value="" on SelectItem, so empty uses EMPTY sentinel.
 */
export default function FormSelect({
  value,
  onChange,
  options = [],
  placeholder,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}) {
  const items = toSelectItems(options);

  const normalized = value === "" || value == null ? EMPTY : value;

  return (
    <Select
      value={normalized}
      onValueChange={(v) => onChange?.(v === EMPTY ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn("h-8 w-full", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-72">
        {placeholder && (
          <SelectItem value={EMPTY} disabled={disabled}>
            {placeholder}
          </SelectItem>
        )}
        {items.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}