import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, ClipboardList, Factory, GanttChart, Package } from "lucide-react";
import FormSection from "../../../components/FormSection";
import MaterialPicker from "./MaterialPicker";
import { FormField } from "../../../components/FormField";
import FormSelect from "../../../components/FormSelect";
import LinkField from "../../../components/LinkField";
import DataTable from "../../../components/List/DataTable";
import { ListRow } from "../../../components/List/ListRow";
import { StatusBadge } from "../../../components/List/StatusBadge";
import { statusTone } from "../../../components/List/statusTones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Timeline from "./Timeline";
import ProjectSalesItemSelect from "../../Projects/bom/ProjectSalesItemSelect";

function PlanningSection(props) {
  return <FormSection {...props} className="overflow-visible bg-transparent p-0 ring-0 hover:shadow-none [&>div:first-child>div:first-child]:flex [&>div:first-child>div:first-child]:items-start [&>div:first-child>div:first-child]:gap-2" />;
}

function Documents({ rows, columns, onOpen, actions, describe }) {
  return <>
    <div className="md:hidden">{rows.map((row, index) => <ListRow key={row.name} index={index + 1}
      item={{ title: row.name, subtitle: describe(row), statusLabel: row.status, statusColor: statusTone(row.status), raw: row }}
      onClick={onOpen} actions={actions(row)} />)}</div>
    <div className="hidden md:block"><DataTable data={rows} columns={columns} rowKey={(row) => row.name} onRowClick={onOpen} /></div>
  </>;
}

export default function PlanningContent({ step = "setup", data, source, sourceName, start, warehouses, preview, busy,
  onSource, onSourceName, onStart, onWarehouse, onOpen, onCreateBom, onCreateOrders, onTransfer, onOrder, onJob,
  rawMaterials = [], onRawMaterials, onContinueMaterials, onResumeBom, onResumePlan, onResumeOrders, onResumeWorkOrder, orderPlan, onAllOrders, bomItems = [], onBomItems,
  productionItem, onProductionItem, qty, onQty, requestItems = [], requestItem, onRequestItem, requestLoading }) {
  const { t } = useTranslation();
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [editingWarehouses, setEditingWarehouses] = useState(false);
  const itemCodes = rawMaterials.map((row) => row.item_code).filter(Boolean);
  const duplicateItems = new Set(itemCodes.filter((code, index) => itemCodes.indexOf(code) !== index));
  const validMaterials = !duplicateItems.size && rawMaterials.length > 0 && rawMaterials.every((row) => row.item_code && Number.isFinite(Number(row.qty)) && Number(row.qty) > 0);
  const validProduction = !!productionItem && Number.isFinite(Number(qty)) && Number(qty) > 0;
  const options = source === "BOM" ? data.boms.filter((bom) => bom.docstatus === 1) : data.material_requests;
  const warehouseOptions = { company: data.project.company, is_group: 0, disabled: 0 };
  const field = (key, children, required = true) => <FormField name={key} label={t(`manufacturing.${key}`)} required={required}>{children}</FormField>;
  const text = (value) => <span className="text-xs text-muted-foreground">{value ?? "—"}</span>;
  const number = (value) => <span className="text-xs tabular-nums">{value ?? "—"}</span>;
  const status = { id: "status", header: t("common.status"), cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> };
  const name = { id: "name", header: t("common.name"), cell: (row) => <span className="font-medium">{row.name}</span> };
  const createAction = (plan) => <Button size="sm" variant="outline" disabled={busy || plan.docstatus !== 1 || !warehouses.source || !warehouses.wip || !warehouses.fg || data.work_orders.some((wo) => wo.production_plan === plan.name)} onClick={() => onCreateOrders(plan)}>{t("manufacturing.createOrders")}</Button>;
  const planAction = (plan) => Number(plan.docstatus) === 1 ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onResumeOrders(plan.name)}>{t("manufacturing.continueOrders")}</Button> : <Button size="sm" variant="outline" disabled={busy} onClick={() => onResumePlan(plan.name)}>{t("manufacturing.resumePlan")}</Button>;
  const orderPlans = orderPlan ? data.plans.filter((plan) => plan.name === orderPlan) : data.plans;
  const visibleOrders = orderPlan ? data.work_orders.filter((order) => order.production_plan === orderPlan) : data.work_orders;
  const transferAction = (wo) => <Button size="sm" variant="outline" disabled={busy || wo.docstatus !== 1 || Number(wo.material_transferred_for_manufacturing || 0) >= Number(wo.qty) || ["Stopped", "Closed", "Completed"].includes(wo.status)} onClick={() => onTransfer(wo)}>{t("manufacturing.transfer")}</Button>;
  // Row actions must not also open the document behind the action.
  const actionCell = (render) => ({ id: "actions", header: t("common.actions"), cell: (row) => <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{render(row)}</div> });
  return <>
    {step === "setup" && <PlanningSection title={t("manufacturing.plan")} description={t("manufacturing.materialHelp")} icon={CalendarRange}>
      {data.plans.some((plan) => Number(plan.docstatus) === 0) && <div className="mb-3 space-y-2 border-b border-border/60 pb-3">
        <p className="text-sm font-medium">{t("manufacturing.draftPlans")}</p>
        {data.plans.filter((plan) => Number(plan.docstatus) === 0).map((plan) => <div key={plan.name} className="flex flex-wrap items-center gap-2 text-sm"><span>{plan.name} · {plan.posting_date || "—"}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onResumePlan(plan.name)}>{t("manufacturing.resumePlan")}</Button></div>)}
      </div>}
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {field("source", <FormSelect id="source" value={source} disabled={busy} onChange={onSource} placeholder={t("manufacturing.chooseSource")} options={["BOM", "Material Request", "new"].map((value) => ({ value, label: t(`manufacturing.sources.${value}`) }))} />)}
        {source && source !== "new" && source !== "BOM" && field("sourceDocument", <FormSelect id="sourceDocument" value={sourceName} disabled={busy} onChange={onSourceName} placeholder={t("manufacturing.select")} options={options.map((row) => row.name)} />)}
        {source && source !== "new" && field("start", <Input id="start" type="datetime-local" value={start} disabled={busy} onChange={(event) => onStart(event.target.value)} />)}
        {source && source !== "new" && ["source", "wip", "fg"].map((key) => <div key={key}>{field(`${key}Warehouse`, <LinkField doctype="Warehouse" filters={warehouseOptions} value={warehouses[key]} disabled={busy} onChange={(value) => onWarehouse(key, value)} />, key !== "wip")}</div>)}
      </div>
      {(source === "new" || (source === "Material Request" && sourceName)) && <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField label={t("manufacturing.productionItem")} required>
          {source === "new" ? <ProjectSalesItemSelect project={data.project.name} value={productionItem?.item_code || ""} disabled={busy} onSelect={onProductionItem} /> :
            <FormSelect value={requestItem || ""} disabled={busy || requestLoading} placeholder={t("manufacturing.select")} options={requestItems.map((row) => ({ value: row.name, label: `${row.item_code} · ${row.item_name || row.item_code} · ${row.pending} ${row.stock_uom || ""}` }))} onChange={onRequestItem} />}
          {source === "Material Request" && !requestLoading && !requestItems.length && <p className="text-xs text-muted-foreground">{t("manufacturing.noRequestItems")}</p>}
        </FormField>
        <FormField label={t("manufacturing.productionQuantity")} required><Input type="number" min="0" step="any" value={qty} disabled={busy} onChange={(event) => onQty(event.target.value)} /></FormField>
      </div>}
      {source === "BOM" && <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1"><FormField label={t("manufacturing.bom")} required><FormSelect value={bomItems[0]?.bom || ""} disabled={busy} placeholder={t("manufacturing.select")} options={options.map((bom) => ({ value: bom.name, label: `${bom.item || "—"} · ${bom.name}` }))} onChange={(value) => onBomItems([{ ...bomItems[0], bom: value }])} /></FormField></div>
        <div className="w-32"><FormField label={t("manufacturing.qty")} required><Input type="number" min="0.001" step="any" value={bomItems[0]?.qty ?? 1} disabled={busy} onChange={(event) => onBomItems([{ ...bomItems[0], qty: event.target.value }])} /></FormField></div>
      </div>}
      {source === "BOM" && <Button type="button" variant="outline" size="sm" className="mt-4" disabled={busy} onClick={onCreateBom}>{t("manufacturing.createBom")}</Button>}
      {source === "new" && <div className="mt-3 space-y-2">
        {!!data.draft_boms?.length && <div className="space-y-2"><p className="text-sm font-medium">{t("manufacturing.draftBoms")}</p>{data.draft_boms.map((bom) => <div key={bom.name} className="flex flex-wrap items-center gap-2 text-sm"><span>{bom.name} · {bom.item || "—"}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onResumeBom(bom.name)}>{t("manufacturing.resumeBom")}</Button></div>)}</div>}
        <p className="text-sm text-muted-foreground">{t("manufacturing.selectMaterialsHelp")}</p>
        <p className="text-sm text-muted-foreground">{t("manufacturing.selectedMaterials", { count: rawMaterials.filter((row) => row.item_code).length })}</p>
        {duplicateItems.size > 0 && <p role="alert" className="text-sm text-destructive">{t("manufacturing.duplicateMaterials")}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setMaterialsOpen(true)}>{t("manufacturing.chooseMaterials")}</Button>
          <Button type="button" size="sm" disabled={busy || !validMaterials || !validProduction} onClick={onContinueMaterials}>{t("manufacturing.continueBom")}</Button></div>
        <MaterialPicker show={materialsOpen} onClose={() => setMaterialsOpen(false)} rows={rawMaterials} onChange={onRawMaterials} busy={busy} />
      </div>}
    </PlanningSection>}
    {step === "plans" && preview && <details className="rounded border border-border/60 p-3"><summary className="cursor-pointer text-sm font-semibold">{t("manufacturing.requirementsSummary")}</summary><div className="mt-3 space-y-3">
      <PlanningSection title={t("manufacturing.preview")} icon={Factory}>
        <div className="overflow-x-auto"><DataTable data={preview.po_items} rowKey={(row, index) => row.name || index} columns={[
          { id: "item", header: t("manufacturing.item"), cell: (row) => <span className="font-medium">{row.item_code}</span> },
          { id: "bom", header: t("manufacturing.bom"), cell: (row) => text(row.bom_no) },
          { id: "qty", header: t("manufacturing.qty"), cell: (row) => number(`${row.planned_qty} ${row.stock_uom || ""}`) },
        ]} /></div>
      </PlanningSection>
      <div className="border-t border-border/60 pt-3"><PlanningSection title={t("manufacturing.rawMaterials")} icon={Package}>
        <div className="overflow-x-auto"><DataTable data={preview.mr_items} rowKey={(row, index) => row.name || index} columns={[
          { id: "item", header: t("manufacturing.item"), cell: (row) => <span className="font-medium">{row.item_code}</span> },
          { id: "required", header: t("manufacturing.required"), cell: (row) => number(row.required_bom_qty) },
          { id: "available", header: t("manufacturing.available"), cell: (row) => number(row.actual_qty) },
          { id: "quantity", header: t("manufacturing.plannedPurchase"), cell: (row) => number(row.quantity) },
          { id: "uom", header: t("manufacturing.uom"), cell: (row) => text(row.uom || row.stock_uom) },
        ]} /></div>
      </PlanningSection></div>
    </div></details>}
    {step === "plans" && <PlanningSection title={t("manufacturing.plans")} icon={ClipboardList}>
      {!data.plans.length ? <p className="text-xs text-muted-foreground">{t("manufacturing.noPlans")}</p> : <Documents rows={data.plans} onOpen={(plan) => Number(plan.docstatus) === 0 ? onResumePlan(plan.name) : onOpen("Production Plan", plan.name)} actions={planAction} describe={(plan) => `${plan.total_planned_qty || 0} · ${plan.posting_date || ""}`} columns={[
        name, status,
        { id: "qty", header: t("manufacturing.qty"), cell: (plan) => number(plan.total_planned_qty) },
        { id: "date", header: t("common.date"), cell: (plan) => text(plan.posting_date) },
        actionCell(planAction),
      ]} />}
    </PlanningSection>}
    {step === "orders" && <PlanningSection title={t("manufacturing.orders")} description={t("manufacturing.transferHelp")} icon={Factory}>
      {orderPlan && <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{orderPlan}</span><Button type="button" size="sm" variant="outline" onClick={onAllOrders}>{t("manufacturing.allWorkOrders")}</Button></div>}
      {orderPlan && !orderPlans.length && <p role="alert" className="text-sm text-destructive">{t("manufacturing.planUnavailable")}</p>}
      {orderPlans.some((plan) => Number(plan.docstatus) === 1 && !data.work_orders.some((wo) => wo.production_plan === plan.name)) && <div className="mb-4 space-y-2 border-b border-border/60 pb-3">
        <p className="text-sm font-medium">{t("manufacturing.prepareOrders")}</p>
        {editingWarehouses || !warehouses.source || !warehouses.wip || !warehouses.fg ? <><p className="text-xs text-muted-foreground">{t("manufacturing.orderWarehouseHelp")}</p>
          <div className="grid gap-2 sm:grid-cols-3">{["source", "wip", "fg"].map((key) => <div key={key}>{field(`${key}Warehouse`, <LinkField doctype="Warehouse" filters={warehouseOptions} value={warehouses[key]} disabled={busy} onChange={(value) => onWarehouse(key, value)} />)}</div>)}</div>
          {warehouses.source && warehouses.wip && warehouses.fg && <Button type="button" variant="ghost" size="sm" onClick={() => setEditingWarehouses(false)}>{t("common.done")}</Button>}</> : <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">{["source", "wip", "fg"].map((key) => <span key={key}><strong>{t(`manufacturing.${key}Warehouse`)}:</strong> {warehouses[key]}</span>)}<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditingWarehouses(true)}>{t("common.edit")}</Button></div>}
        {orderPlans.filter((plan) => Number(plan.docstatus) === 1 && !data.work_orders.some((wo) => wo.production_plan === plan.name)).map((plan) => <div key={plan.name} className="flex flex-wrap items-center gap-2 text-sm"><span>{plan.name}</span>{createAction(plan)}</div>)}
      </div>}
      {!visibleOrders.length ? <p className="text-xs text-muted-foreground">{t("manufacturing.noOrders")}</p> : <Documents rows={visibleOrders} onOpen={(wo) => Number(wo.docstatus) === 0 ? onResumeWorkOrder(wo.name, wo.production_plan) : onOpen("Work Order", wo.name)} actions={transferAction} describe={(wo) => `${wo.production_item} · ${wo.produced_qty || 0}/${wo.qty}`} columns={[
        name,
        { id: "item", header: t("manufacturing.item"), cell: (wo) => text(wo.production_item) }, status,
        { id: "qty", header: t("projects.completion"), cell: (wo) => number(`${wo.produced_qty || 0}/${wo.qty}`) },
        actionCell(transferAction),
      ]} />}
    </PlanningSection>}
    {step === "timeline" && <PlanningSection title={t("manufacturing.timeline")} icon={GanttChart}>
      <Timeline orders={data.work_orders} cards={data.job_cards} onOrder={onOrder} onJob={onJob} />
    </PlanningSection>}
  </>;
}
