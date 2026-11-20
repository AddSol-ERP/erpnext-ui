import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCcw } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { getMethod } from "../../../services/api";
import ListLayout from "../../../components/ListLayout";
import DataTable from "../../../components/List/DataTable";
import { ListRow } from "../../../components/List/ListRow";
import { Button } from "@/components/ui/button";
import { normalizeHistoryResponse } from "./historyResponse";

export default function SavedComparisons() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [offsets, setOffsets] = useState([0]);
  const [result, setResult] = useState({ entries: [], next_start: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const offset = offsets[offsets.length - 1];
  const open = useCallback((entry) => navigate(`/purchase/quotation-comparison/${encodeURIComponent(entry.name)}`), [navigate]);
  useEffect(() => {
    setHeader({ title: "Saved quotation comparisons", subtitle: "Review previously saved quotation comparisons", breadcrumbs: [
      { label: "Purchase", path: "/purchase" }, { label: "Saved comparisons" },
    ] });
    return () => setHeader({});
  }, [setHeader]);
  useEffect(() => {
    let active = true;
    getMethod("method/erpnext_ui.quotation_comparison.list_evaluations", { start: offset })
      .then((data) => { if (active) { setResult(normalizeHistoryResponse(data)); setError(null); } })
      .catch((err) => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offset, refresh]);
  const columns = [
    { id: "name", header: "Comparison", cell: (row) => <span className="font-medium">{row.name}</span> },
    { id: "company", header: "Company / suppliers", cell: (row) => <div><div>{row.company}</div><div className="text-xs text-muted-foreground">{row.suppliers?.join(", ") || `${row.quotation_count} quotations`}</div></div> },
    { id: "date", header: "Date", cell: (row) => row.evaluation_date },
    { id: "analysis", header: "AI analysis", cell: (row) => row.has_ai_analysis ? "Saved" : "Not saved" },
  ];
  return <ListLayout loading={loading} error={error} onRetry={() => { setLoading(true); setRefresh((value) => value + 1); }} contentMode="auto"
    actionBar={<div className="flex flex-wrap justify-end gap-2 px-4 py-3"><Button size="sm" variant="outline" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}><RefreshCcw />Refresh</Button><Button size="sm" onClick={() => navigate("/purchase/quotation-comparison")}><Plus />New comparison</Button></div>}
    cards={result.entries.map((entry) => <ListRow key={entry.name} item={{ title: entry.name, subtitle: `${entry.company} · ${entry.suppliers?.join(", ") || `${entry.quotation_count} quotations`}`, meta: entry.evaluation_date, raw: entry }} onClick={open} />)}
    table={<DataTable columns={columns} data={result.entries} rowKey={(row) => row.name} onRowClick={open} />}
    footer={<div className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground"><span>Page {offsets.length}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={offsets.length === 1} onClick={() => { setLoading(true); setOffsets((current) => current.slice(0, -1)); }}>Previous</Button><Button size="sm" variant="outline" disabled={result.next_start == null} onClick={() => { setLoading(true); setOffsets((current) => [...current, result.next_start]); }}>Next</Button></div></div>}
    isEmpty={!loading && !result.entries.length && result.next_start == null && offsets.length === 1} emptyTitle="No saved comparisons" emptyDescription="Start a comparison and save a snapshot to see it here." />;
}
