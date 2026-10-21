import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FormField } from "../../../components/FormField";
import FormSelect from "../../../components/FormSelect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { defaultResponseConfig, updateConfigType } from "../../../lib/qualityResponse";

const TYPE_KEYS = [
  "numeric_range",
  "yes_no",
  "ok_not_ok",
  "pass_fail",
  "choices",
  "free_text",
  "formula_numeric",
  "formula_text",
  "exact_value",
];

export default function ResponseConfigEditor({ value, onChange, disabled = false }) {
  const { t } = useTranslation();
  const config = value || defaultResponseConfig();
  const setChoices = (choices) => onChange({ ...config, choices });

  return (
    <div className="space-y-3">
      <FormField label={t("quality.responseType")}>
        <FormSelect
          value={config.type}
          disabled={disabled}
          onChange={(type) => onChange(updateConfigType(config, type))}
          options={TYPE_KEYS.map((type) => [type, t(`quality.responseTypes.${type}`)])}
        />
      </FormField>

      {["yes_no", "ok_not_ok", "pass_fail", "choices"].includes(config.type) ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t("quality.possibleChoices")}</p>
            {config.type === "choices" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => setChoices([...(config.choices || []), { value: "", result: "Rejected" }])}
              >
                <Plus /> {t("quality.addChoice")}
              </Button>
            ) : null}
          </div>
          {(config.choices || []).map((choice, index) => (
            <div key={`${index}-${choice.value}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto] gap-2">
              <Input
                aria-label={t("quality.choiceValue", { n: index + 1 })}
                value={choice.value}
                disabled={disabled || config.type !== "choices"}
                onChange={(event) => {
                  const choices = [...config.choices];
                  choices[index] = { ...choice, value: event.target.value };
                  setChoices(choices);
                }}
                placeholder={t("quality.choiceValuePlaceholder")}
              />
              <FormSelect
                value={choice.result}
                disabled={disabled}
                onChange={(result) => {
                  const choices = [...config.choices];
                  choices[index] = { ...choice, result };
                  setChoices(choices);
                }}
                options={[
                  ["Accepted", t("quality.statusAccepted")],
                  ["Rejected", t("quality.statusRejected")],
                ]}
              />
              {config.type === "choices" ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("quality.removeChoice")}
                  disabled={disabled}
                  onClick={() => setChoices(config.choices.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              ) : <span />}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
