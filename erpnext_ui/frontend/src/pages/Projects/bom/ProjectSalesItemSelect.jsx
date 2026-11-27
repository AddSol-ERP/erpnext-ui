import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import FormSelect from "../../../components/FormSelect";
import { get } from "../../../services/api";

export default function ProjectSalesItemSelect({ project, value, disabled, onSelect }) {
  const { t } = useTranslation();
  const [result, setResult] = useState({ project: "", rows: [], error: false });
  useEffect(() => {
    let active = true;
    if (project) get("method/erpnext_ui.api.get_project_bom_sales_items", { project })
      .then((response) => { if (active) setResult({ project, rows: response.message || [], error: false }); })
      .catch(() => { if (active) setResult({ project, rows: [], error: true }); });
    return () => { active = false; };
  }, [project]);
  const loading = result.project !== project;
  const rows = loading ? [] : result.rows;
  const options = [...new Map(rows.map((row) => [row.item_code, { value: row.item_code, label: `${row.item_code} · ${row.item_name}` }])).values()];
  const existingOutsideOrders = !loading && value && !options.some((option) => option.value === value);
  if (value && !options.some((option) => option.value === value)) options.unshift({ value, label: value });
  return <div className="space-y-1">
    <FormSelect id="item" value={value || ""} disabled={disabled || loading || result.error} placeholder={t("bomCreation.selectProjectItem")} options={options}
      onChange={(code) => onSelect(rows.find((row) => row.item_code === code))} />
    {!loading && result.error && <p role="alert" className="text-xs text-destructive">{t("bomCreation.projectItemsLoadFailed")}</p>}
    {existingOutsideOrders && !result.error && <p className="text-xs text-muted-foreground">{t("bomCreation.existingItemOutsideOrders")}</p>}
    {!loading && !result.error && !rows.length && <p className="text-xs text-muted-foreground">{t("bomCreation.noSalesItems")}</p>}
  </div>;
}
