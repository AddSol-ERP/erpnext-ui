import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import AppModal from "../../../components/AppModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { get } from "../../../services/api";

export default function MaterialPicker({ show, onClose, rows, onChange, busy }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pane, setPane] = useState("search");
  const [editing, setEditing] = useState("");
  const [quantity, setQuantity] = useState("");
  const [adding, setAdding] = useState("");
  const selected = rows.filter((row) => row.item_code);

  useEffect(() => {
    if (!show) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      get("method/frappe.desk.search.search_link", { doctype: "Item", txt: query.trim(), page_length: 50,
        filters: JSON.stringify({ disabled: 0, is_stock_item: 1, has_variants: 0 }) })
        .then((response) => { if (active) setResults(response.message || []); })
        .catch(() => { if (active) { setResults([]); setError(t("manufacturing.materialLoadError")); } })
        .finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [show, query, t]);

  const add = async (code) => {
    setAdding(code); setError("");
    try {
      const response = await get(`resource/Item/${encodeURIComponent(code)}`);
      const item = response.data;
      onChange((current) => current.some((row) => row.item_code === code) ? current :
        [...current.filter((row) => row.item_code), { item_code: code, item_name: item.item_name, stock_uom: item.stock_uom, qty: 1 }]);
    } catch { setError(t("manufacturing.materialLoadError")); }
    finally { setAdding(""); }
  };
  const close = () => { setEditing(""); setPane("search"); onClose(); };
  return <AppModal show={show} onClose={close} title={t("manufacturing.chooseMaterials")} width="xl" contentClassName="h-[90dvh]" bodyClassName="flex flex-col overflow-hidden pb-6" preventOutsideClose footer={<>
    <span className="me-auto self-center text-sm text-muted-foreground" aria-live="polite">{t("manufacturing.selectedMaterials", { count: selected.length })}</span>
    <Button type="button" disabled={busy || !!adding || !!editing} onClick={close}>{t("common.done")}</Button>
  </>}>
    <div className="mb-3 flex gap-2 md:hidden"><Button type="button" size="sm" variant={pane === "search" ? "default" : "outline"} onClick={() => setPane("search")}>{t("manufacturing.findMaterials")}</Button><Button type="button" size="sm" variant={pane === "selected" ? "default" : "outline"} onClick={() => setPane("selected")}>{t("manufacturing.selectedMaterials", { count: selected.length })}</Button></div>
    <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
      <section className={`${pane === "search" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col md:flex`}>
        <h3 className="mb-2 text-sm font-semibold">{t("manufacturing.findMaterials")}</h3>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("manufacturing.searchMaterials")} aria-label={t("manufacturing.searchMaterials")} />
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto divide-y divide-border rounded-md border border-border">
          {loading ? <p className="p-3 text-sm text-muted-foreground">{t("common.loading")}</p> : results.length ? results.map((item) => {
            const picked = selected.some((row) => row.item_code === item.value);
            return <div key={item.value} className="flex items-center gap-2 p-2"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.value}</p>{item.description && <p className="break-words text-xs text-muted-foreground">{item.description}</p>}</div><Button type="button" size="icon-sm" variant="outline" disabled={picked || !!adding || busy} aria-label={t(picked ? "manufacturing.alreadyAdded" : "manufacturing.addMaterial")} title={t(picked ? "manufacturing.alreadyAdded" : "manufacturing.addMaterial")} onClick={() => add(item.value)}>{picked ? <Check /> : <Plus />}</Button></div>;
          }) : <p className="p-3 text-sm text-muted-foreground">{t("common.noResults")}</p>}
        </div>
      </section>
      <section className={`${pane === "selected" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col md:flex`}>
        <h3 className="mb-2 text-sm font-semibold">{t("manufacturing.selectedMaterials", { count: selected.length })}</h3>
        {!selected.length ? <p className="text-sm text-muted-foreground">{t("manufacturing.noSelectedMaterials")}</p> : <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border"><table className="w-full text-start text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="p-2 text-start">{t("manufacturing.item")}</th><th className="p-2 text-start">{t("manufacturing.materialQty")}</th><th className="p-2 text-start">{t("manufacturing.stockUom")}</th><th className="p-2"><span className="sr-only">{t("common.actions")}</span></th></tr></thead><tbody>{selected.map((row) => <tr key={row.item_code} className="border-t border-border"><td className="p-2 break-words">{row.item_code}</td><td className="p-2">{editing === row.item_code ? <Input type="number" min="0.001" step="any" aria-label={t("manufacturing.materialQty")} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-24" /> : row.qty}</td><td className="p-2">{row.stock_uom || "—"}</td><td className="p-2"><div className="flex gap-1">{editing === row.item_code ? <><Button type="button" size="icon-sm" variant="ghost" aria-label={t("common.save")} disabled={!Number.isFinite(Number(quantity)) || Number(quantity) <= 0} onClick={() => { onChange((current) => current.map((item) => item.item_code === row.item_code ? { ...item, qty: Number(quantity) } : item)); setEditing(""); }}><Check /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={t("common.cancel")} onClick={() => setEditing("")}><X /></Button></> : <><Button type="button" size="icon-sm" variant="ghost" aria-label={t("common.edit")} disabled={!!editing} onClick={() => { setEditing(row.item_code); setQuantity(String(row.qty)); }}><Pencil /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={t("common.remove")} disabled={!!editing} onClick={() => onChange((current) => current.filter((item) => item.item_code !== row.item_code))}><Trash2 /></Button></>}</div></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </AppModal>;
}
