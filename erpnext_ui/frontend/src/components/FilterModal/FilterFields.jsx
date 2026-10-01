import { useTranslation } from "react-i18next";
import LinkField from "../LinkField";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "../FormField";
import { cn } from "cn";

const ALL = "__all__";

/**
 * Shared filter field body (select / date / link).
 * Parent owns values; this component reports the full next values object.
 */
export default function FilterFields({
  config,
  values = {},
  onValuesChange,
  className,
}) {
  const { t } = useTranslation();

  const update = (field, value) => {
    const next = { ...values };
    if (value === ALL || value == null || value === "") {
      delete next[field];
    } else {
      next[field] = value;
    }
    onValuesChange(next);
  };

  const filters = config?.filters || [];

  if (!filters.length) {
    return (
      <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
    );
  }

  return (
    <div className={cn("grid grid-cols-1 gap-3", className)}>
      {filters.map((f) => (
        <div key={f.field}>
          <FormField label={f.label}>
            {f.type === "select" && (
              <Select
                value={values?.[f.field] || ALL}
                onValueChange={(val) => update(f.field, val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("common.all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("common.all")}</SelectItem>
                  {(f.options || []).map((o) => {
                    const value = typeof o === "object" ? o.value : o;
                    const label = typeof o === "object" ? o.label : o;
                    return (
                      <SelectItem key={String(value)} value={String(value)}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

            {f.type === "date" && (
              <Input
                type="date"
                value={values?.[f.field] || ""}
                onChange={(e) => update(f.field, e.target.value)}
              />
            )}

            {f.type === "link" && (
              <LinkField
                doctype={f.doctype}
                value={values?.[f.field] || ""}
                onChange={(val) => update(f.field, val)}
                placeholder={`${t("common.selectOption", { field: f.label })}`}
              />
            )}
          </FormField>
        </div>
      ))}
    </div>
  );
}
