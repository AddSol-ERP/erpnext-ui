import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getMethod, post } from "../../../services/api";
import { openInDesk } from "../../../lib/deskUrl";
import { useHeader } from "../../../context/HeaderContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "../../../components/List/StatusBadge";
import { AlertTriangle, ArrowLeft, ChevronDown, FilePlus2, Pencil, Save, Sparkles } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AnalysisMarkdown from "./AnalysisMarkdown";
import { buildItemRows } from "./comparison";
import QuotationPicker from "./QuotationPicker";

function readableTerms(value) {
  if (!value) return "Not specified";
  if (typeof DOMParser === "undefined") return String(value).replace(/<[^>]*>/g, " ");
  const document = new DOMParser().parseFromString(String(value), "text/html");
  document.querySelectorAll("script, style").forEach((node) => node.remove());
  return document.body.textContent?.trim() || "Not specified";
}

export default function QuotationComparison() {
  const { state } = useLocation();
  const { setHeader } = useHeader();
  const [names, setNames] = useState(() => Array.isArray(state?.names) ? state.names : []);
  const [editing, setEditing] = useState(() => !state?.names?.length);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [created, setCreated] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState("items");
  useEffect(() => {
    if (names.length < 2) return;
    let active = true;
    getMethod("method/erpnext_ui.quotation_comparison.compare_quotations", { names: JSON.stringify(names) })
      .then((data) => { if (active) setResult(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [names]);
  const analyze = useCallback(async () => {
    setAnalyzing(true);
    setActionError(null);
    try {
      const response = await post("method/erpnext_ui.quotation_ai.evaluate_quotations", { names });
      setAnalysis(response.message);
      setResult(response.message.comparison);
      setTab("analysis");
    } catch (err) {
      setActionError(err.message || "Unable to analyze quotations.");
    } finally {
      setAnalyzing(false);
    }
  }, [names]);
  const saveEvaluation = useCallback(async () => {
    setSaving(true);
    setActionError(null);
    try {
      const response = await post("method/erpnext_ui.quotation_comparison.save_evaluation", { names });
      setSaved(response.message.name);
    } catch (err) {
      setActionError(err.message || "Unable to save evaluation.");
    } finally {
      setSaving(false);
    }
  }, [names]);
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
  const applySelection = (next) => {
    setEditing(false);
    if (!error && next.length === names.length && next.every((name) => names.includes(name))) return;
    setError(null); setResult(null); setAnalysis(null); setSaved(null); setCreated({}); setActionError(null); setTab("items");
    setNames(next);
  };
  useEffect(() => {
    const actions = !editing && result && !error ? [
      { label: "Change quotations", icon: Pencil, variant: "btn-outline-primary", disabled: analyzing || saving || creating !== null, onClick: () => setEditing(true) },
      { label: analyzing ? "Analyzing…" : "Analyze with AI", icon: Sparkles, variant: "btn-outline-primary", disabled: analyzing, onClick: analyze },
      { label: saved ? "Snapshot saved" : saving ? "Saving…" : "Save snapshot", icon: Save, variant: "btn-primary", disabled: saving || !!saved, onClick: saveEvaluation },
    ] : [];
    setHeader({
      title: "Supplier Quotation Comparison",
      subtitle: !editing && result ? `${result.company} · ${result.quotations.length} quotations · Company currency: ${result.company_currency}` : "Choose quotations to compare",
      breadcrumbs: [{ label: "Purchase", path: "/purchase" }, { label: "Quotation comparison" }],
      actions,
    });
    return () => setHeader({});
  }, [setHeader, editing, result, error, analyzing, saving, creating, saved, analyze, saveEvaluation]);
  if (editing || names.length < 2) return <div className="mx-auto w-full max-w-[1600px] pt-2"><QuotationPicker key={names.join("|")} initialNames={names} onApply={applySelection} onCancel={result ? () => setEditing(false) : undefined} /></div>;
  if (error) return <div className="space-y-3 pt-2"><Alert variant="destructive"><AlertTriangle /><AlertTitle>Unable to load comparison</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button variant="outline" onClick={() => setEditing(true)}><ArrowLeft />Change selection</Button></div>;
  if (!result) return <div className="pt-4 text-sm text-muted-foreground" role="status">Loading quotations…</div>;
  const rows = buildItemRows(result.quotations);
  return <div className="mx-auto w-full max-w-[1600px] space-y-3 pt-2">

    {saved && <p className="text-sm text-muted-foreground" role="status">Evaluation {saved} saved.</p>}{actionError && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Action could not be completed</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert>}
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <div className="border border-border/70 bg-card px-3 pt-2 sm:px-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1.5 rounded-none bg-transparent p-0 pb-2">
          <TabsTrigger value="items" className="h-auto flex-none rounded-full border-0 px-3 py-1 text-xs font-medium text-chrome-muted shadow-none transition-colors hover:bg-muted hover:text-chrome-foreground data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-primary/40">Quotation comparison</TabsTrigger>
          <TabsTrigger value="analysis" className="h-auto flex-none rounded-full border-0 px-3 py-1 text-xs font-medium text-chrome-muted shadow-none transition-colors hover:bg-muted hover:text-chrome-foreground data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-primary/40">AI analysis</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="items" className="min-w-0 space-y-5 pt-4">
        <Collapsible asChild>
        <section aria-labelledby="commercial-heading" className="rounded-lg border border-border bg-card">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-start outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <div><h2 id="commercial-heading" className="text-sm font-semibold text-foreground">Supplier pricing and terms</h2><p className="mt-1 text-xs text-muted-foreground">Quotation totals, payment terms and conditions for {result.quotations.length} suppliers.</p></div>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border p-4"><p className="mb-3 text-xs text-muted-foreground">Company totals use each quotation’s recorded exchange rate.</p>
          <div className="grid gap-4 xl:grid-cols-2">{result.quotations.map((quote) => <Card key={quote.name}><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle>{quote.supplier}</CardTitle><CardDescription>{quote.name}</CardDescription></div><StatusBadge tone={quote.docstatus === 1 ? "complete" : "pending"}>{quote.docstatus === 1 ? "Submitted" : quote.docstatus === 2 ? "Cancelled" : "Draft"}</StatusBadge></div></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2"><div><div className="text-xs text-muted-foreground">Quotation total</div><div className="font-semibold tabular-nums">{quote.currency} {quote.grand_total}</div><div className="text-xs text-muted-foreground">Net: {quote.net_total ?? "Not specified"} · Taxes and charges: {quote.total_taxes_and_charges ?? "Not specified"}</div></div><div><div className="text-xs text-muted-foreground">Recorded company total</div><div className="font-semibold tabular-nums">{quote.base_grand_total == null ? "Unavailable" : `${result.company_currency} ${quote.base_grand_total}`}</div><div className="text-xs text-muted-foreground">Exchange rate: {quote.conversion_rate || "Unavailable"}</div></div></div>
            <div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs font-medium text-muted-foreground">Payment terms</p><p>{quote.payment_terms_template || "Not specified"}</p>{quote.payment_schedule?.length > 0 && <ul className="mt-1 space-y-1">{quote.payment_schedule.map((payment, i) => <li key={i} className="text-xs">{[payment.payment_term, payment.description, payment.due_date && `Due ${payment.due_date}`, payment.invoice_portion != null && `${payment.invoice_portion}%`, payment.payment_amount != null && `${quote.currency} ${payment.payment_amount}`].filter(Boolean).join(" · ")}</li>)}</ul>}</div><div><p className="text-xs font-medium text-muted-foreground">Terms and conditions {quote.terms_template ? `· ${quote.terms_template}` : ""}</p><div className="max-h-28 overflow-auto whitespace-pre-wrap text-xs">{readableTerms(quote.terms)}</div></div></div>
            <div className="text-xs text-muted-foreground">Date: {quote.transaction_date || "—"} · Valid until: {quote.valid_till || "Not specified"}</div>{quote.warnings.map((warning) => <p key={warning} className="text-xs text-destructive">{warning}</p>)}
            {created[quote.name] ? <Button size="sm" variant="link" onClick={() => openInDesk("Purchase Order", created[quote.name])}>Draft {created[quote.name]}</Button> : quote.has_active_order ? <StatusBadge tone="pending">Purchase order exists</StatusBadge> : <Button size="sm" variant="outline" disabled={creating !== null || quote.docstatus !== 1 || quote.warnings.length > 0} onClick={() => createOrder(quote)}><FilePlus2 />{creating === quote.name ? "Creating draft…" : "Create draft purchase order"}</Button>}
          </CardContent></Card>)}</div>
          </CollapsibleContent>
        </section>
        </Collapsible>
        <section aria-labelledby="item-heading" className="space-y-3 rounded-lg border border-border bg-card p-4"><h2 id="item-heading" className="text-base font-semibold">Item-level comparison</h2>
        <p className="text-xs text-muted-foreground">Lowest quoted rate is shown only when at least two offers have the same currency, quantity and UOM. It is not a supplier recommendation; taxes, freight and other terms are not included. Company totals use each quotation’s recorded exchange rate.</p>
        <div className="max-h-[65vh] max-w-full overflow-auto rounded-lg border border-border" role="region" aria-label="Supplier quotation comparison table" tabIndex={0}>
          <table className="w-full border-separate border-spacing-0 text-sm"><thead><tr>
            <th scope="col" className="sticky start-0 top-0 z-30 min-w-52 border-b border-border bg-table-header px-3 py-3 text-start align-top">Item <span className="block text-xs font-normal text-muted-foreground">{rows.length} items</span></th>
            {result.quotations.map((quote) => <th scope="col" key={quote.name} className="sticky top-0 z-20 min-w-56 border-b border-border bg-table-header px-3 py-3 text-start align-top"><div>{quote.supplier}</div><div className="text-xs font-normal text-muted-foreground">{quote.name}</div></th>)}
          </tr></thead><tbody>{rows.map((row) => <tr key={row.key}><th scope="row" className="sticky start-0 z-10 border-b border-border bg-card px-3 py-3 text-start align-top font-medium"><div>{row.code || "Item code missing"}</div><div className="text-xs font-normal text-muted-foreground">{row.name}</div></th>{row.offers.map((offers, index) => <td key={result.quotations[index].name} className="border-b border-border bg-card px-3 py-3 align-top">{offers.length === 0 ? <span className="text-muted-foreground">Not quoted</span> : offers.map((item, itemIndex) => <div key={itemIndex} className="space-y-1 pb-2"><div className="font-semibold tabular-nums">{result.quotations[index].currency} {item.rate} <span className="font-normal text-muted-foreground">/ {item.uom || "—"}</span></div><div className="text-xs text-muted-foreground">Qty {item.qty} · Amount {item.amount}</div>{item.pricing_uom && item.rate_per_pricing_uom != null && Number.isFinite(Number(item.rate_per_pricing_uom)) && Number(item.rate_per_pricing_uom) > 0 && <div className="text-xs text-muted-foreground">Pricing UOM rate: <span className="font-medium tabular-nums text-foreground">{result.quotations[index].currency} {item.rate_per_pricing_uom} / {item.pricing_uom}</span></div>}{offers.length > 1 && <span className="text-xs text-muted-foreground">Duplicate item line</span>}{row.lowestRate !== null && Number(item.rate) === row.lowestRate && <StatusBadge tone="complete">Lowest quoted rate</StatusBadge>}</div>)}</td>)}</tr>)}</tbody>
          <tfoot><tr><th scope="row" className="sticky bottom-0 start-0 z-30 border-t border-border bg-table-header px-3 py-3 text-start align-top">Quotation totals</th>{result.quotations.map((quote) => <td key={quote.name} className="sticky bottom-0 z-20 border-t border-border bg-table-header px-3 py-3 align-top"><div className="font-semibold tabular-nums">{quote.currency} {quote.grand_total}</div><div className="text-xs text-muted-foreground">Recorded company total: {quote.base_grand_total == null ? "Unavailable" : `${result.company_currency} ${quote.base_grand_total}`}</div></td>)}</tr></tfoot></table>
        </div>{!rows.length && <p className="text-sm text-muted-foreground">No quoted items found.</p>}</section>
      </TabsContent>
      <TabsContent value="analysis" className="min-w-0 pt-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI analysis</CardTitle><CardDescription>{analysis ? `${analysis.provider} · ${analysis.model} · ${analysis.cached ? "Reused previous analysis" : "New analysis"} · Review this draft against the source quotations before making a decision.` : "Run AI analysis to review supplier trade-offs. The displayed quotation data will be sent to the configured provider."}</CardDescription></CardHeader><CardContent>{analysis ? <AnalysisMarkdown text={analysis.analysis} /> : <Button variant="outline" onClick={analyze} disabled={analyzing}><Sparkles />{analyzing ? "Analyzing…" : "Analyze with AI"}</Button>}</CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}
