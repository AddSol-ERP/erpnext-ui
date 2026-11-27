import { useTranslation } from "react-i18next";
import RightDrawer from "../../components/RightDrawer";
import { StatusBadge } from "../../components/List/StatusBadge";
import { statusTone } from "../../components/List/statusTones";

export default function WorkOrderProgressDrawer({ order, jobCards, onClose }) {
  const { t } = useTranslation();
  const cards = (jobCards || []).filter((card) => card.work_order === order?.name);
  const qty = Number(order?.qty) || 0;
  const produced = Number(order?.produced_qty) || 0;
  const progress = qty > 0 ? Math.min(100, Math.max(0, produced / qty * 100)) : 0;
  return <RightDrawer show={Boolean(order)} onClose={onClose} title={order?.name || t("production.workOrders")} width="lg">
    {order && <div className="space-y-5">
      <div className="space-y-2"><p className="font-semibold">{order.production_item || "—"}</p><StatusBadge tone={statusTone(order.status)}>{order.status || "—"}</StatusBadge>
        <p className="text-sm text-muted-foreground">{t("production.woQty", { produced, total: qty })}</p>
        <div role="progressbar" aria-label={t("projects.completion")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>
        <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">{t("manufacturing.plannedStart")}</dt><dd>{order.planned_start_date || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">{t("manufacturing.plannedEnd")}</dt><dd>{order.planned_end_date || "—"}</dd></div></dl>
      <section><h3 className="mb-2 text-sm font-semibold">{t("production.operations")}</h3>{!(order.operations || []).length ? <p className="text-sm text-muted-foreground">{t("manufacturing.noOperations")}</p> : <div className="divide-y divide-border rounded border border-border">{order.operations.map((operation, index) => <div key={operation.name || index} className="space-y-1 p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">{operation.operation || "—"}</span><StatusBadge tone={statusTone(operation.status)}>{operation.status || "—"}</StatusBadge></div><p className="text-xs text-muted-foreground">{t("production.workstation", { name: operation.workstation || "—" })}</p><p className="text-xs text-muted-foreground">{t("manufacturing.operationCompleted", { qty: operation.completed_qty ?? 0 })}</p></div>)}</div>}</section>
      <section><h3 className="mb-2 text-sm font-semibold">{t("production.jobCards")}</h3>{!cards.length ? <p className="text-sm text-muted-foreground">{t("manufacturing.noVisibleJobCards")}</p> : <div className="divide-y divide-border rounded border border-border">{cards.map((card) => <div key={card.name} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{card.name} · {card.operation || "—"}</span><StatusBadge tone={statusTone(card.status)}>{card.status || "—"}</StatusBadge></div>)}</div>}</section>
    </div>}
  </RightDrawer>;
}
