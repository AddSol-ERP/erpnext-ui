import { useTranslation } from "react-i18next";
import FormSelect from "../../FormSelect";

export default function SelectField({
  field,
  value,
  onChange,
  error,
  disabled = false,
}) {
  const { t } = useTranslation();
  const options = field.options
    ? field.options.split("\n").map((o) => o.trim()).filter(Boolean)
    : [];

  return (
    <FormSelect
      id={field.fieldname}
      value={value || ""}
      onChange={onChange}
      disabled={disabled || field.read_only}
      placeholder={t("common.selectOption", { field: field.label })}
      options={options.map((opt) => ({ value: opt, label: opt }))}
      aria-invalid={!!error || undefined}
    />
  );
}
