import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { get } from "../../../../services/api";
import { Lock, Scale } from "lucide-react";
import { FormField } from "../../../../components/FormField";
import FormSelect from "../../../../components/FormSelect";
import LinkField from "../../../../components/LinkField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BadgeCheck, Hash } from "lucide-react";
import {
  applyMeasuredTotal,
  applyQuantity,
  conversionBasis,
  conversionDrift,
  conversionDriftSuspicious,
  batchRule,
  conversionPreview,
  computeFactor,
  estimatedLineWeight,
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
import { ratePerUomLabel } from "../../../../lib/uomPricing";

function formatReceiptNumber(value, maximumFractionDigits = 3) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("en-IN", { maximumFractionDigits });
}

function formatRupees(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

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
  plateEnabled = false,
  plateRow = false,
  plateConfig = {},
  company,
  pricingUom = "",
  onItemChange,
  onSave,
}) {
  const { t } = useTranslation();

  // UOM based pricing: the rate label names the pricing UOM the effective rule
  // picked, not a hardcoded "Kg". Falls back to the i18n key when no pricing UOM
  // has been resolved yet, so the current kg flow keeps rendering unchanged.
  const rateLabel = ratePerUomLabel(pricingUom);

  // UOM based pricing: live preview of the derived standard rate and amount as
  // the user types the rate per pricing UOM. The authoritative conversion
  // happens on save (server side override); this preview only keeps the user
  // oriented. Debounced so a keystroke does not fire a request per character.
  const [pricingResult, setPricingResult] = useState(null);
  useEffect(() => {
    if (!pricingUom || !row?.item_code) {
      const handle = setTimeout(() => setPricingResult(null), 0);
      return () => clearTimeout(handle);
    }
    const rate = row?.rate;
    const qty = row?.qty;
    if (rate === "" || rate === null || rate === undefined || qty === "" || qty === null || qty === undefined) {
      const handle = setTimeout(() => setPricingResult(null), 0);
      return () => clearTimeout(handle);
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const res = await get("method/erpnext_ui.api.calculate_uom_pricing_line", {
          item_code: row.item_code,
          rate_per_uom: rate,
          doc_qty: qty,
          side: "buying",
        });
        if (cancelled) return;
        const message = res?.message ?? res ?? {};
        setPricingResult(message && Object.keys(message).length ? message : null);
      } catch {
        if (cancelled) return;
        setPricingResult(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [pricingUom, row?.item_code, row?.rate, row?.qty]);

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
  const conversion = conversionPreview(row, info, receivedUom);
  const basis = conversionBasis(row);
  const drift = conversionDrift(row);
  const isPlate = plateEnabled && plateRow;
  const plateQty = Number(row?.qty);
  const unitWeight = Number(
    row?.custom_unit_weight_kg || row?.item_weight_per_unit || row?.weight_per_unit,
  );
  const estimatedWeight =
    Number.isFinite(plateQty) && Number.isFinite(unitWeight) && unitWeight > 0
      ? plateQty * unitWeight
      : 0;
  const supplierWeight = Number(row?.custom_supplier_weight_kg);
  const weighbridgeWeight = Number(row?.custom_weighbridge_weight_kg);
  const measuredWeight = supplierWeight > 0 ? supplierWeight : weighbridgeWeight;
  const variancePct =
    estimatedWeight > 0 && Number.isFinite(measuredWeight) && measuredWeight > 0
      ? Number((((measuredWeight - estimatedWeight) / estimatedWeight) * 100).toFixed(2))
      : null;
  const needsWeightDecision =
    variancePct !== null &&
    Math.abs(variancePct) > Number(plateConfig.weight_tolerance_pct || 0);
  const acceptedWeight = !needsWeightDecision
    ? measuredWeight > 0
      ? measuredWeight
      : null
    : row?.custom_weight_decision === "Accept Supplier Weight"
      ? supplierWeight
      : row?.custom_weight_decision === "Accept Estimated Weight"
        ? estimatedWeight
        : row?.custom_weight_decision === "Accept Weighbridge Weight" &&
            Number(row?.custom_weighbridge_weight_kg) > 0
          ? Number(row.custom_weighbridge_weight_kg)
          : null;
  const weightPerPlate =
    acceptedWeight !== null && plateQty > 0
      ? acceptedWeight / plateQty
      : Number(row?.custom_weight_per_plate_kg) > 0
        ? Number(row.custom_weight_per_plate_kg)
        : null;
  const plateAmount =
    acceptedWeight !== null && Number(row?.custom_rate_per_kg) > 0
      ? Math.round(
          (acceptedWeight * Number(row.custom_rate_per_kg) + Number.EPSILON) * 100,
        ) / 100
      : null;
  const plateRate =
    plateAmount !== null && plateQty > 0
      ? plateAmount / plateQty
      : Number(row?.rate) > 0
        ? Number(row.rate)
        : null;

  // The ordered rate, kept so clearing a measurement restores it instead of
  // stranding the row at factor 1.
  const fallback = useMemo(
    () => ({
      conversion_factor: row?.factor_from_po,
      conversion_source: row?.factor_source_po,
    }),
    [row?.factor_from_po, row?.factor_source_po],
  );

  if (!row) return null;

  /**
   * Patch a field, then keep factor and stock_qty in agreement.
   *
   * A quantity edit is its own path: with no weight on the row, going through
   * `applyMeasuredTotal` would leave stock_qty at the OLD qty x factor, so
   * 10 -> 12 Nos still posted 10,000 Kg.
   */
  const edit = (patch) => {
    const next = { ...row, ...patch };
    if ("custom_supplier_weight_kg" in patch) {
      next.supplier_weight_defaulted = false;
    }
    if (
      isPlate &&
      "custom_weighbridge_weight_kg" in patch &&
      Number(patch.custom_weighbridge_weight_kg) > 0 &&
      row.supplier_weight_defaulted
    ) {
      next.custom_supplier_weight_kg = "";
      next.supplier_weight_defaulted = false;
    }
    if (isPlate && "qty" in patch && row.supplier_weight_defaulted) {
      next.custom_supplier_weight_kg = estimatedLineWeight(next) ?? "";
    }
    if (isPlate && "qty" in patch) next.custom_weight_decision = "";
    if ("qty" in patch && !(patch.measured_total > 0)) {
      onSave(applyQuantity(next, next.qty, fallback));
      return;
    }
    if ("measured_total" in patch || wantsTotal) {
      onSave(applyMeasuredTotal(next, next.measured_total, fallback));
      return;
    }
    onSave(next);
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

      {/* THE CONVERSION, shown the moment the two units differ.
          This is the calculation the user is actually doing -- pieces weighed
          against kilograms -- and it used to exist only as a number in a derived
          panel two fields down, which read as a number rather than as the
          relationship they had just entered.

          Shown before any weight is typed as well: the point is that one piece
          is worth N kilograms, not that a total arrived. */}
      {conversion ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium uppercase tracking-wide text-muted-foreground">
              {t("store.receipt.conversion", {
                from: conversion.from,
                to: conversion.to,
              })}
            </span>
            {/* Which number the factor below came from. Without this the user
                cannot tell an ordered rate from one they typed. */}
            <span
              className={
                basis === "unresolved"
                  ? "font-medium text-amber-600"
                  : "text-muted-foreground"
              }
            >
              {basis === "measured"
                ? t("store.receipt.basisMeasured")
                : basis === "purchase_order"
                  ? t("store.receipt.basisPo")
                  : t("store.receipt.basisUnresolved")}
            </span>
          </div>
          {conversion.perUnit === null && basis === "purchase_order" ? (
            <div className="flex justify-between tabular-nums">
              <span className="text-muted-foreground">
                {t("store.receipt.oneOf", { from: conversion.from })}
              </span>
              <span className="font-medium">
                {t("store.receipt.equals", {
                  factor: Number(Number(row?.conversion_factor).toFixed(6)),
                  to: conversion.to,
                })}
              </span>
            </div>
          ) : null}
          {conversion.perUnit !== null ? (
            <div className="flex justify-between tabular-nums">
              <span className="text-muted-foreground">
                {t("store.receipt.oneOf", { from: conversion.from })}
              </span>
              <span className="font-medium">
                {t("store.receipt.equals", {
                  factor: Number(conversion.perUnit.toFixed(6)),
                  to: conversion.to,
                })}
              </span>
            </div>
          ) : null}
          {/* A large gap between the ordered rate and the measured one is
              nearly always a slip -- the weight of the whole delivery typed
              onto one sheet's line. The total is still arithmetically correct,
              so nothing would warn us but this. */}
          {conversionDriftSuspicious(row) && drift !== null ? (
            <p className="mt-1 text-[11px] font-medium text-amber-600">
              {t("store.receipt.driftWarning", {
                factor: Number(drift.toFixed(2)),
              })}
            </p>
          ) : null}
          {conversion.thisQty !== null && conversion.thisTotal !== null ? (
            <div className="mt-1 flex justify-between tabular-nums">
              <span className="text-muted-foreground">
                {t("store.receipt.thisDelivery")}
              </span>
              <span className="font-medium">
                {t("store.receipt.equals", {
                  factor: conversion.thisQty,
                  to: conversion.thisTotal,
                })}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

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

        {/* Partial receipt is allowed and common: the row opens holding the
            FULL outstanding quantity, which reads as "you must receive all of
            it". ERPNext writes back `received_qty` against the ordered `qty`, so
            taking one sheet of ten simply leaves nine outstanding. Say so,
            rather than leaving the user to guess whether they can reduce it. */}
        {row.pending_qty !== undefined && row.pending_qty !== null && Number(row.pending_qty) > 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {(Number(row.qty) || 0) < Number(row.pending_qty)
              ? t("store.receipt.receivingOf", {
                  qty: Number(row.qty) || 0,
                  pending: row.pending_qty,
                  uom: receivedUom,
                })
              : t("store.receipt.receivingAll", {
                  pending: row.pending_qty,
                  uom: receivedUom,
                })}
          </p>
        ) : null}
      </FormField>

      {/* MEASURED TOTAL in the stock UOM */}
      {wantsTotal ? (
        <FormField
          label={t("store.receipt.totalInOptional", { uom: info.stock_uom })}
          hint={
            row?.factor_from_po
              ? t("store.receipt.totalHintOptional", {
                  uom: info.stock_uom,
                  factor: Number(Number(row.factor_from_po).toFixed(6)),
                })
              : t("store.receipt.totalHint", { uom: info.stock_uom })
          }
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

      {isPlate ? (
        <section className="flex flex-col gap-3 rounded-md border border-border p-3">
          <h4 className="text-sm font-semibold">{t("store.receipt.plateDetails")}</h4>
          <FormField label={t("store.receipt.supplierWeight")} hint={t("store.receipt.supplierWeightOptional")}>
            <Input
              type="number"
              min="0"
              step="any"
              value={row.custom_supplier_weight_kg ?? ""}
              onChange={(e) =>
                edit({
                  custom_supplier_weight_kg: e.target.value,
                  custom_weight_decision: "",
                })
              }
            />
          </FormField>
          <FormField label={t("store.receipt.weighbridgeWeight")}>
            <Input
              type="number"
              min="0"
              step="any"
              value={row.custom_weighbridge_weight_kg ?? ""}
              onChange={(e) =>
                edit({
                  custom_weighbridge_weight_kg: e.target.value,
                  custom_weight_decision: "",
                })
              }
            />
          </FormField>

          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
            <div className="flex justify-between gap-3">
              <span>{t("store.receipt.theoreticalWeightPerPlate")}</span>
              <span className="font-medium tabular-nums">
                {unitWeight > 0 ? `${formatReceiptNumber(unitWeight)} Kg` : "—"}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span>{t("store.receipt.estimatedWeight")}</span>
              <span className="font-medium tabular-nums">
                {estimatedWeight > 0 ? `${formatReceiptNumber(estimatedWeight)} Kg` : "—"}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span>{t("store.receipt.weightVariance")}</span>
              <span className="font-medium tabular-nums">
                {variancePct === null ? "—" : `${variancePct.toFixed(2)}%`}
                {variancePct !== null
                  ? ` · ${t("store.receipt.tolerance", {
                      value: plateConfig.weight_tolerance_pct,
                    })}`
                  : ""}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span>{t("store.receipt.acceptedWeight")}</span>
              <span className="font-medium tabular-nums">
                {acceptedWeight === null ? "—" : `${formatReceiptNumber(acceptedWeight)} Kg`}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span>{t("store.receipt.weightPerPlate")}</span>
              <span className="font-medium tabular-nums">
                {weightPerPlate === null ? "—" : `${formatReceiptNumber(weightPerPlate)} Kg`}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span>{t("store.receipt.standardRate")}</span>
              <span className="font-medium tabular-nums">{formatRupees(plateRate)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 font-medium">
              <span>{t("store.receipt.lineAmount")}</span>
              <span className="tabular-nums">{formatRupees(plateAmount)}</span>
            </div>
          </div>

          {needsWeightDecision ? (
            <>
              {plateConfig.can_decide_weight ? (
                <>
                  <FormField label={t("store.receipt.weightDecision")} required>
                    <FormSelect
                      value={row.custom_weight_decision || ""}
                      placeholder={t("store.receipt.chooseWeightDecision")}
                      options={[
                        ...(supplierWeight > 0
                          ? [{ value: "Accept Supplier Weight", label: t("store.receipt.acceptSupplierWeight") }]
                          : []),
                        { value: "Accept Estimated Weight", label: t("store.receipt.acceptEstimatedWeight") },
                        { value: "Accept Weighbridge Weight", label: t("store.receipt.acceptWeighbridgeWeight") },
                      ]}
                      onChange={(value) =>
                        onSave({ ...row, custom_weight_decision: value })
                      }
                    />
                  </FormField>
                </>
              ) : (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                  {t("store.receipt.weightApprovalRequired")}
                </p>
              )}
            </>
          ) : null}

          <FormField label={rateLabel || t("store.receipt.ratePerKg")} hint={t("store.receipt.ratePerKgHint")} required>
            <Input
              type="number"
              min="0"
              step="any"
              value={row.custom_rate_per_kg ?? ""}
              onChange={(e) =>
                onSave({ ...row, custom_rate_per_kg: e.target.value })
              }
            />
          </FormField>
        </section>
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
      {!isPlate ? <FormField
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
      </FormField> : null}

      {/* UOM based pricing: live preview of the derived standard rate and
          amount. Only renders when a pricing UOM is resolved for the Item, so
          unconfigured Items keep the standard rate input unchanged. */}
      {pricingUom && pricingResult ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("store.receipt.chargeableQty", { uom: pricingUom })}
            </span>
            <span className="font-medium tabular-nums">
              {pricingResult.chargeable_qty ?? "—"} {pricingUom}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">
              {t("store.receipt.standardRate")}
            </span>
            <span className="font-medium tabular-nums">
              {formatRupees(pricingResult.standard_rate)}
            </span>
          </div>
          <div className="mt-1 flex justify-between font-medium">
            <span className="text-muted-foreground">
              {t("store.receipt.lineAmount")}
            </span>
            <span className="tabular-nums">
              {formatRupees(pricingResult.amount)}
            </span>
          </div>
        </div>
      ) : null}

      {/* WAREHOUSE */}
      <FormField label={t("store.receipt.acceptedWarehouse")} required>
        <LinkField
          doctype="Warehouse"
          value={row.warehouse}
          filters={{ company, is_group: 0 }}
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

      {/* Validation state, shown once something is wrong rather than hidden. */}
      {uomError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {uomError}
        </p>
      ) : null}
    </div>
  );
}
