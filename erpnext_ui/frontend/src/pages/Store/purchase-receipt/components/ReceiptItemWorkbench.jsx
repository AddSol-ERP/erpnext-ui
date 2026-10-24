import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Package, Search } from "lucide-react";
import AppModal from "../../../../components/AppModal";
import { FormField } from "../../../../components/FormField";
import LinkField from "../../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReceiptLineForm from "./ReceiptLineForm";

/**
 * Add outstanding Purchase Order lines and complete each one, as ONE surface.
 *
 * This replaces a dialog stacked on a dialog: `ReceiptItemPicker` listed the
 * outstanding lines, and picking one opened `ReceiptLineDialog` on top of it. Two
 * overlays to dismiss to get back to the receipt, and on a phone the list stayed
 * fully rendered behind the form -- so the user could not tell which surface they
 * were actually editing.
 *
 * It IS a dialog, deliberately. Rendered inline on the receipt page it grew the
 * document instead of the surface, so the user scrolled the page to work a line
 * and lost sight of the receipt they were building. One modal with both sections
 * inside keeps the context fixed and gives the body its own scroll
 * (`AppModal`: `max-h-[95vh]` + `overflow-y-auto`), so the page never grows.
 * What matters is that there is exactly ONE of these -- never a second dialog
 * inside it.
 *
 * Layout is split panes from `md` up, and ONE PANE AT A TIME below it. The split
 * is the wrong shape on a phone for a reason that is about content, not width:
 * the list is a scrolling column and the form is a tall stack of number fields.
 * Side by side, both get a short scroll area and the form's primary action ends
 * up under the fold. So below `md` the list fills the surface, choosing a line
 * swaps to the form, and the Back button returns -- the standard master/detail
 * shape, and the only one where neither pane is clipped.
 *
 * The swap is driven by CSS breakpoints rather than a JS media query so there is
 * no width-dependent render to disagree with the stylesheet after a resize.
 *
 * `lines` is the outstanding catalogue straight from ERPNext's
 * `make_purchase_receipt`, whose map condition (purchase_order.py:782-786)
 * already excludes fully received and `delivered_by_supplier` lines. Nothing here
 * re-derives an outstanding quantity.
 *
 * Keyed by `purchase_order_item`, never `item_code`: ERPNext permits the same
 * item on several PO lines (`allow_duplicate_prev_row_id: True`,
 * purchase_receipt.py:317), so keying on the code would make two distinct lines
 * indistinguishable and let the same line be picked twice. Warehouse and rate
 * are surfaced on each row so a repeat is visible rather than silent.
 */
export default function ReceiptItemWorkbench({
  show,
  onClose,
  lines,
  purchaseOrders = [],
  selectedPurchaseOrder,
  onPurchaseOrderChange,
  pickedKeys = [],
  onPick,
  row,
  info,
  uomError,
  rateEditable,
  plateEnabled,
  plateRow,
  plateConfig,
  company,
  onItemChange,
  onSave,
  selectionOnly = false,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  // Which pane owns a narrow screen. Ignored at md+ -- both panes are visible
  // there regardless, which is the whole point of the split.
  const [pane, setPane] = useState("list");


  const picked = useMemo(() => new Set(pickedKeys), [pickedKeys]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const referenceLines = selectedPurchaseOrder
      ? lines.filter((line) => line.purchase_order === selectedPurchaseOrder)
      : lines;
    if (!q) return referenceLines;
    return referenceLines.filter(
      (l) =>
        (l.item_code || "").toLowerCase().includes(q) ||
        (l.item_name || "").toLowerCase().includes(q) ||
        (l.warehouse || "").toLowerCase().includes(q),
    );
  }, [lines, query, selectedPurchaseOrder]);

  // Reopening must land on the list, not wherever the last pick left it. Reset
  // here rather than in an effect keyed on `show`: a render-driven setState in an
  // effect cascades, and the parent keeps `editing` set across a close, so
  // "did it just open?" is not the question -- every exit funnels through here.
  const close = () => {
    setPane("list");
    onClose();
  };

  const key = (l) => l.purchase_order_item || l.item_code;

  const choose = (line) => {
    onPick(line);
    // Narrow screens swap to the form straight away; at md+ this is a no-op
    // because both panes are already showing.
    setPane("form");
  };

  if (!show) return null;

  const listVisible = pane === "list" ? "flex" : "hidden md:flex";
  const formVisible = pane === "form" ? "flex" : "hidden md:flex";

  return (
    <AppModal
      show={show}
      onClose={close}
      width="xl"
      title={t("store.receipt.picker.title")}
      footer={
        <Button variant="outline" onClick={close}>
          {t("common.close")}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-4">
      {/* ---------------- Section 1: outstanding lines, searchable --------------- */}
      <section
        className={`${listVisible} min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3`}
      >
        <h3 className="text-sm font-semibold">{t("store.receipt.picker.title")}</h3>

        {purchaseOrders.length > 1 ? (
          <FormField label={t("store.receipt.referencePurchaseOrder")}>
            <select
              value={selectedPurchaseOrder || purchaseOrders[0]}
              onChange={(event) => onPurchaseOrderChange?.(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {purchaseOrders.map((purchaseOrder) => (
                <option key={purchaseOrder} value={purchaseOrder}>
                  {purchaseOrder}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("store.receipt.picker.search")}
            aria-label={t("store.receipt.picker.search")}
            className="pl-8"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {t("store.receipt.picker.count", {
            shown: visible.length,
            total: lines.length,
          })}
        </p>

        {visible.length === 0 ? (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
            <Package className="size-4" />
            {lines.length === 0
              ? t("store.receipt.nothingOutstanding", { po: "" })
              : t("store.receipt.picker.noMatch")}
          </p>
        ) : (
          <ul className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto pr-1 md:max-h-[60vh]">
            {visible.map((line) => {
              const k = key(line);
              const already = picked.has(k);
              return (
                <li key={k}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => choose(line)}
                    className="flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {line.item_code}
                        {line.item_name ? (
                          <span className="ml-2 font-normal text-muted-foreground">
                            {line.item_name}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {line.warehouse ? (
                          <span>
                            {t("store.labels.targetWarehouse")}: {line.warehouse}
                          </span>
                        ) : null}
                        {line.rate !== "" && line.rate !== undefined && line.rate !== null ? (
                          <span>
                            {t("store.receipt.rate")}: {line.rate}
                          </span>
                        ) : null}
                        <span>
                          {line.pending_qty ?? line.qty} {line.uom}
                        </span>
                      </div>
                    </div>
                    {already ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Check className="size-3.5" />
                        {t("store.receipt.picker.added")}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("common.add")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------------- Section 2: complete the chosen line ------------------- */}
      <section
        className={`${formVisible} min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3`}
      >
        {/* Back is narrow-screen only; at md+ both panes show at once, so a Back
            button would tell the user to hide a pane they cannot address. */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPane("list")}
            className="md:hidden"
          >
            <ArrowLeft className="size-4" />
            {t("common.back")}
          </Button>
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {row ? row.item_code : t("store.receipt.picker.title")}
          </h3>
        </div>

        {row && selectionOnly ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">{row.item_name || row.item_code}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.purchase_order} · {row.pending_qty ?? row.qty} {row.uom}</p>
            </div>
            <FormField label={t("store.receipt.receivedQty")} required>
              <Input
                type="number"
                min="0"
                max={row.pending_qty}
                step="any"
                value={row.qty ?? ""}
                onChange={(event) => {
                  const qty = event.target.value;
                  const factor = Number(row.conversion_factor) || 1;
                  onSave({ ...row, qty, stock_qty: Number(qty) * factor });
                }}
              />
            </FormField>
            <FormField label={t("store.receipt.uom")}>
              <Input value={row.uom || ""} readOnly disabled />
            </FormField>
            <FormField label={t("store.receipt.acceptedWarehouse")} required>
              <LinkField
                doctype="Warehouse"
                value={row.warehouse || ""}
                filters={{ company, is_group: 0 }}
                onChange={(warehouse) => onSave({ ...row, warehouse: warehouse || "" })}
              />
            </FormField>
            <FormField label={t("store.receipt.rejectedQty")}>
              <Input
                type="number"
                min="0"
                max={row.pending_qty}
                step="any"
                value={row.rejected_qty ?? ""}
                onChange={(event) => onSave({ ...row, rejected_qty: event.target.value })}
              />
            </FormField>
            {(Number(row.rejected_qty) || 0) > 0 ? (
              <FormField label={t("store.receipt.rejectedWarehouse")} required>
                <LinkField
                  doctype="Warehouse"
                  value={row.rejected_warehouse || ""}
                  filters={{ company, is_group: 0 }}
                  onChange={(warehouse) => onSave({ ...row, rejected_warehouse: warehouse || "" })}
                />
              </FormField>
            ) : null}
          </div>
        ) : row ? (
          <ReceiptLineForm
            row={row}
            info={info}
            uomError={uomError}
            rateEditable={rateEditable}
            plateEnabled={plateEnabled}
            plateRow={plateRow}
            plateConfig={plateConfig}
            company={company}
            onItemChange={onItemChange}
            onSave={onSave}
          />
        ) : (
          <FormField label="">
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("store.receipt.picker.pickFirst")}
            </p>
          </FormField>
        )}
        </section>
      </div>
    </AppModal>
  );
}
