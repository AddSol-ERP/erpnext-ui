import { useTranslation } from "react-i18next";
import { CalendarRange, ClipboardList, Factory, GanttChart, Package } from "lucide-react";
import FormSection from "../../../components/FormSection";
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

export default function PlanningContent({ step = "setup", data, source, sourceName, qty, start, warehouses, preview, busy,
  onSource, onSourceName, onQty, onStart, onWarehouse, onOpen, onCreateBom, onCreateOrders, onTransfer, onOrder, onJob }) {
  const { t } = useTranslation();
  const options = source === "BOM" ? data.boms.filter((bom) => bom.docstatus === 1) : source === "Sales Order" ? data.sales_orders : data.material_requests;
  const warehouseOptions = { company: data.project.company, is_group: 0, disabled: 0 };
  const field = (key, children, required = true) => <FormField name={key} label={t(`manufacturing.${key}`)} required={required}>{children}</FormField>;
  const text = (value) => <span className="text-xs text-muted-foreground">{value ?? "—"}</span>;
  const number = (value) => <span className="text-xs tabular-nums">{value ?? "—"}</span>;
  const status = { id: "status", header: t("common.status"), cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> };
  const name = { id: "name", header: t("common.name"), cell: (row) => <span className="font-medium">{row.name}</span> };
  const createAction = (plan) => <Button size="sm" variant="outline" disabled={busy || plan.docstatus !== 1 || !warehouses.source || !warehouses.wip || !warehouses.fg || data.work_orders.some((wo) => wo.production_plan === plan.name)} onClick={() => onCreateOrders(plan)}>{t("manufacturing.createOrders")}</Button>;
  const transferAction = (wo) => <Button size="sm" variant="outline" disabled={busy || wo.docstatus !== 1 || Number(wo.material_transferred_for_manufacturing || 0) >= Number(wo.qty) || ["Stopped", "Closed", "Completed"].includes(wo.status)} onClick={() => onTransfer(wo)}>{t("manufacturing.transfer")}</Button>;
  // Row actions must not also open the document behind the action.
  const actionCell = (render) => ({ id: "actions", header: t("common.actions"), cell: (row) => <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{render(row)}</div> });
  return <>
    {step === "setup" && <PlanningSection title={t("manufacturing.plan")} description={t("manufacturing.materialHelp")} icon={CalendarRange}>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {field("source", <FormSelect id="source" value={source} disabled={busy} onChange={onSource} options={["Sales Order", "BOM", "Material Request"].map((value) => ({ value, label: t(`manufacturing.sources.${value}`) }))} />)}
        {field("sourceDocument", <FormSelect id="sourceDocument" value={sourceName} disabled={busy} onChange={onSourceName} placeholder={t("manufacturing.select")} options={options.map((row) => row.name)} />)}
        {source === "BOM" && field("qty", <Input id="qty" type="number" min="0.001" step="any" value={qty} disabled={busy} onChange={(event) => onQty(event.target.value)} />)}
        {field("start", <Input id="start" type="datetime-local" value={start} disabled={busy} onChange={(event) => onStart(event.target.value)} />)}
        {["source", "wip", "fg"].map((key) => <div key={key}>{field(`${key}Warehouse`, <LinkField doctype="Warehouse" filters={warehouseOptions} value={warehouses[key]} disabled={busy} onChange={(value) => onWarehouse(key, value)} />, key !== "wip")}</div>)}
      </div>
      {source === "BOM" && <Button type="button" variant="outline" size="sm" className="mt-4" disabled={busy} onClick={onCreateBom}>{t("manufacturing.createBom")}</Button>}
    </PlanningSection>}
    {step === "materials" && preview && <>
      <PlanningSection title={t("manufacturing.preview")} icon={Factory}>
        <div className="overflow-x-auto"><DataTable data={preview.po_items} rowKey={(row, index) => row.name || index} columns={[
          { id: "item", header: t("manufacturing.item"), cell: (row) => <span className="font-medium">{row.item_code}</span> },
          { id: "bom", header: t("manufacturing.bom"), cell: (row) => text(row.bom_no) },
          { id: "qty", header: t("manufacturing.qty"), cell: (row) => number(`${row.planned_qty} ${row.stock_uom || ""}`) },
        ]} /></div>
      </PlanningSection>
      <div className="border-t border-border/60 pt-4"><PlanningSection title={t("manufacturing.rawMaterials")} icon={Package}>
        <div className="overflow-x-auto"><DataTable data={preview.mr_items} rowKey={(row, index) => row.name || index} columns={[
          { id: "item", header: t("manufacturing.item"), cell: (row) => <span className="font-medium">{row.item_code}</span> },
          { id: "required", header: t("manufacturing.required"), cell: (row) => number(row.required_bom_qty) },
          { id: "available", header: t("manufacturing.available"), cell: (row) => number(row.actual_qty) },
          { id: "quantity", header: t("manufacturing.plannedPurchase"), cell: (row) => number(row.quantity) },
          { id: "uom", header: t("manufacturing.uom"), cell: (row) => text(row.uom || row.stock_uom) },
        ]} /></div>
      </PlanningSection></div>
    </>}
    {step === "materials" && !preview && <p className="p-4 text-sm text-muted-foreground">{t("manufacturing.materialHelp")}</p>}
    {step === "plans" && <PlanningSection title={t("manufacturing.plans")} icon={ClipboardList}>
      {!data.plans.length ? <p className="text-xs text-muted-foreground">{t("manufacturing.noPlans")}</p> : <Documents rows={data.plans} onOpen={(plan) => onOpen("Production Plan", plan.name)} actions={createAction} describe={(plan) => `${plan.total_planned_qty || 0} · ${plan.posting_date || ""}`} columns={[
        name, status,
        { id: "qty", header: t("manufacturing.qty"), cell: (plan) => number(plan.total_planned_qty) },
        { id: "date", header: t("common.date"), cell: (plan) => text(plan.posting_date) },
        actionCell(createAction),
      ]} />}
    </PlanningSection>}
    {step === "orders" && <PlanningSection title={t("manufacturing.orders")} description={t("manufacturing.transferHelp")} icon={Factory}>
      {!data.work_orders.length ? <p className="text-xs text-muted-foreground">{t("manufacturing.noOrders")}</p> : <Documents rows={data.work_orders} onOpen={(wo) => onOpen("Work Order", wo.name)} actions={transferAction} describe={(wo) => `${wo.production_item} · ${wo.produced_qty || 0}/${wo.qty}`} columns={[
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
