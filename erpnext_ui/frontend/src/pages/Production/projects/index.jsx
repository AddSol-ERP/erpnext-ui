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
import FormSelect from "../../../components/FormSelect";
import GenericFormPage from "../../../components/GenericForm";
import { Button } from "@/components/ui/button";
import PlanningContent from "./PlanningContent";
import { resolvePlanningBomDraft } from "./bomDraft";
import WorkOrderPreviewModal from "../work-order/WorkOrderPreviewModal";
import JobCardPreviewModal from "../job-cards/JobCardPreviewModal";

const STEP_KEYS = ["setup", "bom", "plans", "orders", "timeline"];

export default function Projects() {
  const { project } = useParams();
  return <Workspace key={project || "picker"} project={project} />;
}
function Workspace({ project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [params, setParams] = useSearchParams();
  const step = params.get("step") === "materials" ? "plans" : STEP_KEYS.includes(params.get("step")) ? params.get("step") : "setup";
  const stepIndex = STEP_KEYS.indexOf(step);
  const selectStep = useCallback((value) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set("step", value);
    if (value !== "bom") next.delete("bom");
    return next;
  }), [setParams]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [qty, setQty] = useState(1);
  const [productionItem, setProductionItem] = useState(null);
  const [requestItem, setRequestItem] = useState("");
  const [requestItems, setRequestItems] = useState([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const selectedRequestItem = requestItems.find((row) => row.name === requestItem);
  const validRequestItem = !!selectedRequestItem && Number.isFinite(Number(qty)) && Number(qty) > 0 && Number(qty) <= selectedRequestItem.pending;
  useEffect(() => {
    if (source !== "Material Request" || !sourceName) return;
    let active = true;
    get(`resource/Material%20Request/${encodeURIComponent(sourceName)}`).then((response) => {
      if (!active) return;
      setRequestItems((response.data.items || []).filter((row) => row.project === project).map((row) => ({
        ...row, pending: (Number(row.qty) - Number(row.ordered_qty || 0)) * Number(row.conversion_factor || 1),
      })).filter((row) => row.pending > 0));
    }).catch((e) => { if (active) { setRequestItems([]); setError(e.message); } }).finally(() => { if (active) setRequestLoading(false); });
    return () => { active = false; };
  }, [source, sourceName, project]);
  const [bomItems, setBomItems] = useState([{ bom: "", qty: 1 }]);
  const validBomItems = bomItems.length === 1 && bomItems.every((row) => row.bom && Number.isFinite(Number(row.qty)) && Number(row.qty) > 0);
  const [start, setStart] = useState("");
  const [warehouses, setWarehouses] = useState({ source: "", wip: "", fg: "" });
  const [preview, setPreview] = useState(null);
  const [order, setOrder] = useState(null);
  const [job, setJob] = useState(null);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [bomDraft, setBomDraft] = useState(null);
  const requestedBom = step === "bom" ? params.get("bom") : null;
  const activeBomDraft = resolvePlanningBomDraft(requestedBom, bomDraft, data?.draft_boms);
  const [bomRevision, setBomRevision] = useState(0);
  const [bomDirty, setBomDirty] = useState(false);
  const [needsBomPlanning, setNeedsBomPlanning] = useState(false);
  const [planDirty, setPlanDirty] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);
  const [workOrderRevision, setWorkOrderRevision] = useState(0);
  const selectedPlan = step === "plans" ? params.get("plan") : null;
  const planWorkOrders = step === "orders" && params.get("plan") ? (data?.work_orders || []).filter((order) => order.production_plan === params.get("plan")) : [];
  const selectedWorkOrder = step === "orders" ? params.get("work_order") || (planWorkOrders.length === 1 && Number(planWorkOrders[0].docstatus) === 0 ? planWorkOrders[0].name : null) : null;
  const canResumePlan = selectedPlan && data?.plans.some((plan) => plan.name === selectedPlan);
  const canResumeWorkOrder = selectedWorkOrder && data?.work_orders.some((order) => order.name === selectedWorkOrder && (!params.get("plan") || order.production_plan === params.get("plan")));
  const currentWorkOrder = data?.work_orders.find((order) => order.name === selectedWorkOrder);
  const switchableOrders = currentWorkOrder?.production_plan ? (data?.work_orders || []).filter((order) => order.production_plan === currentWorkOrder.production_plan) : [];
  const resumePlan = (name) => setParams((previous) => { const next = new URLSearchParams(previous); next.set("step", "plans"); next.set("plan", name); return next; });
  const resumeOrders = (name) => setParams((previous) => { const next = new URLSearchParams(previous); next.set("step", "orders"); next.set("plan", name); next.delete("work_order"); return next; });
  const resumeWorkOrder = (name, plan) => setParams((previous) => { const next = new URLSearchParams(previous); next.set("step", "orders"); next.set("work_order", name); if (plan) next.set("plan", plan); else next.delete("plan"); return next; });
  const closeWorkOrder = () => setParams((previous) => { const next = new URLSearchParams(previous); next.delete("work_order"); return next; });
  const closePlan = () => setParams((previous) => { const next = new URLSearchParams(previous); next.delete("plan"); return next; });
  const revision = useRef(0);
  const warehousePlan = useRef(null);
  useEffect(() => {
    if (step !== "orders" || !data) return;
    const candidatePlans = data.plans.filter((plan) => Number(plan.docstatus) === 1 && !data.work_orders.some((order) => order.production_plan === plan.name));
    const plan = params.get("plan") ? candidatePlans.find((row) => row.name === params.get("plan")) : candidatePlans.length === 1 ? candidatePlans[0] : null;
    if (!plan || warehousePlan.current === plan.name) return;
    const switchingPlan = warehousePlan.current !== null;
    warehousePlan.current = plan.name;
    const fg = [...new Set((plan.po_items || []).map((row) => row.warehouse).filter(Boolean))];
    // Draft plans retain the source and finished-goods warehouses, but not WIP.
    setWarehouses((current) => ({ ...current, source: plan.for_warehouse || "", wip: switchingPlan ? "" : current.wip, fg: fg.length === 1 ? fg[0] : "" }));
  }, [step, data, params]);
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
    const res = await get("method/erpnext_ui.api.get_project_production_preview", { project, source,
      source_name: source === "BOM" ? bomItems[0]?.bom : sourceName, qty: source === "BOM" ? bomItems[0]?.qty : qty,
      bom_items: source === "BOM" ? JSON.stringify(bomItems) : undefined, request_item: source === "Material Request" ? requestItem : undefined,
      source_warehouse: warehouses.source, fg_warehouse: warehouses.fg, planned_start: start.replace("T", " ") });
    if (version !== revision.current) return;
    if (source === "BOM") {
      const rows = res.message?.po_items;
      if (!Array.isArray(rows) || rows.length !== bomItems.length || bomItems.some((item) => !rows.some((row) => row.bom_no === item.bom && Number(row.planned_qty) === Number(item.qty)))) {
        throw new Error(t("manufacturing.previewBomMismatch"));
      }
    }
    setPreview(res.message);
    setNeedsBomPlanning(false);
    setParams((previous) => { const next = new URLSearchParams(previous); next.set("step", "plans"); next.delete("plan"); next.delete("work_order"); return next; });
  }), [run, project, source, sourceName, requestItem, qty, bomItems, warehouses, start, setParams, t]);
  const savePlan = useCallback(() => run(async () => {
    const res = await saveDocument({ doctype: "Production Plan", doc: preview });
    setData((current) => current ? { ...current, plans: [res.data, ...current.plans.filter((plan) => plan.name !== res.data.name)] } : current);
    setPreview(null);
    setNeedsBomPlanning(false);
    selectStep("plans");
    await load();
  }), [run, preview, load, selectStep]);
  useEffect(() => {
    setHeader({ title: t("projects.planning"), subtitle: data ? `${data.project.project_name} · ${data.project.company}` : project, breadcrumbs: [
      { label: t("projects.title"), path: "/projects" },
      { label: data?.project.project_name || project, path: `/projects/view/${encodeURIComponent(project)}` },
      { label: t("projects.planning") },
    ], actions: [
      { label: t("projects.backToProject"), icon: ArrowLeft, variant: "btn-outline-secondary", disabled: busy || bomDirty || planDirty, onClick: () => navigate(`/projects/view/${encodeURIComponent(project)}`) },
      { label: t("common.refresh"), icon: RefreshCcw, variant: "btn-outline-secondary", disabled: busy || bomDirty || planDirty || !data, onClick: () => run(load) },
      ...((step === "setup" || (step === "plans" && !selectedPlan && (preview || needsBomPlanning))) && source !== "new" ? [{ label: t(preview && step === "plans" ? "manufacturing.savePlan" : "manufacturing.preview"), icon: preview && step === "plans" ? Save : Search, variant: "btn-primary",
        disabled: busy || !data || (!preview && (!(source === "BOM" ? validBomItems : sourceName && validRequestItem) || !start || !warehouses.source || !warehouses.fg)), onClick: preview && step === "plans" ? savePlan : previewPlan }] : []),
    ] });
    return () => setHeader({});
  }, [setHeader, t, data, project, busy, bomDirty, planDirty, navigate, run, load, preview, source, sourceName, validBomItems, validRequestItem, start, warehouses, savePlan, previewPlan, step, selectedPlan, needsBomPlanning]);
  const createOrders = (plan) => run(async () => {
    const response = await post("method/erpnext_ui.api.create_project_work_orders", { plan: plan.name, source_warehouse: warehouses.source, wip_warehouse: warehouses.wip, fg_warehouse: warehouses.fg });
    await load();
    if (Array.isArray(response.message) && response.message.length === 1) resumeWorkOrder(response.message[0], plan.name);
    else resumeOrders(plan.name);
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
        className="px-2 pt-2 sm:px-3 [&_button]:gap-1 [&_button]:pb-1.5 [&_button>span:first-child>span]:size-7"
        onSelect={busy || bomDirty || planDirty ? undefined : (index) => selectStep(STEP_KEYS[index])} />
      <div className="space-y-3 p-2.5 sm:p-3">
      {step === "orders" && selectedWorkOrder ? canResumeWorkOrder ? <><GenericFormPage key={`order-${selectedWorkOrder}-${workOrderRevision}`} embedded={{ doctype: "Work Order", name: selectedWorkOrder, onDirtyChange: setPlanDirty, onClose: closeWorkOrder,
        header: <div className="flex min-w-0 flex-wrap items-center gap-2">{switchableOrders.length > 1 ? <div className="w-full sm:w-72"><FormSelect value={selectedWorkOrder} aria-label={t("manufacturing.switchWorkOrder")} disabled={busy || planDirty} options={switchableOrders.map((order) => ({ value: order.name, label: `${order.name} · ${order.qty ?? "—"} · ${order.status || "—"}` }))} onChange={(name) => resumeWorkOrder(name, currentWorkOrder.production_plan)} /></div> : <span className="text-xs text-muted-foreground">{selectedWorkOrder}</span>}{planDirty && switchableOrders.length > 1 && <span className="text-xs text-muted-foreground">{t("manufacturing.saveBeforeSwitch")}</span>}</div>,
        onSaved: () => run(async () => { await load(); setWorkOrderRevision((value) => value + 1); }),
        onSubmitted: () => run(async () => { await load(); setWorkOrderRevision((value) => value + 1); }),
      }} /></> : <p role="alert" className="text-sm text-destructive">{t("manufacturing.orderUnavailable")}</p> : step === "plans" && selectedPlan ? canResumePlan ? <><GenericFormPage key={`plan-${selectedPlan}-${planRevision}`} embedded={{ doctype: "Production Plan", name: selectedPlan, onDirtyChange: setPlanDirty, onClose: closePlan, onNext: () => selectStep("orders"),
        header: <span className="text-xs text-muted-foreground">{selectedPlan}</span>,
        onSaved: () => run(async () => { await load(); setPlanRevision((value) => value + 1); }),
        onSubmitted: (name) => run(async () => { const response = await get(`resource/Production%20Plan/${encodeURIComponent(name)}`); await load();
          if (Number(response.data.docstatus) === 1) selectStep("orders");
          else setPlanRevision((value) => value + 1);
        }),
      }} /></> : <p role="alert" className="text-sm text-destructive">{t("manufacturing.planUnavailable")}</p> : step === "bom" && activeBomDraft ? <GenericFormPage key={`${activeBomDraft.name || "new"}-${bomRevision}`} embedded={{ name: activeBomDraft.name, initialState: activeBomDraft.initialState, onDirtyChange: setBomDirty,
        onSaved: (saved) => { setBomDraft((current) => ({ ...(current?.name === activeBomDraft.name ? current : activeBomDraft), name: saved.name })); run(load); },
        onSubmitted: (name) => run(async () => { const response = await get(`resource/BOM/${encodeURIComponent(name)}`); await load();
          if (Number(response.data.docstatus) === 1 && response.data.is_active) { setSource("BOM"); setBomItems([{ bom: name, qty: activeBomDraft.initialState?.planningQuantity || response.data.quantity || 1 }]); setNeedsBomPlanning(true); setParams((previous) => { const next = new URLSearchParams(previous); next.set("step", "plans"); next.delete("plan"); next.delete("work_order"); next.delete("bom"); return next; }); }
          else setBomRevision((current) => current + 1);
        }),
      }} /> : step === "bom" ? <p role={requestedBom ? "alert" : undefined} className={requestedBom ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{t(requestedBom ? "manufacturing.bomUnavailable" : "manufacturing.chooseBomDraft")}</p> : <PlanningContent step={step === "plans" && needsBomPlanning && !preview ? "setup" : step} data={data} source={source} sourceName={sourceName} qty={qty} start={start} warehouses={warehouses} preview={preview} busy={busy}
      onSource={(value) => { invalidate(); setSource(value); setSourceName(""); setRequestItem(""); setRequestItems([]); setRequestLoading(false); setProductionItem(null); setQty(1); }}
      onSourceName={(value) => { invalidate(); setSourceName(value); setRequestItem(""); setRequestItems([]); setRequestLoading(!!value); }}
      productionItem={productionItem} onProductionItem={setProductionItem} requestItems={requestItems} requestItem={requestItem} requestLoading={requestLoading}
      onRequestItem={(value) => { invalidate(); setRequestItem(value); setQty(requestItems.find((row) => row.name === value)?.pending || ""); }}
      bomItems={bomItems} onBomItems={(rows) => { invalidate(); setBomItems(rows); }}
      onQty={(value) => { invalidate(); setQty(value); }}
      onStart={(value) => { invalidate(); setStart(value); }}
      onWarehouse={(key, value) => { invalidate(); setWarehouses((old) => ({ ...old, [key]: value })); }}
      rawMaterials={rawMaterials} onRawMaterials={setRawMaterials} onContinueMaterials={() => run(async () => {
        const rows = await Promise.all(rawMaterials.map(async (row) => {
          const response = await get(`resource/Item/${encodeURIComponent(row.item_code)}`);
          const item = response.data;
          return { item_code: item.name, item_name: item.item_name, description: item.description,
            qty: Number(row.qty), uom: item.stock_uom, stock_uom: item.stock_uom, conversion_factor: 1 };
        }));
        setBomDraft({ name: "", initialState: { manufacturingProject: project, manufacturingCompany: data.project.company, planningMaterials: rows, planningItem: productionItem, planningQuantity: Number(qty) } });
        setParams((previous) => { const next = new URLSearchParams(previous); next.set("step", "bom"); next.delete("bom"); return next; });
      })}
      onResumeBom={(name) => { setBomDraft({ name, initialState: null }); setParams((previous) => { const next = new URLSearchParams(previous); next.set("step", "bom"); next.set("bom", name); return next; }); }}
      onResumePlan={resumePlan}
      onResumeOrders={resumeOrders} orderPlan={step === "orders" ? params.get("plan") : null} onAllOrders={closePlan}
      onResumeWorkOrder={resumeWorkOrder}
      onOpen={openDoc} onCreateBom={() => navigate(`/projects/view/${encodeURIComponent(project)}/bom/create`)} onCreateOrders={createOrders} onTransfer={transfer} onOrder={setOrder} onJob={setJob} />
      }
      </div>
      {step !== "bom" && !selectedPlan && !selectedWorkOrder && <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        <Button size="sm" variant="outline" disabled={busy || stepIndex === 0} onClick={() => selectStep(step === "plans" ? "setup" : STEP_KEYS[stepIndex - 1])}><ArrowLeft className="rtl:rotate-180" />{t("common.back")}</Button>
        <span className="text-xs tabular-nums text-muted-foreground">{t("common.stepOf", { current: stepIndex + 1, total: STEP_KEYS.length })}</span>
        <Button size="sm" disabled={busy || stepIndex === STEP_KEYS.length - 1 || ((step === "setup" || (step === "plans" && needsBomPlanning && !preview)) && (source === "new" || !(source === "BOM" ? validBomItems : sourceName && validRequestItem) || !start || !warehouses.source || !warehouses.fg))}
          onClick={() => step === "setup" || (step === "plans" && needsBomPlanning && !preview) ? previewPlan() : step === "plans" && preview ? savePlan() : selectStep(STEP_KEYS[stepIndex + 1])}>{t(step === "plans" && preview ? "manufacturing.savePlan" : "common.next")}<ArrowRight className="rtl:rotate-180" /></Button>
      </div>}
    </div>}
    {order && <WorkOrderPreviewModal show doc={order} onClose={() => setOrder(null)} onSuccess={() => { setOrder(null); run(load); }} />}
    {job && <JobCardPreviewModal show doc={job} onClose={() => setJob(null)} onSuccess={() => { setJob(null); run(load); }} />}
  </DashboardShell>;
}
