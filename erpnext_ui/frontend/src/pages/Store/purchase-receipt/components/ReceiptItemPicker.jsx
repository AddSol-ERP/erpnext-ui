import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Check, Package } from "lucide-react";
import AppModal from "../../../../components/AppModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Choose which outstanding Purchase Order lines to receive.
 *
 * Why a picker rather than a list of every line: a PO can carry dozens of lines
 * (`PUR-ORD-2026-00010` has 28), and a shopfloor user receiving three of them
 * was previously asked to read a full-height stack of cards to find three rows.
 * Listing only what has NOT been received also removes the question "is this
 * line still to do, or did I already do it?" -- the single most common source
 * of double-receiving.
 *
 * `lines` is the outstanding catalogue supplied by the caller. It comes
 * straight from ERPNext's own `make_purchase_receipt`, whose map condition
 * (purchase_order.py:782-786) already excludes lines that are fully received or
 * `delivered_by_supplier`. Nothing here re-derives an outstanding quantity.
 *
 * Keyed by `purchase_order_item`, never by `item_code`: ERPNext permits the
 * same item on several PO lines (`allow_duplicate_prev_row_id: True`,
 * purchase_receipt.py:317), so keying on the code would make two distinct lines
 * indistinguishable and let the same line be picked twice. We surface the
 * warehouse and rate on each row so a repeat is visible rather than silent.
 */
export default function ReceiptItemPicker({
  show,
  onClose,
  lines,
  pickedKeys = [],
  onPick,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const picked = useMemo(() => new Set(pickedKeys), [pickedKeys]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) =>
        (l.item_code || "").toLowerCase().includes(q) ||
        (l.item_name || "").toLowerCase().includes(q) ||
        (l.warehouse || "").toLowerCase().includes(q),
    );
  }, [lines, query]);

  const key = (l) => l.purchase_order_item || l.item_code;

  const toggle = (line) => {
    const k = key(line);
    if (picked.has(k)) return;
    onPick(line);
  };

  return (
    <AppModal
      show={show}
      onClose={onClose}
      width="lg"
      title={t("store.receipt.picker.title")}
      footer={
        <>
          <span className="mr-auto text-xs text-muted-foreground">
            {t("store.receipt.picker.count", {
              shown: visible.length,
              total: lines.length,
            })}
          </span>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-hidden px-5 py-4">
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

        {visible.length === 0 ? (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
            <Package className="size-4" />
            {lines.length === 0
              ? t("store.receipt.nothingOutstanding", { po: "" })
              : t("store.receipt.picker.noMatch")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 overflow-y-auto pr-1">
            {visible.map((line) => {
              const k = key(line);
              const already = picked.has(k);
              return (
                <li key={k}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => toggle(line)}
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
                          <span>{t("store.labels.targetWarehouse")}: {line.warehouse}</span>
                        ) : null}
                        {line.rate !== "" && line.rate !== undefined && line.rate !== null ? (
                          <span>{t("store.receipt.rate")}: {line.rate}</span>
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
      </div>
    </AppModal>
  );
}