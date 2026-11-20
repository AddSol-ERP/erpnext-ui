import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getMethod, post } from "../../../services/api";
import { openInDesk } from "../../../lib/deskUrl";
import { useHeader } from "../../../context/HeaderContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "../../../components/List/StatusBadge";
import { AlertTriangle, ArrowLeft, FilePlus2, Save, Sparkles } from "lucide-react";

export default function QuotationComparison() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [created, setCreated] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  useEffect(() => {
    setHeader({ title: "Supplier Quotation Comparison", breadcrumbs: [
      { label: "Purchase", path: "/purchase" }, { label: "Quotation comparison" },
    ] });
    return () => setHeader({});
  }, [setHeader]);
  useEffect(() => {
    if (!state?.names?.length) return;
    let active = true;
    getMethod("method/erpnext_ui.quotation_comparison.compare_quotations", { names: JSON.stringify(state.names) })
      .then((data) => { if (active) setResult(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [state]);
  const analyze = async () => {
    setAnalyzing(true);
    setActionError(null);
    try {
      const response = await post("method/erpnext_ui.quotation_ai.evaluate_quotations", { names: state.names });
      setAnalysis(response.message);
    } catch (err) {
      setActionError(err.message || "Unable to analyze quotations.");
    } finally {
      setAnalyzing(false);
    }
  };
  const saveEvaluation = async () => {
    setSaving(true);
    setActionError(null);
    try {
      const response = await post("method/erpnext_ui.quotation_comparison.save_evaluation", { names: state.names });
      setSaved(response.message.name);
    } catch (err) {
      setActionError(err.message || "Unable to save evaluation.");
    } finally {
      setSaving(false);
    }
  };
  const createOrder = async (quote) => {
    setCreating(quote.name);
    setActionError(null);
    try {
      const response = await post("method/erpnext_ui.quotation_comparison.create_purchase_order", { quotation: quote.name });
      setCreated((current) => ({ ...current, [quote.name]: response.message.name }));
    } catch (err) {
      setActionError(err.message || "Unable to create purchase order.");
    } finally {
      setCreating(null);
    }
  };
  if (!state?.names?.length) return <div className="space-y-4 pt-4"><Alert><AlertTitle>No quotations selected</AlertTitle><AlertDescription>Select at least two quotations from the Supplier Quotation list.</AlertDescription></Alert><Button variant="outline" onClick={() => navigate("/purchase/Supplier Quotation")}><ArrowLeft />Open quotation list</Button></div>;
  if (error) return <div className="pt-4"><Alert variant="destructive"><AlertTriangle /><AlertTitle>Unable to load comparison</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>;
  if (!result) return <div className="pt-4 text-sm text-muted-foreground" role="status">Loading quotations…</div>;
  return <div className="mx-auto w-full max-w-[1600px] space-y-4 pt-4 md:space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">{result.company}</p><p className="text-xs text-muted-foreground">{result.quotations.length} quotations · Company currency: {result.company_currency}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={analyze} disabled={analyzing}><Sparkles />{analyzing ? "Analyzing…" : "Analyze with OpenAI"}</Button><Button onClick={saveEvaluation} disabled={saving || !!saved}><Save />{saved ? "Snapshot saved" : saving ? "Saving…" : "Save snapshot"}</Button></div></div>
    <Alert><AlertTriangle /><AlertTitle>Review the comparison basis</AlertTitle><AlertDescription>Company totals use each quotation’s recorded exchange rate. They are not evaluation-date conversions or comparable landed costs. AI analysis sends the displayed quotation data to OpenAI.</AlertDescription></Alert>
    {saved && <p className="text-sm text-muted-foreground" role="status">Evaluation {saved} saved.</p>}
    {actionError && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Action could not be completed</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert>}
    {analysis && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI analysis</CardTitle><CardDescription>{analysis.model} · Review this draft against the source quotations before making a decision.</CardDescription></CardHeader><CardContent><div className="whitespace-pre-wrap text-sm leading-relaxed">{analysis.analysis}</div></CardContent></Card>}
    <div className="grid gap-4 xl:grid-cols-2">{result.quotations.map((quote) => <Card key={quote.name}>
      <CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle>{quote.supplier}</CardTitle><CardDescription>{quote.name}</CardDescription></div><StatusBadge tone={quote.docstatus === 1 ? "complete" : "pending"}>{quote.docstatus === 1 ? "Submitted" : quote.docstatus === 2 ? "Cancelled" : "Draft"}</StatusBadge></div></CardHeader>
      <CardContent className="space-y-4"><div className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2"><div><div className="text-xs text-muted-foreground">Quotation total</div><div className="font-semibold tabular-nums">{quote.currency} {quote.grand_total}</div></div><div><div className="text-xs text-muted-foreground">Recorded company total</div><div className="font-semibold tabular-nums">{quote.base_grand_total == null ? "Unavailable" : `${result.company_currency} ${quote.base_grand_total}`}</div></div></div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Exchange rate</dt><dd>{quote.conversion_rate || "Unavailable"}</dd></div><div><dt className="text-xs text-muted-foreground">Quotation date</dt><dd>{quote.transaction_date || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Valid until</dt><dd>{quote.valid_till || "Not specified"}</dd></div></dl>
      {quote.warnings.map((warning) => <Alert key={warning}><AlertTriangle /><AlertDescription>{warning}</AlertDescription></Alert>)}
      <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-table-header text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start">Item</th><th className="px-3 py-2 text-end">Qty</th><th className="px-3 py-2 text-start">UOM</th><th className="px-3 py-2 text-end">Rate</th><th className="px-3 py-2 text-end">Amount</th></tr></thead><tbody className="divide-y divide-border">{quote.items.map((item, index) => <tr key={index}><td className="px-3 py-2"><div className="font-medium">{item.item_code}</div><div className="text-xs text-muted-foreground">{item.item_name}</div></td><td className="px-3 py-2 text-end tabular-nums">{item.qty}</td><td className="px-3 py-2">{item.uom}</td><td className="px-3 py-2 text-end tabular-nums">{item.rate}</td><td className="px-3 py-2 text-end tabular-nums">{item.amount}</td></tr>)}</tbody></table></div>
      {created[quote.name] ? <div className="flex flex-wrap items-center gap-2 text-sm"><StatusBadge tone="complete">Draft created</StatusBadge><Button variant="link" onClick={() => openInDesk("Purchase Order", created[quote.name])}>{created[quote.name]}</Button></div> : quote.has_active_order ? <StatusBadge tone="pending">Purchase order exists</StatusBadge> : <Button variant="outline" disabled={creating !== null || quote.docstatus !== 1 || quote.warnings.length > 0} onClick={() => createOrder(quote)}><FilePlus2 />{creating === quote.name ? "Creating draft…" : "Create draft purchase order"}</Button>}</CardContent>
    </Card>)}</div>
  </div>;
}
