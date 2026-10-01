import LinkField from "../LinkField";
import FormSelect from "../FormSelect";
import { Input } from "@/components/ui/input";

function FieldRenderer({ type, value, options, onChange, disabled = false }) {
  switch (type) {
    case "number":
      return (
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );

    case "select": {
      const opts = typeof options === "string" ? options.split("\n") : [];
      return (
        <FormSelect
          value={value || ""}
          onChange={onChange}
          placeholder="—"
          options={opts.map((o) => ({ value: o, label: o }))}
          disabled={disabled}
        />
      );
    }

    case "checkbox":
      return (
        <div className="flex justify-center">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand-primary)]"
            checked={!!value}
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
        />
      );

    default:
      return (
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
  }
}

export default FieldRenderer;
