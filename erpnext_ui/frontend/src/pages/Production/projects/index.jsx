import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { get, post } from "../../../services/api";
import { saveDocument } from "../../../lib/docTransition";
import { useHeader } from "../../../context/HeaderContext";
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Timeline from "./Timeline";
import WorkOrderPreviewModal from "../work-order/WorkOrderPreviewModal";
import JobCardPreviewModal from "../job-cards/JobCardPreviewModal";

export default function Projects() {
  const { project } = useParams();
  return <Workspace key={project || "picker"} project={project} />;
}
function Workspace({ project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
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
  useEffect(() => {
    setHeader({ title: t("manufacturing.title"), subtitle: project || t("manufacturing.subtitle"), breadcrumbs: [
      { label: t("nav.production"), path: "/production" }, { label: t("manufacturing.title"), path: "/production/projects" },
    ] });
    return () => setHeader({});
  }, [setHeader, t, project]);
  const run = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const invalidate = () => { revision.current += 1; setPreview(null); };
  const openDoc = (doctype, name) => navigate(`/production/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  const field = (label, content) => <label className="grid gap-2 text-sm">{t(`manufacturing.${label}`)}{content}</label>;
  const options = source === "BOM" ? data?.boms.filter((b) => b.docstatus === 1) : source === "Sales Order" ? data?.sales_orders : data?.material_requests;
  return <div className="space-y-6 p-4">
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-64 flex-1">{field("project", <LinkField doctype="Project" value={project || ""} onChange={(value) => navigate(value ? `/production/projects/${encodeURIComponent(value)}` : "/production/projects")} />)}</div>
      <Button variant="outline" onClick={() => openDoc("Project", "new")}>{t("manufacturing.newProject")}</Button>
      {project && <Button disabled={busy} variant="outline" onClick={() => run(load)}>{t("common.refresh")}</Button>}
    </div>
    {error && <div role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">{error}</div>}
    {project && !data && !error && <p>{t("common.loading")}</p>}
    {data && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{data.project.project_name}</h2><p className="text-sm text-muted-foreground">{data.project.company} · {data.project.status}</p></div><div className="flex gap-2">
        <Button variant="outline" onClick={() => openDoc("Project", project)}>{t("manufacturing.projectDetails")}</Button>
        <Button onClick={() => navigate("/production/BOM/new", { state: { manufacturingProject: project, manufacturingCompany: data.project.company } })}>{t("manufacturing.createBom")}</Button>
      </div></div>
      <section className="space-y-4 rounded-xl border bg-card p-4"><h3 className="font-semibold">{t("manufacturing.plan")}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {field("source", <select className="h-9 rounded border bg-background px-2" disabled={busy} value={source} onChange={(e) => { invalidate(); setSource(e.target.value); setSourceName(""); }}>{["Sales Order", "BOM", "Material Request"].map((s) => <option key={s} value={s}>{t(`manufacturing.sources.${s}`)}</option>)}</select>)}
          {field("sourceDocument", <select className="h-9 rounded border bg-background px-2" disabled={busy} value={sourceName} onChange={(e) => { invalidate(); setSourceName(e.target.value); }}><option value="">{t("manufacturing.select")}</option>{options?.map((s) => <option key={s.name}>{s.name}</option>)}</select>)}
          {source === "BOM" && field("qty", <Input type="number" min="0.001" step="any" disabled={busy} value={qty} onChange={(e) => { invalidate(); setQty(e.target.value); }} />)}
          {field("start", <Input type="datetime-local" disabled={busy} value={start} onChange={(e) => { invalidate(); setStart(e.target.value); }} />)}
          {["source", "wip", "fg"].map((key) => <div key={key}>{field(`${key}Warehouse`, <LinkField doctype="Warehouse" disabled={busy} filters={{ company: data.project.company, is_group: 0, disabled: 0 }} value={warehouses[key]} onChange={(value) => { invalidate(); setWarehouses((old) => ({ ...old, [key]: value })); }} />)}</div>)}
        </div>
        <p className="text-sm text-muted-foreground">{t("manufacturing.materialHelp")}</p>
        <Button disabled={busy || !sourceName || !start || !warehouses.source || !warehouses.fg} onClick={() => run(async () => {
          const version = revision.current;
          const res = await get("method/erpnext_ui.api.get_project_production_preview", { project, source, source_name: sourceName, qty,
            source_warehouse: warehouses.source, fg_warehouse: warehouses.fg, planned_start: start.replace("T", " ") });
          if (version === revision.current) setPreview(res.message);
        })}>{t("manufacturing.preview")}</Button>
        {preview && <div className="space-y-3">
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["item", "bom", "qty"].map((k) => <th className="p-2 text-start" key={k}>{t(`manufacturing.${k}`)}</th>)}</tr></thead><tbody>{preview.po_items.map((row, i) => <tr key={i}><td className="p-2">{row.item_code}</td><td className="p-2">{row.bom_no}</td><td className="p-2">{row.planned_qty} {row.stock_uom}</td></tr>)}</tbody></table></div>
          <h4 className="font-medium">{t("manufacturing.rawMaterials")}</h4>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["item", "required", "available", "plannedPurchase", "uom"].map((k) => <th className="p-2 text-start" key={k}>{t(`manufacturing.${k}`)}</th>)}</tr></thead><tbody>{preview.mr_items.map((row, i) => <tr key={i}><td className="p-2">{row.item_code}</td><td className="p-2">{row.required_bom_qty}</td><td className="p-2">{row.actual_qty ?? "—"}</td><td className="p-2">{row.quantity}</td><td className="p-2">{row.stock_uom || row.uom}</td></tr>)}</tbody></table></div>
          <Button disabled={busy} onClick={() => run(async () => {
            const res = await saveDocument({ doctype: "Production Plan", doc: preview });
            setPreview(null); await load(); openDoc("Production Plan", res.data.name);
          })}>{t("manufacturing.savePlan")}</Button>
        </div>}
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4"><h3 className="font-semibold">{t("manufacturing.plans")}</h3>
        {!data.plans.length && <p className="text-sm text-muted-foreground">{t("manufacturing.noPlans")}</p>}
        {data.plans.map((plan) => <div key={plan.name} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><button className="hover:underline" onClick={() => openDoc("Production Plan", plan.name)}>{plan.name} · {plan.status}</button>
          <Button size="sm" disabled={busy || plan.docstatus !== 1 || !warehouses.source || !warehouses.wip || !warehouses.fg || data.work_orders.some((wo) => wo.production_plan === plan.name)} onClick={() => run(async () => {
            await post("method/erpnext_ui.api.create_project_work_orders", { plan: plan.name, source_warehouse: warehouses.source, wip_warehouse: warehouses.wip, fg_warehouse: warehouses.fg }); await load();
          })}>{t("manufacturing.createOrders")}</Button></div>)}
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4"><h3 className="font-semibold">{t("manufacturing.orders")}</h3><p className="text-sm text-muted-foreground">{t("manufacturing.transferHelp")}</p>
        {data.work_orders.map((wo) => <div key={wo.name} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><button onClick={() => openDoc("Work Order", wo.name)} className="hover:underline">{wo.name} · {wo.production_item} · {wo.produced_qty || 0}/{wo.qty} · {wo.status}</button>
          <Button size="sm" variant="outline" disabled={busy || wo.docstatus !== 1 || Number(wo.material_transferred_for_manufacturing || 0) >= Number(wo.qty) || ["Stopped", "Closed", "Completed"].includes(wo.status)} onClick={() => run(async () => {
            const res = await get("method/erpnext_ui.api.get_project_material_transfer", { work_order: wo.name });
            if (res.message.existing_name) { openDoc("Stock Entry", res.message.existing_name); return; }
            const saved = await saveDocument({ doctype: "Stock Entry", doc: res.message }); openDoc("Stock Entry", saved.data.name);
          })}>{t("manufacturing.transfer")}</Button></div>)}
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-4"><h3 className="font-semibold">{t("manufacturing.timeline")}</h3><Timeline orders={data.work_orders} cards={data.job_cards} onOrder={setOrder} onJob={setJob} /></section>
      {order && <WorkOrderPreviewModal show doc={order} onClose={() => setOrder(null)} onSuccess={() => { setOrder(null); run(load); }} />}
      {job && <JobCardPreviewModal show doc={job} onClose={() => setJob(null)} onSuccess={() => { setJob(null); run(load); }} />}
    </>}
  </div>;
}
