import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ClipboardList, Cog, Play } from "lucide-react";
import { useHeader } from "../../context/HeaderContext";
import DashboardShell from "../../components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { get } from "../../services/api";
import { TAB_KEYS, JOB_CARD_TABS, WORK_ORDER_TABS } from "./actions";
import StartWorkModal from "./StartWorkModal";
const SECTIONS = [
  { doctype: "Work Order", title: "production.workOrders", subtitle: "production.workOrdersSubtitle", path: "/production/work-order", statuses: WORK_ORDER_TABS, icon: ClipboardList },
  { doctype: "Job Card", title: "production.jobCards", subtitle: "production.jobCardsSubtitle", path: "/production/job-cards", statuses: JOB_CARD_TABS, icon: Cog },
];
const LABELS = { ongoing: "production.tabOngoing", waiting: "production.tabWaiting", completed: "production.tabCompleted" };
export default function ProductionDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startOpen, setStartOpen] = useState(false);
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await Promise.all(SECTIONS.map(async (section) => {
        const totals = await Promise.all(TAB_KEYS.map(async (key) => {
          const result = await get("method/frappe.client.get_count", {
            doctype: section.doctype,
            filters: JSON.stringify([["docstatus", "!=", 2], ["status", "in", section.statuses[key]]]),
          });
          return [key, Number(result.message) || 0];
        }));
        return [section.doctype, Object.fromEntries(totals)];
      }));
      setCounts(Object.fromEntries(entries));
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    setHeader({ title: t("nav.production"), subtitle: t("production.subtitle"), breadcrumbs: [
      { label: t("common.home"), path: "/" }, { label: t("nav.production") },
    ] });
    return () => setHeader({});
  }, [setHeader, t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);
  return <DashboardShell>
    <StartWorkModal show={startOpen} onClose={() => setStartOpen(false)} onStarted={() => { setStartOpen(false); loadData(); }} />
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" onClick={() => setStartOpen(true)}><Play />{t("production.startWork")}</Button>
      <Button size="sm" variant="outline" disabled={loading} onClick={loadData}>{t("common.refresh")}</Button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">{t("production.loadFailed")} <Button size="sm" variant="outline" onClick={loadData}>{t("common.retry")}</Button></div>}
    <div className="grid gap-4 md:grid-cols-2">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        return <section key={section.doctype} className="rounded-xl border border-border bg-card p-5">
          <button type="button" className="flex w-full items-center gap-3 text-start" onClick={() => navigate(section.path)}>
            <span className="rounded-lg bg-primary/10 p-3 text-primary"><Icon className="size-5" /></span>
            <span className="flex-1"><span className="block font-semibold">{t(section.title)}</span><span className="text-xs text-muted-foreground">{t(section.subtitle)}</span></span>
            <ArrowRight className="size-4 text-primary rtl:rotate-180" />
          </button>
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
            {TAB_KEYS.map((key) => <button key={key} type="button" onClick={() => navigate(`${section.path}?tab=${key}`)} className="rounded-lg p-2 text-start transition-colors hover:bg-muted">
              <span className="block text-2xl font-semibold tabular-nums">{loading ? "…" : error ? "—" : counts[section.doctype]?.[key] ?? 0}</span>
              <span className="text-xs text-muted-foreground">{t(LABELS[key])}</span>
            </button>)}
          </div>
        </section>;
      })}
    </div>
    {!loading && !error && <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">{t("production.overviewAnalysis", {
      orders: counts["Work Order"]?.ongoing || 0, jobs: counts["Job Card"]?.ongoing || 0,
      waitingOrders: counts["Work Order"]?.waiting || 0, waitingJobs: counts["Job Card"]?.waiting || 0,
    })}</div>}
  </DashboardShell>;
}
