import { useTranslation } from "react-i18next";

export default function ColorField({ field, value, onChange, disabled = false }) {
  const { t } = useTranslation();
  const color = /^#[\da-f]{6}$/i.test(value || "") ? value : "#000000";

  return (
    <div className="flex items-center gap-3">
      <input
        id={field.fieldname}
        type="color"
        value={color}
        aria-label={field.label || field.fieldname}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="size-11 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="font-mono text-sm text-muted-foreground">
        {value || color}
      </span>
      {value && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("")}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
        >
          {t("common.clear")}
        </button>
      )}
    </div>
  );
}
