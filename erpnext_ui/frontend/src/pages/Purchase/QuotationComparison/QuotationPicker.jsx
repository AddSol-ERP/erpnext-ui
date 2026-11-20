import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import LinkField from "../../../components/LinkField";
import { getMethod } from "../../../services/api";
import AnalysisMarkdown from "./AnalysisMarkdown";

const LINK_FILTERS = [
  ["company", "Company", "Company"], ["supplier", "Supplier", "Supplier"],
  ["project", "Project", "Project"], ["material_request", "Material Request", "Material Request"],
  ["request_for_quotation", "Request for Quotation", "Request for Quotation"],
];
const EMPTY = { company: "", supplier: "", project: "", material_request: "", request_for_quotation: "", status: "", date_from: "", date_to: "" };

export default function QuotationPicker({ initialNames, onApply, onCancel }) {
  const [filters, setFilters] = useState(EMPTY);
  const [selected, setSelected] = useState(initialNames);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchedFilters, setSearchedFilters] = useState(null);
  const [history, setHistory] = useState(null);
  const [historical, setHistorical] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadHistory = async () => {
    setHistoryLoading(true); setError("");
    try { const response = await getMethod("method/erpnext_ui.quotation_comparison.list_evaluations"); setHistory(response); }
    catch (err) { setError(err.message || "Unable to load saved comparisons."); }
    finally { setHistoryLoading(false); }
  };
  const openHistory = async (name) => {
    setHistoryLoading(true); setError("");
    try { const response = await getMethod("method/erpnext_ui.quotation_comparison.get_evaluation", { name }); setHistorical(response); }
    catch (err) { setError(err.message || "Unable to open this comparison."); }
    finally { setHistoryLoading(false); }
  };
  const setFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value || "" }));
  const search = async (nextPage = 0, applied = filters) => {
    setLoading(true); setError("");
    try {
      const data = await getMethod("method/erpnext_ui.quotation_comparison.search_quotations", { ...applied, page: nextPage });
      setResult(data); setPage(nextPage); setSearchedFilters({ ...applied });
    } catch (err) { setError(err.message || "Unable to search quotations."); }
    finally { setLoading(false); }
  };
  const toggle = (name) => setSelected((current) => current.includes(name) ? current.filter((item) => item !== name) : current.length < 20 ? [...current, name] : current);
  return <div className="space-y-4 rounded-lg border border-border bg-card p-4">
    <div><h2 className="text-base font-semibold">Choose quotations to compare</h2><p className="text-sm text-muted-foreground">Start with any filters, then select 2 to 20 quotations from the same company. You can search again to add more.</p></div>
    <div><Button size="sm" variant="outline" onClick={loadHistory} disabled={historyLoading}>{historyLoading ? "Loading…" : "Show saved comparisons"}</Button></div>
    {history && <section className="space-y-2 rounded-lg border border-border p-3"><h3 className="text-sm font-semibold">Saved comparisons</h3>{history.length ? <div className="max-h-48 overflow-auto divide-y divide-border">{history.map((entry) => <div key={entry.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{entry.name} · {entry.company} · {entry.evaluation_date} · {entry.quotation_count} quotations {entry.has_ai_analysis ? "· AI summary saved" : ""}</span><Button variant="outline" size="sm" disabled={historyLoading} onClick={() => openHistory(entry.name)}>View</Button></div>)}</div> : <p className="text-xs text-muted-foreground">No accessible saved comparisons found.</p>}</section>}
    {historical && <section className="space-y-3 rounded-lg border border-border p-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold">{historical.name}</h3><p className="text-xs text-muted-foreground">Saved comparison · {historical.snapshot.evaluation_date} · {historical.snapshot.company}</p></div><Button variant="ghost" size="sm" onClick={() => setHistorical(null)}>Close</Button></div><div className="grid gap-2 sm:grid-cols-2">{historical.snapshot.quotations.map((quote) => <div key={quote.name} className="rounded-lg bg-muted/50 p-3 text-sm"><strong>{quote.supplier}</strong><p className="text-xs text-muted-foreground">{quote.name}</p><p>{quote.currency} {quote.grand_total}</p></div>)}</div>{historical.analysis ? <div className="border-t border-border pt-3"><h4 className="mb-3 font-semibold">Saved AI summary</h4><AnalysisMarkdown text={historical.analysis} /></div> : <p className="text-xs text-muted-foreground">No AI summary was saved with this comparison.</p>}</section>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{LINK_FILTERS.map(([field, label, doctype]) => <label key={field} className="space-y-1 text-xs font-medium"><span>{label}</span><LinkField doctype={doctype} value={filters[field]} onChange={(value) => setFilter(field, value)} placeholder={`Any ${label.toLowerCase()}`} /></label>)}
      <label className="space-y-1 text-xs font-medium"><span>Status</span><select className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" value={filters.status} onChange={(event) => setFilter("status", event.target.value)}><option value="">Any status</option>{["Draft", "Submitted", "Expired", "Stopped", "Cancelled"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="space-y-1 text-xs font-medium"><span>From date</span><Input type="date" value={filters.date_from} onChange={(event) => setFilter("date_from", event.target.value)} /></label>
      <label className="space-y-1 text-xs font-medium"><span>To date</span><Input type="date" value={filters.date_to} onChange={(event) => setFilter("date_to", event.target.value)} /></label>
    </div>
    <p className="text-xs text-muted-foreground">Project, Material Request and RFQ filters match quotation item links; when combined, they must match the same item line.</p>
    <div className="flex flex-wrap items-center gap-2"><Button onClick={() => search()} disabled={loading}>{loading ? "Searching…" : "Find quotations"}</Button><Button variant="ghost" onClick={() => { setFilters(EMPTY); setResult(null); setSearchedFilters(null); setError(""); }} disabled={loading}>Clear filters</Button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="space-y-2"><div className="text-sm font-medium">Selected quotations ({selected.length}/20)</div>{selected.length ? <div className="flex flex-wrap gap-2">{selected.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">{name}<button type="button" className="rounded px-1 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove ${name}`} onClick={() => toggle(name)}>×</button></span>)}</div> : <p className="text-xs text-muted-foreground">No quotations selected yet. Find quotations using the filters above.</p>}</div>
    {result && <div className="space-y-2"><div className="max-h-80 overflow-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="sticky top-0 bg-table-header"><tr><th className="px-3 py-2 text-start">Select</th><th className="px-3 py-2 text-start">Quotation / supplier</th><th className="px-3 py-2 text-start">Company</th><th className="px-3 py-2 text-start">Date / status</th><th className="px-3 py-2 text-end">Total</th></tr></thead><tbody className="divide-y divide-border">{result.quotations.map((row) => <tr key={row.name}><td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.includes(row.name)} disabled={!selected.includes(row.name) && selected.length >= 20} onChange={() => toggle(row.name)} /></td><td className="px-3 py-2"><div className="font-medium">{row.supplier}</div><div className="text-xs text-muted-foreground">{row.name}</div></td><td className="px-3 py-2">{row.company}</td><td className="px-3 py-2">{row.transaction_date} · {row.docstatus === 1 ? "Submitted" : row.docstatus === 2 ? "Cancelled" : "Draft"}</td><td className="px-3 py-2 text-end tabular-nums">{row.currency} {row.grand_total}</td></tr>)}</tbody></table></div>{!result.quotations.length && <p className="text-sm text-muted-foreground">No quotations found. Try broadening your filters.</p>}<div className="flex items-center justify-between text-xs text-muted-foreground"><span>Page {page + 1}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || page === 0} onClick={() => search(page - 1, searchedFilters)}>Previous</Button><Button size="sm" variant="outline" disabled={loading || !result.has_more} onClick={() => search(page + 1, searchedFilters)}>Next</Button></div></div></div>}
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3"><Button disabled={selected.length < 2 || loading} onClick={() => onApply(selected)}>Compare {selected.length || ""} quotations</Button>{onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}<span className="text-xs text-muted-foreground">Selection is checked when you start the comparison.</span></div>
  </div>;
}
