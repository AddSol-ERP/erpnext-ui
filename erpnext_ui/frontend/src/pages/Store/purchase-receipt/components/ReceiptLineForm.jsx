import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Scale } from "lucide-react";
import { FormField } from "../../../../components/FormField";
import FormSelect from "../../../../components/FormSelect";
import LinkField from "../../../../components/LinkField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BadgeCheck, Hash } from "lucide-react";
import {
  applyMeasuredTotal,
  batchRule,
  computeFactor,
  needsMeasuredTotal,
  needsSerials,
  perSerialFigures,
  parseSerials,
  serialCount,
  serialsAreGenerated,
  validateBatch,
  validateSerials,
  wholeNumberRules,
} from "../../../../lib/receiptConversion";

/**
 * The fields for one Purchase Receipt line, with no dialog chrome around them.
 *
 * Extracted so the same inputs render in two places without drifting: inline in
 * the picker's right-hand section, and in the dialog the receipt tray opens when
 * a line that is ALREADY added is edited. One implementation, so the measured
 * total, the derived factor and the PO locks cannot disagree between them.
 *
 * The whole point of this form is that it asks for NUMBERS, never for ERPNext
 * mechanics. There is no conversion-factor input anywhere here, and there never
 * should be: on a weighed receipt the factor is a measurement that changes every
 * delivery, so it is derived from a total as the user types (`total / qty`, see
 * lib/receiptConversion.js for the four ERPNext rules that make this legal).
 * Asking for it -- or reading it from item master -- is how a receipt books the
 * nominal weight instead of the real one.
 *
 * Received UOM
 *   Fixed on a PO receipt, free on a direct one. `validate_with_previous_doc`
 *   compares `uom` against the PO line (purchase_receipt.py:315) and throws on a
 *   mismatch, so offering a free choice there could only ever produce a save
 *   failure. Rendered as the same control either way so there is one mental
 *   model.
 *
 * Measured total
 *   Offered only when the received UOM differs from the stock UOM -- exactly the
 *   condition under which a factor other than 1 survives ERPNext's force-reset
 *   (stock_controller.py:110-116). Required, not optional: a missing total
 *   defaulting to factor 1 would book the piece count as stock.
 */
export default function ReceiptLineForm({
  row,
  info,
  uomError,
  rateEditable,
  onItemChange,
  onSave,
}) {
  const { t } = useTranslation();

  const isPoRow = !!(row && row.purchase_order_item);
  const receivedUom = row?.uom || info?.stock_uom || "";
  const wantsTotal = needsMeasuredTotal(info, receivedUom);
  const rules = useMemo(
    () => wholeNumberRules(info, receivedUom),
    [info, receivedUom],
  );
  const factor = useMemo(
    () => (wantsTotal ? computeFactor(row?.qty, row?.measured_total) : 1),
    [wantsTotal, row?.qty, row?.measured_total],
  );

  const serialised = needsSerials(info);
  const autoSerials = serialsAreGenerated(info);
  const serials = serialCount(row);
  const figures = perSerialFigures(row);
  const batch = batchRule(info);

  if (!row) return null;

  /** Patch a field, then re-derive factor and stock_qty together. */
  const edit = (patch) => {
    const next = { ...row, ...patch };
    onSave(wantsTotal ? applyMeasuredTotal(next, next.measured_total) : next);
  };

  const uomOptions = (info?.uoms || []).map((u) => ({ value: u.uom, label: u.uom }));

  const qtyHint =
    wantsTotal && factor !== null && Number.isFinite(Number(factor))
      ? t("store.receipt.perEach", {
          factor: Number(factor.toFixed(6)),
          uom: info?.stock_uom,
        })
      : null;

  return (
    <div className="flex flex-col gap-3">
      {row.item_name ? (
        <div className="text-sm text-muted-foreground">
          {t("store.receipt.picker.itemSubtitle", { name: row.item_name })}
        </div>
      ) : null}

      {/* ITEM -- only editable on a direct entry. A PO row's item_code is
          compared against the PO line (purchase_receipt.py:315), so it is fixed;
          a free row has to offer the picker somewhere or it can never be filled
          in. */}
      {!isPoRow ? (
        <FormField label={t("store.form.item")} required>
          <LinkField
            doctype="Item"
            value={row.item_code}
            onChange={(v) => onItemChange(row._rid, v)}
          />
        </FormField>
      ) : null}

      {/* RECEIVED UOM */}
      <FormField
        label={t("store.receipt.receivedUom")}
        hint={isPoRow ? t("store.receipt.uomFromPo") : t("store.receipt.uomPickHint")}
      >
        {isPoRow ? (
          <div className="flex items-center gap-2">
            <Input value={receivedUom} disabled />
            <Lock className="size-3.5 shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <FormSelect
            value={receivedUom}
            options={uomOptions}
            onChange={(v) => edit({ uom: v })}
          />
        )}
      </FormField>

      {/* QUANTITY in the received UOM */}
      <FormField
        label={t("store.receipt.qtyIn", { uom: receivedUom })}
        hint={
          rules.mustWholeQty
            ? t("store.receipt.wholeNumberNote", { uom: receivedUom })
            : undefined
        }
        required
      >
        <Input
          type="number"
          step="any"
          value={row.qty ?? ""}
          onChange={(e) => edit({ qty: e.target.value })}
        />
      </FormField>

      {/* MEASURED TOTAL in the stock UOM */}
      {wantsTotal ? (
        <FormField
          label={t("store.receipt.totalIn", { uom: info.stock_uom })}
          hint={t("store.receipt.totalHint", { uom: info.stock_uom })}
          required
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="any"
              value={row.measured_total ?? ""}
              onChange={(e) => edit({ measured_total: e.target.value })}
            />
            <Scale className="size-3.5 shrink-0 text-muted-foreground" />
          </div>
          {qtyHint ? (
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              {qtyHint}
            </p>
          ) : null}
        </FormField>
      ) : null}

      {/* Derived. Read-only by design -- this is the number, not an input. */}
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t("store.receipt.stockQtyIn", { uom: info?.stock_uom })}
          </span>
          <span className="font-medium">
            {row.stock_qty === "" || row.stock_qty === undefined
              ? "—"
              : `${row.stock_qty} ${info?.stock_uom || ""}`}
          </span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted-foreground">
            {t("store.receipt.factor")}
          </span>
          <span className="font-medium">
            {row.conversion_factor === "" || row.conversion_factor === undefined
              ? "—"
              : Number(row.conversion_factor).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}
          </span>
        </div>
      </div>

      {/* RATE */}
      <FormField
        label={t("store.receipt.rate")}
        hint={rateEditable ? undefined : t("store.receipt.rateFromPo")}
        required
      >
        <Input
          type="number"
          step="any"
          value={row.rate ?? ""}
          disabled={!rateEditable}
          onChange={(e) => edit({ rate: e.target.value })}
        />
      </FormField>

      {/* WAREHOUSE */}
      <FormField label={t("store.labels.targetWarehouse")} required>
        <LinkField
          doctype="Warehouse"
          value={row.warehouse}
          onChange={(v) => edit({ warehouse: v || "" })}
        />
      </FormField>

      {/* SERIAL NUMBERS -- one per STOCK unit, which for a weighed item means one
          per Kg. Not "one per piece": ERPNext builds one bundle entry per serial
          (qty 1) and asserts the bundle total equals the SLE's stock_qty, so the
          count is measured in stock, never in transaction UOM. */}
      {serialised ? (
        <FormField
          label={t("store.receipt.serialNumbers", { count: serials, uom: info?.stock_uom })}
          hint={
            autoSerials
              ? t("store.receipt.serialAuto", { count: serials })
              : t("store.receipt.serialTyped", { count: serials })
          }
          required
          error={validateSerials(row, info)}
        >
          {autoSerials ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <BadgeCheck className="size-4 shrink-0 text-emerald-600" />
              <span className="text-sm text-muted-foreground">
                {t("store.receipt.serialWillGenerate", { series: info.serial_no_series })}
              </span>
            </div>
          ) : (
            <Textarea
              value={row.serial_no || ""}
              rows={Math.min(8, Math.max(3, serials))}
              onChange={(e) => onSave({ ...row, serial_no: e.target.value })}
              placeholder={t("store.receipt.serialPlaceholder", { count: serials })}
              aria-label={t("store.receipt.serialNumbers", {
                count: serials,
                uom: info?.stock_uom,
              })}
              className="font-mono text-xs"
            />
          )}

          {/* Derived per-serial figures. Read-only on purpose: neither Serial No
              nor Serial and Batch Entry has a weight field, and their rate
              fields are read_only / no_copy -- ERPNext derives both from the row.
              Showing them here is a statement, not an input. */}
          {serials > 0 ? (
            <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("store.receipt.perSerialWeight", { uom: info?.stock_uom })}
                </span>
                <span className="font-medium tabular-nums">
                  {Number(figures.weightPerSerial.toFixed(6))} {info?.stock_uom}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">
                  {t("store.receipt.perSerialValue")}
                </span>
                <span className="font-medium tabular-nums">
                  {Number(figures.ratePerSerial.toFixed(6))}
                </span>
              </div>
              {!autoSerials && parseSerials(row.serial_no).length !== serials ? (
                <p className="mt-1 text-[11px] text-amber-600">
                  {t("store.receipt.serialProgress", {
                    entered: parseSerials(row.serial_no).length,
                    expected: serials,
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </FormField>
      ) : null}

      {/* BATCH -- only when the item is batched, and typed only when ERPNext
          will not generate one (create_new_batch + a batch_number_series). */}
      {batch === "required" ? (
        <FormField
          label={t("store.receipt.batchNo")}
          required
          error={validateBatch(row, info)}
        >
          <div className="flex items-center gap-2">
            <Input
              value={row.batch_no || ""}
              onChange={(e) => onSave({ ...row, batch_no: e.target.value })}
              placeholder={t("store.receipt.batchPlaceholder")}
            />
            <Hash className="size-3.5 shrink-0 text-muted-foreground" />
          </div>
        </FormField>
      ) : batch === "auto" ? (
        <FormField
          label={t("store.receipt.batchNo")}
          hint={t("store.receipt.batchAuto", { series: info.batch_number_series })}
        >
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <BadgeCheck className="size-4 shrink-0 text-emerald-600" />
            <span className="text-sm text-muted-foreground">
              {t("store.receipt.batchWillGenerate")}
            </span>
          </div>
        </FormField>
      ) : null}

      {/* REJECTED */}
      <FormField label={t("store.receipt.rejectedQty")}>
        <Input
          type="number"
          step="any"
          value={row.rejected_qty ?? ""}
          onChange={(e) => edit({ rejected_qty: e.target.value })}
        />
      </FormField>

      {/* Validation state, shown once something is wrong rather than hidden. */}
      {uomError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {uomError}
        </p>
      ) : null}
    </div>
  );
}