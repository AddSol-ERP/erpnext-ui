import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { get } from "../../../../services/api";
import { useToast } from "../../../../context/ToastContext";
import AppModal from "../../../../components/AppModal";
import { StatusBadge } from "../../../../components/List/StatusBadge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { JOB_CARD_STATUS_UI, WORK_ORDER_STATUS_UI, workOrderActionsFor } from "../../actions";
import JobCardPreviewModal from "../../job-cards/JobCardPreviewModal";
import {
  reopenWorkOrder,
  stopWorkOrder,
} from "../../jobActions";

/** Chrome per action; the label comes from i18n at render time. */
const ACTION_STYLE = {
  startNext: "bg-primary text-primary-foreground hover:bg-primary/90",
  stop: "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
  reopen:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20",
};

const ACTION_LABEL_KEY = {
  startNext: "production.startWorkOrder",
  stop: "production.stopOrder",
  reopen: "production.reopenOrder",
};

/** Review a work order, its job cards and material transfer. */
export default function WorkOrderPreviewModal({
  show,
  onClose,
  doc,
  onSuccess,
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [fullDoc, setFullDoc] = useState(null);
  const [busy, setBusy] = useState(null);
  const [transferQty, setTransferQty] = useState(null);
  const [stockCheck, setStockCheck] = useState(null);
  const [cards, setCards] = useState([]);
  const [cardsError, setCardsError] = useState("");
  const [selectedCard, setSelectedCard] = useState(null);

  const loadDoc = async () => {
    const res = await get(`resource/Work Order/${encodeURIComponent(doc.name)}`);
    setFullDoc(res.data);
    try {
      const allCards = [];
      const pageSize = 100;
      let page;
      do {
        const result = await get("resource/Job Card", {
          fields: JSON.stringify(["name", "operation", "workstation", "status", "for_quantity", "total_completed_qty"]),
          filters: JSON.stringify([["work_order", "=", doc.name], ["docstatus", "!=", 2]]),
          order_by: "sequence_id asc, creation asc",
          limit_start: allCards.length,
          limit_page_length: pageSize,
        });
        page = result.data || [];
        allCards.push(...page);
      } while (page.length === pageSize);
      setCards(allCards);
      setCardsError("");
    } catch (error) {
      setCards([]);
      setCardsError(error.message || t("production.loadFailed"));
    }
  };

  useEffect(() => {
    if (show && doc) {
      // loadDoc only setStates after an awaited API response.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDoc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, doc]);

  const runAction = async (key) => {
    setBusy(key);
    try {
      if (key === "startNext") {
        const qty = String(Math.max(0, Number(fullDoc.qty || 0) - Number(fullDoc.material_transferred_for_manufacturing || 0)));
        setTransferQty(qty);
        const result = await get("method/erpnext_ui.api.get_project_material_transfer_shortages", { work_order: doc.name, qty });
        setStockCheck({ qty, ...result.message });
        return;
      } else if (key === "stop") {
        await stopWorkOrder(doc.name);
        toast.success(t("production.woStoppedToast"));
      } else {
        await reopenWorkOrder(doc.name);
        toast.success(t("production.woReopenedToast"));
      }

      // Status is what changed, so the preview must show it before the
      // operator decides again.
      await loadDoc();
      onSuccess && onSuccess();
    } catch (e) {
      // The server's own sentence ("Transaction not allowed against stopped
      // Work Order") is the only explanation worth showing.
      console.error(e);
      toast.error(e?.message || t("production.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (!fullDoc) return null;

  if (selectedCard) return <JobCardPreviewModal show doc={selectedCard} onClose={() => { setSelectedCard(null); loadDoc(); }} onSuccess={loadDoc} />;

  const statusUi = WORK_ORDER_STATUS_UI[fullDoc.status] || {
    labelKey: "production.statusUnknown",
    tone: "open",
  };

  const actions = workOrderActionsFor(fullDoc.status).filter((key) => key !== "startNext" || (Number(fullDoc.docstatus) === 1 && !Number(fullDoc.skip_transfer) && fullDoc.transfer_material_against !== "Job Card" && (fullDoc.required_items || []).some((row) => Number(row.transferred_qty || 0) < Number(row.required_qty || 0))));
  const prepareTransfer = async () => {
    setBusy("transfer");
    try {
      if (!stockCheck || stockCheck.qty !== transferQty) {
        const check = await get("method/erpnext_ui.api.get_project_material_transfer_shortages", { work_order: doc.name, qty: transferQty });
        setStockCheck({ qty: transferQty, ...check.message });
        if (check.message.shortages?.length) return;
      }
      const result = await get("method/erpnext_ui.api.get_project_material_transfer", { work_order: doc.name, qty: transferQty });
      onClose();
      if (result.message.existing_name) navigate(`/projects/Stock%20Entry/${encodeURIComponent(result.message.existing_name)}`);
      else navigate("/projects/Stock%20Entry/new", { state: { manufacturingTransfer: result.message } });
    } catch (error) { toast.error(error?.message || t("production.actionFailed")); }
    finally { setBusy(null); }
  };

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("production.workOrderTitle", { name: doc.name })}
      width="xl"
      contentClassName="h-[85vh]"
      bodyClassName="p-0 md:overflow-hidden"
      footer={
        <div className="flex w-full gap-2">
          {transferQty !== null ? <><Button variant="outline" onClick={() => { setTransferQty(null); setStockCheck(null); }} disabled={busy !== null}>{t("common.back")}</Button><Button onClick={prepareTransfer} disabled={busy !== null || !(Number(transferQty) > 0)}>{t(stockCheck?.qty === transferQty && stockCheck.shortages?.length ? "production.continueDespiteShortage" : "production.reviewTransfer")}</Button></> : actions.map((key) => (
            <Button
              key={key}
              variant={key === "startNext" ? "default" : "outline"}
              className={`flex-1 ${ACTION_STYLE[key]}`}
              disabled={busy !== null}
              onClick={() => runAction(key)}
            >
              {busy === key ? t("production.processing") : t(ACTION_LABEL_KEY[key])}
            </Button>
          ))}
        </div>
      }
    >
      <div className="grid min-h-full md:h-full md:min-h-0 md:grid-cols-2">
        <div className="min-w-0 space-y-3 border-b border-border p-4 md:overflow-y-auto md:border-b-0 md:border-e">
      <div className="mb-2 font-semibold">{fullDoc.production_item}</div>

      <div className="mb-2 text-xs text-muted-foreground">
        {t("production.woQty", {
          produced: fullDoc.produced_qty || 0,
          total: fullDoc.qty || 0,
        })}
      </div>

      <div className="mb-3">
        <StatusBadge tone={statusUi.tone}>{t(statusUi.labelKey)}</StatusBadge>
      </div>

      <section>
        <div className="mb-2 font-semibold">{t("production.jobCards")} <span className="text-xs font-normal text-muted-foreground">({cards.length})</span></div>
        {cardsError ? <p role="alert" className="text-sm text-destructive">{cardsError}</p> : cards.length ? <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-start text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-start">{t("production.operations")}</th><th className="p-2 text-start">{t("common.name")}</th><th className="p-2 text-start">{t("common.status")}</th><th className="p-2 text-end">{t("production.jobProgress")}</th></tr></thead><tbody>{cards.map((card) => {
          const ui = JOB_CARD_STATUS_UI[card.status] || { labelKey: "production.statusUnknown", tone: "open" };
          return <tr key={card.name} className="border-t border-border"><td className="p-2"><button type="button" className="text-start font-medium text-primary hover:underline" onClick={() => setSelectedCard(card)}>{card.operation || card.name}</button><span className="block text-xs text-muted-foreground">{card.workstation || "—"}</span></td><td className="p-2"><button type="button" className="text-start text-primary hover:underline" onClick={() => setSelectedCard(card)}>{card.name}</button></td><td className="p-2"><StatusBadge tone={ui.tone}>{t(ui.labelKey)}</StatusBadge></td><td className="p-2 text-end tabular-nums">{card.total_completed_qty || 0} / {card.for_quantity || 0}</td></tr>;
        })}</tbody></table></div> : <p className="text-sm text-muted-foreground">{Number(fullDoc.docstatus) === 0 ? t("production.jobCardsAfterSubmit") : t("production.noWorkOrderJobCards")}</p>}
      </section>
        </div>
        <div className="min-w-0 space-y-3 p-4 md:overflow-y-auto">
          <h2 className="text-sm font-semibold">{t("production.transferReview")}</h2>
      <div className="grid gap-2 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-2">
        <div><span className="block text-xs text-muted-foreground">{t("production.sourceWarehouse")}</span><span className="break-words">{fullDoc.source_warehouse || "—"}</span></div>
        <div><span className="block text-xs text-muted-foreground">{t("production.wipWarehouse")}</span><span className="break-words">{fullDoc.wip_warehouse || "—"}</span></div>
      </div>
          {transferQty === null && <p className="text-sm text-muted-foreground">{t("production.transferReviewHelp")}</p>}
      {transferQty !== null && <label className="mb-4 block text-sm font-medium">{t("production.transferQuantity")}<Input className="mt-1" type="number" min="0" step="any" value={transferQty} onChange={(event) => setTransferQty(event.target.value)} /></label>}
      {transferQty !== null && stockCheck?.qty === transferQty && !stockCheck.shortages?.length && <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">{t("production.materialAvailable")}</p>}
      {transferQty !== null && stockCheck?.qty === transferQty && stockCheck.materials?.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("production.transferMaterials")} ({stockCheck.materials.length})</h3>
        {stockCheck.shortages?.length > 0 && <p role="status" className="text-xs text-muted-foreground">{t(stockCheck.existing_draft ? "production.shortageExistingDraft" : "production.shortageHelp")}</p>}
        <div className="max-h-64 overflow-auto rounded-md border border-border"><table className="w-full min-w-[400px] text-sm"><thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th className="p-2 text-start">{t("production.materialAndWarehouse")}</th><th className="p-2 text-end">{t("production.stockRequired")}</th><th className="p-2 text-end">{t("production.stockAvailable")}</th><th className="p-2 text-end">{t("production.stockMissing")}</th></tr></thead><tbody>{stockCheck.materials.map((row) => {
          const missing = stockCheck.shortages.some((shortage) => shortage.item === row.item && shortage.warehouse === row.warehouse && shortage.uom === row.uom);
          return <tr key={`${row.item}-${row.warehouse}-${row.uom}`} className={`border-t border-border ${missing ? "bg-amber-500/10" : ""}`}><td className="p-2"><span className="block break-words font-medium">{row.item}</span><span className="block text-xs text-muted-foreground">{row.warehouse}</span>{missing && <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"><TriangleAlert className="size-3.5" aria-hidden="true" />{t("production.stockMissing")}</span>}</td><td className="whitespace-nowrap p-2 text-end tabular-nums">{row.required} {row.uom}</td><td className="whitespace-nowrap p-2 text-end tabular-nums">{row.available} {row.uom}</td><td className={`whitespace-nowrap p-2 text-end font-medium tabular-nums ${missing ? "text-amber-700 dark:text-amber-400" : ""}`}>{missing ? `${row.shortage} ${row.uom}` : "—"}</td></tr>;
        })}</tbody></table></div></div>}
        </div>
      </div>
    </AppModal>
  );
}
