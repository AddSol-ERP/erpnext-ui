import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarRange, Layers, Pencil } from "lucide-react";
import { useHeader } from "../../context/HeaderContext";
import { get } from "../../services/api";
import DashboardShell from "../../components/dashboard/DashboardShell";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import DataTable from "../../components/List/DataTable";
import { StatusBadge } from "../../components/List/StatusBadge";

export default function ProjectOverview() {
  const { project } = useParams();
  return <Overview key={project} project={project} />;
}
function Overview({ project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    get("method/erpnext_ui.api.get_project_manufacturing", { project })
      .then((res) => { if (active) setData(res.message); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [project]);
  useEffect(() => {
    setHeader({ title: data?.project.project_name || project, subtitle: data ? `${data.project.company} · ${project}` : t("projects.overview"), breadcrumbs: [
      { label: t("common.home"), path: "/" }, { label: t("projects.title"), path: "/projects" }, { label: data?.project.project_name || project },
    ], actions: data ? [{ label: t("projects.edit"), icon: Pencil, variant: "btn-outline-secondary", onClick: () => navigate(`/projects/Project/${encodeURIComponent(project)}`) }] : [] });
    return () => setHeader({});
  }, [data, project, setHeader, t, navigate]);
  const manufacturing = `/projects/view/${encodeURIComponent(project)}/manufacturing`;
  const createBom = () => navigate("/projects/BOM/new", { state: { manufacturingProject: project, manufacturingCompany: data.project.company } });
  return <DashboardShell>
    {error && <div role="alert" className="rounded border border-destructive p-4 text-destructive">{error}</div>}
    {!data && !error && <p>{t("common.loading")}</p>}
    {data && <>
      <section className="border border-border/70 bg-card p-4">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
          [t("projects.activity"), t(data.project.is_active === "Yes" ? "projects.active" : "projects.inactive")],
          [t("common.status"), data.project.status], [t("projects.completion"), `${Number(data.project.percent_complete || 0).toFixed(0)}%`],
          [t("projects.due"), data.project.expected_end_date || "—"],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>
      </section>
      <ModuleGrid cols={2} items={[
        { key: "bom", icon: Layers, titleKey: "manufacturing.createBom", descriptionKey: "projects.bomHelp" },
        { key: "planning", icon: CalendarRange, titleKey: "projects.startPlanning", descriptionKey: "projects.planningHelp" },
      ]} onClick={(tile) => tile.key === "bom" ? createBom() : navigate(manufacturing)} />
      <section className="overflow-hidden border border-border/70 bg-card">
        <h3 className="border-b border-border/60 px-4 py-3 text-sm font-semibold">{t("projects.boms")}</h3>
        {!data.boms.length ? <p className="p-4 text-sm text-muted-foreground">{t("projects.noBoms")}</p> : <DataTable
          data={data.boms} rowKey={(bom) => bom.name}
          onRowClick={(bom) => navigate(`/projects/BOM/${encodeURIComponent(bom.name)}`)}
          columns={[
            { id: "name", header: t("manufacturing.bom"), cell: (bom) => <span className="font-medium">{bom.name}</span> },
            { id: "item", header: t("manufacturing.item"), cell: (bom) => <span className="text-xs text-muted-foreground">{bom.item_name || bom.item}</span> },
            { id: "status", header: t("common.status"), cell: (bom) => <StatusBadge tone={bom.docstatus === 1 ? "info" : "open"}>{t(bom.docstatus === 1 ? "production.statusSubmitted" : "common.draft")}</StatusBadge> },
          ]}
        />}
      </section>
    </>}
  </DashboardShell>;
}
