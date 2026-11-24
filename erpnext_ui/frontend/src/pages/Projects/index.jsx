import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCcw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useHeader } from "../../context/HeaderContext";
import { get } from "../../services/api";
import ActionBar from "../../components/ActionBar";
import ListLayout from "../../components/ListLayout";
import Pagination from "../../components/Pagination";
import { ListRow } from "../../components/List/ListRow";
import DataTable from "../../components/List/DataTable";
import { StatusBadge } from "../../components/List/StatusBadge";
import { statusTone } from "../../components/List/statusTones";

const PAGE_SIZE = 20;
export default function Projects() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "inactive" ? "inactive" : "active";
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [headerTarget, setHeaderTarget] = useState(null);
  const page = Math.max(0, Number.parseInt(params.get("page"), 10) || 0);
  const setPage = (value) => {
    const nextPage = typeof value === "function" ? value(page) : value;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (nextPage > 0) next.set("page", String(nextPage));
      else next.delete("page");
      return next;
    });
  };
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ rows: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHeaderTarget(document.getElementById("project-list-header-search")));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) { setSearch(searchInput); setPage(0); setLoading(true); }
    }, 400);
    return () => clearTimeout(timer);
    // setPage changes URL state and is needed only when the search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search]);
  useEffect(() => {
    setHeader({ title: t("projects.title"), subtitle: t("projects.subtitle"), breadcrumbs: [
      { label: t("common.home"), path: "/" }, { label: t("projects.title") },
    ], actions: [
      { label: t("manufacturing.newProject"), icon: Plus, variant: "btn-primary", onClick: () => navigate("/projects/Project/new") },
      { label: t("common.refresh"), icon: RefreshCcw, variant: "btn-outline-secondary", disabled: loading, onClick: () => setRefresh((value) => value + 1) },
    ] });
    return () => setHeader({});
  }, [setHeader, t, navigate, loading]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      const orFilters = search.trim() ? [["name", "like", `%${search.trim()}%`], ["project_name", "like", `%${search.trim()}%`]] : [];
      const filters = (value) => JSON.stringify({ is_active: value === "active" ? "Yes" : "No" });
      try {
        const [list, ...counts] = await Promise.all([
          get("resource/Project", { fields: JSON.stringify(["name", "project_name", "company", "customer", "status", "percent_complete", "expected_end_date"]), filters: filters(tab),
            or_filters: JSON.stringify(orFilters), order_by: "modified desc", limit_start: page * PAGE_SIZE, limit_page_length: PAGE_SIZE }),
          ...["active", "inactive"].map((value) => get("method/frappe.client.get_count", { doctype: "Project", filters: filters(value), or_filters: JSON.stringify(orFilters) })),
        ]);
        if (active) setResult({ rows: list.data || [], counts: { active: Number(counts[0].message) || 0, inactive: Number(counts[1].message) || 0 } });
      } catch (e) { if (active) { setError(e); setResult({ rows: [], counts: {} }); } }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [tab, page, search, refresh]);
  const total = result.counts[tab] || 0;
  const listData = useMemo(() => result.rows.map((project) => ({
    title: project.project_name || project.name,
    subtitle: [project.name, project.company, project.customer].filter(Boolean).join(" • "),
    meta: `${t("projects.completion")}: ${Number(project.percent_complete || 0).toFixed(0)}%${project.expected_end_date ? ` • ${project.expected_end_date}` : ""}`,
    statusLabel: project.status,
    statusColor: statusTone(project.status),
    raw: project,
  })), [result.rows, t]);
  const columns = useMemo(() => [
    { id: "projectId", header: `${t("projects.projectId")} / ${t("manufacturing.project")}`, cell: (row) => <div className="min-w-0 leading-tight"><span className="block whitespace-nowrap">{row.raw.name}</span>{row.title !== row.raw.name && <span className="block max-w-xs truncate text-xs font-normal text-muted-foreground" title={row.title}>{row.title}</span>}</div> },
    { id: "company", header: t("store.filters.company"), hideBelow: "lg", cell: (row) => <span className="text-xs text-muted-foreground">{row.raw.company || "—"}</span> },
    { id: "customer", header: t("store.filters.customer"), hideBelow: "lg", cell: (row) => <span className="text-xs text-muted-foreground">{row.raw.customer || "—"}</span> },
    { id: "status", header: t("common.status"), cell: (row) => <StatusBadge tone={row.statusColor}>{row.statusLabel}</StatusBadge> },
    { id: "completion", header: t("projects.completion"), cell: (row) => <span className="text-xs tabular-nums">{Number(row.raw.percent_complete || 0).toFixed(0)}%</span> },
    { id: "due", header: t("projects.due"), cell: (row) => <span className="text-xs text-muted-foreground">{row.raw.expected_end_date || "—"}</span> },
  ], [t]);
  const openProject = (project) => navigate(`/projects/view/${encodeURIComponent(project.name)}`);
  const tabs = <div role="group" aria-label={t("projects.activity")} className="inline-flex shrink-0 items-center self-stretch">
    {["active", "inactive"].map((value) => <button key={value} type="button" aria-pressed={tab === value}
      className={`min-h-9 border-b-2 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === value ? "border-primary bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
      onClick={() => { if (tab !== value) { setLoading(true); setParams({ tab: value }); } }}>
      {t(`projects.${value}`)}{result.counts[value] != null && !loading ? ` (${result.counts[value]})` : ""}
    </button>)}
  </div>;
  return <>
  {headerTarget && createPortal(<div className="flex items-center gap-2"><div className="relative w-40 2xl:w-60"><Search aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" className="h-8 ps-8" aria-label={t("common.search")} placeholder={t("common.searchPlaceholder")} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div><span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{t("common.resultCount", { count: total })}</span><Button type="button" variant="outline" size="icon-sm" disabled={loading} onClick={() => setRefresh((value) => value + 1)} aria-label={t("common.refresh")} title={t("common.refresh")}><RefreshCcw /></Button></div>, headerTarget)}
  <ListLayout
    contentMode="auto"
    loading={loading}
    error={error}
    onRetry={() => setRefresh((value) => value + 1)}
    tabs={tabs}
    actionBar={<div className={headerTarget ? "xl:hidden" : undefined}><ActionBar onSearch={setSearchInput} value={searchInput} resultCount={total} compact topBarSearch={false} /></div>}
    cards={listData.map((item, index) => <ListRow key={item.raw.name} item={item} index={page * PAGE_SIZE + index + 1} onClick={openProject} />)}
    table={<DataTable columns={columns} data={listData} rowKey={(row) => row.raw.name} onRowClick={(row) => openProject(row.raw)} rowOffset={page * PAGE_SIZE} className="[&_th]:h-8 [&_th]:px-2.5 [&_td]:px-2.5 [&_td]:py-1" />}
    pagination={<Pagination currentPage={page + 1} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} totalItems={total} pageSize={PAGE_SIZE}
      disabled={loading} onPageChange={(value) => { setPage(value - 1); setLoading(true); }} />}
    isEmpty={!loading && !listData.length}
    emptyTitle={t(tab === "active" ? "projects.emptyActive" : "projects.emptyInactive")}
  /></>;
}
