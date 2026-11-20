import { useState } from "react";
import { useTranslation } from "react-i18next";
import { get } from "../../../services/api";
import AppModal from "../../../components/AppModal";
import { Button } from "@/components/ui/button";

export default function ProjectSalesItemPicker({ project, disabled, onSelect }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const show = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    setRows([]);
    try {
      const res = await get("method/erpnext_ui.api.get_project_bom_sales_items", { project });
      setRows(res.message || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  return <>
    <Button type="button" variant="outline" size="sm" disabled={disabled || !project} onClick={show}>{t("bomCreation.fromSalesOrder")}</Button>
    <AppModal show={open} onClose={() => setOpen(false)} title={t("bomCreation.fromSalesOrder")} width="lg">
      {loading && <p>{t("common.loading")}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!loading && !error && !rows.length && <p className="text-sm text-muted-foreground">{t("bomCreation.noSalesItems")}</p>}
      <div className="flex flex-col gap-2">{rows.map((row) => <button type="button" key={row.row} className="border border-border p-3 text-start hover:bg-muted focus-visible:outline-primary" onClick={() => { onSelect(row); setOpen(false); }}>
        <span className="block text-sm font-medium">{row.item_code} · {row.item_name}</span>
        <span className="block text-xs text-muted-foreground">{row.sales_order} · {row.qty} {row.uom}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{t("bomCreation.deliveryDate")}: {row.delivery_date || "—"}</span>
      </button>)}</div>
    </AppModal>
  </>;
}
