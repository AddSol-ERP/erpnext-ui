import { useTranslation } from "react-i18next";
import LinkField from "../../LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { directIssueLineFields } from "../../../lib/directIssue";

export default function DirectIssueItems({ stock }) {
  const { t } = useTranslation();
  if (!stock.items.length) return <p className="py-12 text-center text-muted-foreground">{t("store.directIssue.scanHint")}</p>;
  const defaults = { warehouse: stock.fromWarehouse, project: stock.project, workOrder: stock.workOrder, requestedUser: stock.requestedUser };
  return <div className="flex flex-col gap-3">
    {stock.items.map(row => {
      const fields = directIssueLineFields(row, defaults);
      return <section key={row.code} className="rounded-lg border border-border p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><strong>{row.name || row.code}</strong><p className="text-xs text-muted-foreground">{row.code}</p>
            <p className="text-xs text-muted-foreground">{row.serial_no || row.batch_no || ""}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">{t("store.directIssue.quantity")}
            <Input className="w-24" type="number" min="0" value={row.qty} disabled={Boolean(row.qr_labels?.length)} onChange={event => stock.updateQty(row.code, event.target.value)} />
            {row.stockUOM || row.uom}
          </label>
          <Button type="button" variant="ghost" onClick={() => stock.removeItem(row.code)}>{t("store.item.remove")}</Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            ["issue_warehouse", "Warehouse", t("store.entry.fromWarehouse"), fields.s_warehouse],
            ["issue_project", "Project", t("store.labels.project"), fields.project],
            ["issue_work_order", "Work Order", t("store.labels.workOrder"), fields.custom_store_work_order],
            ["issue_requested_user", "User", t("store.directIssue.requestedUser"), fields.custom_store_requested_by],
          ].map(([field, doctype, label, value]) => <label key={field} className="flex flex-col gap-1 text-xs">
            {label}{field === "issue_warehouse" ? " *" : ""}
            <LinkField doctype={doctype} value={value} onChange={next => stock.updateIssueLine(row.code, field, next || "")} filters={doctype === "Warehouse" ? { is_group: 0 } : doctype === "User" ? { enabled: 1 } : undefined} />
          </label>)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("store.directIssue.overrideHint")}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => stock.updateIssueLine(row.code, "reset")}>{t("store.directIssue.resetDefaults")}</Button>
        </div>
      </section>;
    })}
  </div>;
}
