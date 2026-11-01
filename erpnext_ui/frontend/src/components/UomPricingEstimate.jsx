import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { get } from "../services/api";

// This display never writes to the row or uses the entered chargeable quantity.
export default function UomPricingEstimate({ row, side = "buying", readOnly = false }) {
  const { t } = useTranslation();
  const [result, setResult] = useState(null);
  const item = row?.item_code;
  const qty = row?.qty;
  useEffect(() => {
    if (readOnly || !item || !(Number(qty) > 0)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await get("method/erpnext_ui.api.get_uom_pricing_estimate", { item_code: item, doc_qty: qty, side });
        if (!cancelled) setResult({ item, qty, side, value: response.message });
      } catch {
        if (!cancelled) setResult({ item, qty, side, error: true });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [readOnly, item, qty, side]);

  let estimate;
  if (readOnly) {
    if (!row?.custom_pricing_uom) return null;
    let snapshot;
    try { snapshot = JSON.parse(row.custom_pricing_snapshot || "null"); } catch { /* Use the stored display field. */ }
    estimate = { enabled: true, pricing_uom: row.custom_pricing_uom,
      calculated_chargeable_qty: snapshot?.rule?.formula_mode === "Direct Entry" ? null : (snapshot?.calculated_chargeable_qty ?? (Number(row.custom_estimated_chargeable_qty) > 0 ? Number(row.custom_estimated_chargeable_qty) : null)) };
  } else {
    if (!item || !(Number(qty) > 0)) return null;
    if (result?.item !== item || result?.qty !== qty || result?.side !== side) return <p className="text-xs text-muted-foreground">{t("store.form.estimateLoading")}</p>;
    if (result.error) return <p className="text-xs text-destructive">{t("store.form.estimateFailed")}</p>;
    estimate = result.value;
    if (!estimate?.enabled) return null;
  }
  const baseline = estimate.calculated_chargeable_qty;
  const rate = row?.custom_rate_per_pricing_uom;
  const amount = baseline != null && rate !== "" && rate != null && Number.isFinite(Number(rate)) ? baseline * Number(rate) : null;
  return <div className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs" aria-live="polite">
    <div>{t("store.form.estimatedChargeableQty", { uom: estimate.pricing_uom })}: <strong className="tabular-nums">{baseline ?? t("store.form.noFormulaEstimate")}</strong></div>
    {amount != null && <div>{t("store.form.estimatedPricingAmount")}: <strong className="tabular-nums">{Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>}
    <p className="text-muted-foreground">{t("store.form.estimateFromItem")}</p>
  </div>;
}
