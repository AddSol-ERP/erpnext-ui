import { createElement, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Copy, FilePlus2, LayoutTemplate } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import FormSection from "../../../components/FormSection";
import { FormField } from "../../../components/FormField";
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";

export default function BomCreation() {
  const { project } = useParams();
  return <Creation key={project} project={project} />;
}

function Creation({ project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("fresh");
  const [source, setSource] = useState("");
  const back = `/projects/view/${encodeURIComponent(project)}`;
  useEffect(() => {
    let active = true;
    get(`resource/Project/${encodeURIComponent(project)}`).then((res) => {
      if (active) setCompany(res.data.company);
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [project]);
  useEffect(() => {
    setHeader({ title: t("manufacturing.createBom"), subtitle: project,
      breadcrumbs: [{ label: t("projects.title"), path: "/projects" }, { label: project, path: back }, { label: t("manufacturing.createBom") }],
      actions: [{ label: t("common.back"), icon: ArrowLeft, variant: "btn-outline-secondary", onClick: () => navigate(back) }],
    });
    return () => setHeader({});
  }, [project, back, navigate, setHeader, t]);
  const options = [
    { key: "template", icon: LayoutTemplate },
    { key: "copy", icon: Copy },
    { key: "fresh", icon: FilePlus2 },
  ];
  const start = () => navigate("/projects/BOM/new", { state: {
    manufacturingProject: project, manufacturingCompany: company,
    ...(mode !== "fresh" ? { bomSource: source, bomSourceType: mode === "template" ? "UI BOM Template" : "BOM" } : {}),
  } });
  return <DashboardShell>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <FormSection title={t("bomCreation.choose")} description={t("bomCreation.help")}>
      <div role="radiogroup" aria-label={t("bomCreation.choose")} className="grid gap-3 md:grid-cols-3">
        {options.map(({ key, icon }) => <label key={key} className={`flex cursor-pointer gap-3 border p-4 ${mode === key ? "border-primary bg-primary/5" : "border-border"}`}>
          <input type="radio" name="bom-creation" value={key} checked={mode === key} onChange={() => { setMode(key); setSource(""); }} className="mt-1 accent-primary" />
          <span className="min-w-0">{createElement(icon, { className: "mb-2 size-5 text-primary" })}<span className="block text-sm font-semibold">{t(`bomCreation.${key}`)}</span><span className="mt-1 block text-xs text-muted-foreground">{t(`bomCreation.${key}Help`)}</span></span>
        </label>)}
      </div>
      {mode !== "fresh" && <div className="mt-5 max-w-xl"><FormField label={t(mode === "template" ? "bomCreation.template" : "bomCreation.source")} required hint={t(mode === "template" ? "bomCreation.templateHint" : "bomCreation.copyHint")}>
        <LinkField key={mode} doctype={mode === "template" ? "UI BOM Template" : "BOM"} value={source} onChange={setSource} disabled={!company} filters={mode === "template" ? { company, enabled: 1 } : { company, docstatus: ["!=", 2] }} />
      </FormField></div>}
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate("/projects/UI BOM Template")}>{t("bomCreation.manageTemplates")}</Button><Button variant="outline" disabled={!company} onClick={() => navigate("/projects/UI BOM Template/new", { state: { manufacturingCompany: company } })}>{t("bomCreation.newTemplate")}</Button></div>
      <div className="mt-5 flex justify-end"><Button onClick={start} disabled={!company || !!error || (mode !== "fresh" && !source)}>{t("bomCreation.continue")}</Button></div>
    </FormSection>
  </DashboardShell>;
}
