import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { get, post } from "../../../services/api";
import { saveDocument } from "../../../lib/docTransition";
import { useHeader } from "../../../context/HeaderContext";
import { ArrowLeft, ArrowRight, RefreshCcw, Save, Search } from "lucide-react";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { Spinner } from "@/components/ui/spinner";
import FormStepper from "../../../components/FormStepper";
import { Button } from "@/components/ui/button";
import PlanningContent from "./PlanningContent";
import WorkOrderPreviewModal from "../work-order/WorkOrderPreviewModal";
import JobCardPreviewModal from "../job-cards/JobCardPreviewModal";

const STEP_KEYS = ["setup", "materials", "plans", "orders", "timeline"];

export default function Projects() {
  const { project } = useParams();
  return <Workspace key={project || "picker"} project={project} />;
}
function Workspace({ project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [params, setParams] = useSearchParams();
  const step = STEP_KEYS.includes(params.get("step")) ? params.get("step") : "setup";
  const stepIndex = STEP_KEYS.indexOf(step);
  const selectStep = useCallback((value) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set("step", value);
    return next;
  }), [setParams]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("Sales Order");
  const [sourceName, setSourceName] = useState("");
  const [qty, setQty] = useState(1);
  const [start, setStart] = useState("");
  const [warehouses, setWarehouses] = useState({ source: "", wip: "", fg: "" });
  const [preview, setPreview] = useState(null);
  const [order, setOrder] = useState(null);
  const [job, setJob] = useState(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    if (!project) return;
    const res = await get("method/erpnext_ui.api.get_project_manufacturing", { project });
    setData(res.message);
  }, [project]);
  useEffect(() => {
    let active = true;
    if (project) get("method/erpnext_ui.api.get_project_manufacturing", { project })
      .then((res) => { if (active) setData(res.message); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [project]);
  const run = useCallback(async (fn) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, []);
  const invalidate = () => { revision.current += 1; setPreview(null); };
  const openDoc = useCallback((doctype, name) => navigate(`/projects/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`), [navigate]);
  const previewPlan = useCallback(() => run(async () => {
    const version = revision.current;
    const res = await get("method/erpnext_ui.api.get_project_production_preview", { project, source, source_name: sourceName, qty,
      source_warehouse: warehouses.source, fg_warehouse: warehouses.fg, planned_start: start.replace("T", " ") });
    if (version === revision.current) { setPreview(res.message); selectStep("materials"); }
  }), [run, project, source, sourceName, qty, warehouses, start, selectStep]);
  const savePlan = useCallback(() => run(async () => {
    const res = await saveDocument({ doctype: "Production Plan", doc: preview });
    setPreview(null); await load(); openDoc("Production Plan", res.data.name);
  }), [run, preview, load, openDoc]);
  useEffect(() => {
    setHeader({ title: t("projects.planning"), subtitle: data ? `${data.project.project_name} · ${data.project.company}` : project, breadcrumbs: [
      { label: t("projects.title"), path: "/projects" },
      { label: data?.project.project_name || project, path: `/projects/view/${encodeURIComponent(project)}` },
      { label: t("projects.planning") },
    ], actions: [
      { label: t("projects.backToProject"), icon: ArrowLeft, variant: "btn-outline-secondary", disabled: busy, onClick: () => navigate(`/projects/view/${encodeURIComponent(project)}`) },
      { label: t("common.refresh"), icon: RefreshCcw, variant: "btn-outline-secondary", disabled: busy || !data, onClick: () => run(load) },
      ...(["setup", "materials"].includes(step) ? [{ label: t(step === "materials" && preview ? "manufacturing.savePlan" : "manufacturing.preview"), icon: step === "materials" && preview ? Save : Search, variant: "btn-primary",
        disabled: busy || !data || (!preview && (!sourceName || !start || !warehouses.source || !warehouses.fg)), onClick: step === "materials" && preview ? savePlan : previewPlan }] : []),
    ] });
    return () => setHeader({});
  }, [setHeader, t, data, project, busy, navigate, run, load, preview, sourceName, start, warehouses, savePlan, previewPlan, step]);
  const createOrders = (plan) => run(async () => {
    await post("method/erpnext_ui.api.create_project_work_orders", { plan: plan.name, source_warehouse: warehouses.source, wip_warehouse: warehouses.wip, fg_warehouse: warehouses.fg });
    await load(); selectStep("orders");
  });
  const transfer = (wo) => run(async () => {
    const res = await get("method/erpnext_ui.api.get_project_material_transfer", { work_order: wo.name });
    if (res.message.existing_name) { openDoc("Stock Entry", res.message.existing_name); return; }
    const saved = await saveDocument({ doctype: "Stock Entry", doc: res.message });
    openDoc("Stock Entry", saved.data.name);
  });
  return <DashboardShell>
    {error && <div role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    {!data && !error && <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Spinner />{t("common.loading")}</div>}
    {data && <div className="border border-border/70 bg-card shadow-sm">
      <FormStepper steps={STEP_KEYS.map((key) => ({ id: key, label: t(`manufacturing.steps.${key}`) }))} current={stepIndex} maxReached={STEP_KEYS.length - 1}
        onSelect={busy ? undefined : (index) => selectStep(STEP_KEYS[index])} />
      <div className="space-y-4 p-3 sm:p-4">
      <PlanningContent step={step} data={data} source={source} sourceName={sourceName} qty={qty} start={start} warehouses={warehouses} preview={preview} busy={busy}
      onSource={(value) => { invalidate(); setSource(value); setSourceName(""); }}
      onSourceName={(value) => { invalidate(); setSourceName(value); }}
      onQty={(value) => { invalidate(); setQty(value); }}
      onStart={(value) => { invalidate(); setStart(value); }}
      onWarehouse={(key, value) => { invalidate(); setWarehouses((old) => ({ ...old, [key]: value })); }}
      onOpen={openDoc} onCreateOrders={createOrders} onTransfer={transfer} onOrder={setOrder} onJob={setJob} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5 sm:px-4">
        <Button size="sm" variant="outline" disabled={busy || stepIndex === 0} onClick={() => selectStep(STEP_KEYS[stepIndex - 1])}><ArrowLeft className="rtl:rotate-180" />{t("common.back")}</Button>
        <span className="text-xs tabular-nums text-muted-foreground">{t("common.stepOf", { current: stepIndex + 1, total: STEP_KEYS.length })}</span>
        <Button size="sm" disabled={busy || stepIndex === STEP_KEYS.length - 1 || (step === "setup" && (!sourceName || !start || !warehouses.source || !warehouses.fg))}
          onClick={() => step === "setup" ? previewPlan() : step === "materials" && preview ? savePlan() : selectStep(STEP_KEYS[stepIndex + 1])}>{t(step === "materials" && preview ? "manufacturing.savePlan" : "common.next")}<ArrowRight className="rtl:rotate-180" /></Button>
      </div>
    </div>}
    {order && <WorkOrderPreviewModal show doc={order} onClose={() => setOrder(null)} onSuccess={() => { setOrder(null); run(load); }} />}
    {job && <JobCardPreviewModal show doc={job} onClose={() => setJob(null)} onSuccess={() => { setJob(null); run(load); }} />}
  </DashboardShell>;
}
