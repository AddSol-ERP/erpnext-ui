import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCcw } from "lucide-react";
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
    { id: "project", header: t("manufacturing.project"), cell: (row) => <div className="min-w-0"><div className="truncate font-medium">{row.title}</div><div className="truncate text-xs text-muted-foreground">{row.raw.name}</div></div> },
    { id: "company", header: t("store.filters.company"), hideBelow: "lg", cell: (row) => <span className="text-xs text-muted-foreground">{row.raw.company || "—"}</span> },
    { id: "customer", header: t("store.filters.customer"), hideBelow: "lg", cell: (row) => <span className="text-xs text-muted-foreground">{row.raw.customer || "—"}</span> },
    { id: "status", header: t("common.status"), cell: (row) => <StatusBadge tone={row.statusColor}>{row.statusLabel}</StatusBadge> },
    { id: "completion", header: t("projects.completion"), cell: (row) => <span className="text-xs tabular-nums">{Number(row.raw.percent_complete || 0).toFixed(0)}%</span> },
    { id: "due", header: t("projects.due"), cell: (row) => <span className="text-xs text-muted-foreground">{row.raw.expected_end_date || "—"}</span> },
  ], [t]);
  const openProject = (project) => navigate(`/projects/view/${encodeURIComponent(project.name)}`);
  const tabs = <div role="group" aria-label={t("projects.activity")} className="flex min-w-0 flex-wrap items-center gap-1.5 pb-2">
    {["active", "inactive"].map((value) => <button key={value} type="button" aria-pressed={tab === value}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${tab === value ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "text-chrome-muted hover:bg-muted hover:text-chrome-foreground"}`}
      onClick={() => { setLoading(true); setParams({ tab: value }); }}>
      {t(`projects.${value}`)}{result.counts[value] != null && !loading ? ` (${result.counts[value]})` : ""}
    </button>)}
  </div>;
  return <ListLayout
    contentMode="auto"
    tabs={tabs}
    loading={loading}
    error={error}
    onRetry={() => setRefresh((value) => value + 1)}
    actionBar={<ActionBar onSearch={(value) => { if (value === search) return; setSearch(value); setPage(0); setLoading(true); }} resultCount={total} />}
    cards={listData.map((item, index) => <ListRow key={item.raw.name} item={item} index={page * PAGE_SIZE + index + 1} onClick={openProject} />)}
    table={<DataTable columns={columns} data={listData} rowKey={(row) => row.raw.name} onRowClick={(row) => openProject(row.raw)} rowOffset={page * PAGE_SIZE} />}
    pagination={<Pagination currentPage={page + 1} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} totalItems={total} pageSize={PAGE_SIZE}
      disabled={loading} onPageChange={(value) => { setPage(value - 1); setLoading(true); }} />}
    isEmpty={!loading && !listData.length}
    emptyTitle={t(tab === "active" ? "projects.emptyActive" : "projects.emptyInactive")}
  />;
}
