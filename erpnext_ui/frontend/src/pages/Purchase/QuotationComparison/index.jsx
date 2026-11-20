import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getMethod, post } from "../../../services/api";
import { openInDesk } from "../../../lib/deskUrl";
import { useHeader } from "../../../context/HeaderContext";

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
  if (!state?.names?.length) return <div className="p-6">Select quotations from the Supplier Quotation list. <button className="underline" onClick={() => navigate("/purchase/Supplier Quotation")}>Open list</button></div>;
  if (error) return <div className="p-6" role="alert">{error}</div>;
  if (!result) return <div className="p-6">Loading quotations…</div>;
  return <div className="space-y-4 p-6">
    <p>Company: {result.company} · Company currency: {result.company_currency}</p>
    <p className="text-sm">Company amounts use each quotation’s recorded exchange rate. They are not an evaluation-date conversion and do not establish comparable landed cost.</p>
    {saved ? <p>Evaluation {saved} saved.</p> : <button className="btn btn-primary" disabled={saving} onClick={saveEvaluation}>{saving ? "Saving…" : "Save evaluation snapshot"}</button>}
    {actionError && <p role="alert" className="text-red-700">{actionError}</p>}
    <div className="grid gap-4 lg:grid-cols-2">{result.quotations.map((quote) => <section key={quote.name} className="rounded border p-4 space-y-2">
      <h2 className="font-semibold">{quote.supplier} · {quote.name}</h2>
      {created[quote.name] ? <p>Draft purchase order {created[quote.name]} created. <button className="underline" onClick={() => openInDesk("Purchase Order", created[quote.name])}>Open order</button></p> : quote.has_active_order ? <p>Purchase order already exists for this quotation.</p> : <button type="button" className="btn btn-primary" disabled={creating !== null || quote.docstatus !== 1 || quote.warnings.length > 0} onClick={() => createOrder(quote)}>{creating === quote.name ? "Creating draft…" : "Create draft purchase order"}</button>}
      <p>Quotation total: {quote.currency} {quote.grand_total}</p>
      <p>Recorded company total: {quote.base_grand_total == null ? "Unavailable" : `${result.company_currency} ${quote.base_grand_total}`}</p>
      <p>Recorded rate: {quote.conversion_rate || "Unavailable"} · Quotation date: {quote.transaction_date} · Valid until: {quote.valid_till || "Not specified"}</p>
      {quote.warnings.map((warning) => <p key={warning} className="text-amber-700">{warning}</p>)}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-start">Item</th><th>Qty</th><th>UOM</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{quote.items.map((item, index) => <tr key={index}><td>{item.item_code} {item.item_name}</td><td>{item.qty}</td><td>{item.uom}</td><td>{item.rate}</td><td>{item.amount}</td></tr>)}</tbody></table></div>
    </section>)}</div>
  </div>;
}
