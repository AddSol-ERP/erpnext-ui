import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import LinkField from "../../../components/LinkField";
import { getMethod } from "../../../services/api";

const LINK_FILTERS = [
  ["company", "Company", "Company"], ["supplier", "Supplier", "Supplier"],
  ["project", "Project", "Project"], ["material_request", "Material Request", "Material Request"],
  ["request_for_quotation", "Request for Quotation", "Request for Quotation"],
];
const EMPTY = { company: "", supplier: "", project: "", material_request: "", request_for_quotation: "", status: "", date_from: "", date_to: "" };

export default function QuotationPicker({ selected, setSelected, loading, setLoading }) {
  const [filters, setFilters] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [searchedFilters, setSearchedFilters] = useState(null);
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
    <p className="border-t border-border pt-3 text-xs text-muted-foreground">Selection is checked when you start the comparison.</p>
  </div>;
}
