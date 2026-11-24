import LinkField from "../LinkField";
import FormSelect from "../FormSelect";
import { Input } from "@/components/ui/input";

/**
 * In-grid treatment for a cell control.
 *
 * The default Input/SelectTrigger border turns every row into a strip of
 * outlined boxes, which reads as a form rather than a data grid. In a cell the
 * control is invisible until it is touched: no border at rest, a faint one on
 * hover (the row tint alone doesn't say WHICH cell is editable), and the normal
 * ring on focus. `disabled:bg-transparent` keeps a read-only grid flat too —
 * otherwise a submitted document boxes every cell again; the dimmed text from
 * `disabled:opacity-50` is the read-only signal.
 */
const CELL_CLS =
  "border-transparent bg-transparent hover:border-input/60 dark:bg-transparent dark:hover:bg-transparent disabled:bg-transparent dark:disabled:bg-transparent";

function FieldRenderer({ type, value, options, onChange, disabled = false, cell = false }) {
  const cls = cell ? CELL_CLS : undefined;

  switch (type) {
    case "number":
      return (
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cls}
        />
      );

    case "select": {
      const opts = typeof options === "string" ? options.split("\n") : [];
      return (
        <FormSelect
          value={value ?? ""}
          onChange={onChange}
          placeholder="—"
          options={opts.map((o) => ({ value: o, label: o }))}
          disabled={disabled}
          className={cls}
        />
      );
    }

    case "checkbox":
      return (
        <div className="flex justify-center">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand-primary)]"
            checked={Number(value) === 1}
            onChange={(e) => onChange(e.target.checked ? 1 : 0)}
            disabled={disabled}
          />
        </div>
      );

    case "link":
      return (
        <LinkField
          doctype={options}
          value={value}
          onChange={onChange}
          placeholder="…"
          disabled={disabled}
          className={cls}
        />
      );

    default:
      return (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cls}
        />
      );
  }
}

export default FieldRenderer;
