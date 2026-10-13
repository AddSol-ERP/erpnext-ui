import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, Table2, Trash2, Info, Lock } from "lucide-react";
import { get } from "../../../../services/api";
import { saveDocument, submitDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import FormSelect from "../../../../components/FormSelect";
import LinkField from "../../../../components/LinkField";
import { focusFirstError } from "../../../../lib/formValidation";
import { useHeader } from "../../../../context/HeaderContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localDateISO } from "../../../../utils/localDateTime";

/**
 * Receive material into the store — a Purchase Receipt.
 *
 * Two ways in, one form:
 *
 *   /store/purchase-receipt/new?po=PO-0001  mapped from a Purchase Order
 *   /store/purchase-receipt/new             no PO, items added by hand
 *
 * ERPNext constraints this screen is built around, all verified in v15 source:
 *
 * 1. `validate_with_previous_doc` (purchase_receipt.py:306-316) compares
 *    **project, uom and item_code** against the PO line for every row that
 *    carries a `purchase_order_item`. A mismatch throws "Incorrect value in row
 *    N: UOM must be equal to 'Kg'". `uom`/`conversion_factor` are excluded
 *    from the comparison only when `is_return` is set (transaction_base.py:96).
 *    So on a PO-linked row those fields are **locked**, not merely validated —
 *    offering a picker would only produce a save failure.
 *
 * 2. Duplicate `purchase_order_item` across two rows throws "Duplicate row"
 *    (transaction_base.py:109), so it is blocked here.
 *
 * 3. `validate_uom_is_integer` (purchase_receipt.py:276-278) rejects a
 *    fractional quantity against a UOM flagged `must_be_whole_number`, so that
 *    flag is fetched with the UOM list and enforced on the row.
 *
 * 4. A future `posting_date` throws (purchase_receipt.py:268).
 *
 * Conversion arithmetic is ERPNext's: `stock_qty = qty * conversion_factor`,
 * with the factor resolved from UOM Conversion Detail and falling back to 1.0.
 */

const SYSTEM_FIELDS = [
  "name", "owner", "creation", "modified", "modified_by", "idx", "docstatus",
  "amended_from", "amended_by", "_user_tags", "_comments", "_assign",
  "_liked_by", "doctype", "__islocal", "__unsaved",
];

const CHILD_SYSTEM_FIELDS = [
  "name", "parent", "parenttype", "parentfield", "docstatus", "idx",
  "__islocal", "__unsaved", "owner", "creation", "modified", "modified_by",
];

/** Strip system fields from the mapped doc so it can be saved as a new document. */
function toSavePayload(doc) {
  const out = { ...doc };
  SYSTEM_FIELDS.forEach((f) => delete out[f]);
  out.items = (doc.items || []).map((row) => {
    const clean = { ...row };
    CHILD_SYSTEM_FIELDS.forEach((f) => delete clean[f]);
    // transfer_qty / received_stock_qty are read_only and re-derived server-side
    // (set_stock_qty); posting a stale value would be discarded at best.
    delete clean.transfer_qty;
    delete clean.received_stock_qty;
    return clean;
  });
  return out;
}

const todayISO = localDateISO;

export default function PurchaseReceiptForm() {
  const { name } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const isEdit = !!name;
  // The PO name rides in the URL so nothing is written until Save: abandoning
  // the form leaves no half-created receipt, and a reload re-maps cleanly.
  const poName = searchParams.get("po");
  const fromPo = !!poName;

  const [loading, setLoading] = useState(!!(isEdit || poName));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({
    supplier: "",
    company: "",
    posting_date: todayISO(),
    set_warehouse: "",
    currency: "",
    conversion_rate: 1,
    items: [],
    docstatus: 0,
  });

  /** row index -> { stock_uom, uoms: [{uom, conversion_factor, must_be_whole_number}] } */
  const [uomInfo, setUomInfo] = useState({});

  // Toolbar actions are registered by an effect that deliberately does not
  // depend on `doc`, so the registered handlers would close over a stale
  // document. Handlers read through this ref.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  /* ================= LOADERS ================= */

  const autoCompany = useCallback(async () => {
    try {
      const company =
        (await get("method/frappe.client.get_list", {
          doctype: "Company",
          fields: JSON.stringify(["name"]),
          limit_page_length: 1,
        }))?.message?.[0]?.name || "";
      if (company) {
        setDoc((p) => (p.company ? p : { ...p, company }));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadUomInfo = useCallback(async (i, itemCode) => {
    if (!itemCode) return;
    try {
      const message = await get("method/erpnext_ui.api.get_item_uom_options", {
        item_code: itemCode,
      });
      setUomInfo((p) => ({ ...p, [i]: message }));
    } catch (e) {
      // Leave the row usable: the stock UOM still works at factor 1, which is
      // what ERPNext falls back to anyway.
      setUomInfo((p) => ({ ...p, [i]: { stock_uom: "", uoms: [], error: e.message } }));
    }
  }, []);

  const loadDoc = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get(`resource/Purchase Receipt/${name}`);
      const d = res.data;
      setDoc({
        supplier: d.supplier || "",
        company: d.company || "",
        posting_date: d.posting_date || todayISO(),
        set_warehouse: d.set_warehouse || "",
        currency: d.currency || "",
        conversion_rate: d.conversion_rate ?? 1,
        items: (d.items || []).map((r) => ({
          item_code: r.item_code,
          item_name: r.item_name,
          project: r.project || "",
          qty: r.qty ?? "",
          rejected_qty: r.rejected_qty ?? "",
          uom: r.uom || "",
          stock_uom: r.stock_uom || "",
          conversion_factor: r.conversion_factor ?? 1,
          stock_qty: r.stock_qty ?? "",
          rate: r.rate ?? "",
          warehouse: r.warehouse || "",
          purchase_order: r.purchase_order || "",
          purchase_order_item: r.purchase_order_item || "",
          rate_from_po: r.rate ?? "",
        })),
        docstatus: d.docstatus,
      });

      // Warm the UOM cache so an existing receipt shows its conversions.
      d.items?.forEach((r, i) => {
        if (r.item_code) loadUomInfo(i, r.item_code);
      });
    } catch {
      setError(t("common.failedToLoad", { name: t("store.receipt.title") }));
    } finally {
      setLoading(false);
    }
  }, [name, t, loadUomInfo]);

  /* ================= ITEMS ================= */

  const addRow = () => {
    setDoc((p) => ({
      ...p,
      items: [
        ...p.items,
        {
          item_code: "",
          item_name: "",
          project: "",
          qty: 1,
          rejected_qty: "",
          uom: "",
          stock_uom: "",
          conversion_factor: 1,
          stock_qty: 1,
          rate: "",
          warehouse: p.set_warehouse || "",
          purchase_order: "",
          purchase_order_item: "",
          rate_from_po: "",
        },
      ],
    }));
  };

  const updateRow = (i, patch) => {
    setDoc((p) => ({
      ...p,
      items: p.items.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    }));
  };

  const removeRow = (i) => {
    setDoc((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
    setUomInfo((p) => {
      const next = { ...p };
      delete next[i];
      return next;
    });
  };

  const isPoRow = (row) => !!row.purchase_order_item;

  /** Recompute the derived pair from qty + factor. ERPNext's own formula. */
  const applyQty = (i, qty, factor) => {
    const n = Number(qty);
    const f = Number(factor) || 1;
    updateRow(i, { qty, stock_qty: Number.isFinite(n) ? n * f : "" });
  };

  /** Item picked by hand: ask ERPNext for the whole row, then cache the UOMs. */
  const handleItemChange = async (i, itemCode) => {
    if (!itemCode) {
      updateRow(i, { item_code: "", item_name: "", uom: "", stock_uom: "" });
      return;
    }
    try {
      const current = docRef.current;
      const res = await get(
        "method/erpnext.stock.get_item_details.get_item_details",
        {
          args: JSON.stringify({
            item_code: itemCode,
            doctype: "Purchase Receipt",
            company: current.company || "",
            supplier: current.supplier || "",
            currency: current.currency || "",
            conversion_rate: current.conversion_rate ?? 1,
            posting_date: current.posting_date || todayISO(),
            set_warehouse: current.set_warehouse || "",
            uom: null,
            stock_uom: null,
            qty: 1,
          }),
        },
      );
      const d = res.message || res.data || {};

      // Resolve the UOM list first so the default UOM can honour its factor.
      let uomOptions = null;
      try {
        uomOptions = await get("method/erpnext_ui.api.get_item_uom_options", {
          item_code: itemCode,
        });
        setUomInfo((p) => ({ ...p, [i]: uomOptions }));
      } catch {
        uomOptions = null;
      }

      const stockUom = uomOptions?.stock_uom || d.stock_uom || "";
      const uom = uomOptions?.stock_uom || d.uom || stockUom;
      const factor = uom === stockUom ? 1 : d.conversion_factor || 1;

      updateRow(i, {
        item_code: itemCode,
        item_name: d.item_name || "",
        uom,
        stock_uom: stockUom,
        conversion_factor: factor,
        rate: d.rate || d.last_purchase_rate || "",
        warehouse: current.set_warehouse || d.warehouse || "",
      });
      applyQty(i, 1, factor);
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  /** UOM changed: re-resolve the factor and recompute stock qty. */
  const handleUomChange = async (i, uom) => {
    const row = docRef.current.items[i];
    if (!uom || uom === row.uom) return;

    const cached = uomInfo[i];
    const option = cached?.uoms?.find((u) => u.uom === uom);

    try {
      const res = await get(
        "method/erpnext.stock.get_item_details.get_conversion_factor",
        { item_code: row.item_code, uom },
      );
      const factor = Number(res.message?.conversion_factor) || option?.conversion_factor || 1;
      updateRow(i, { uom, conversion_factor: factor });
      applyQty(i, row.qty, factor);
    } catch {
      // ERPNext falls back to 1.0 when no conversion row exists; mirror that
      // rather than leaving the previous item's factor in place.
      updateRow(i, { uom, conversion_factor: option?.conversion_factor || 1 });
      applyQty(i, row.qty, option?.conversion_factor || 1);
    }
  };

  /* ================= VALIDATION ================= */

  const validate = (d = docRef.current) => {
    const errs = {};

    if (!d.supplier) errs.supplier = t("store.receipt.validation.supplierRequired");
    if (!d.company) errs.company = t("store.validation.companyRequired");

    if (!d.posting_date) {
      errs.posting_date = t("store.receipt.validation.dateRequired");
    } else if (d.posting_date > todayISO()) {
      // ERPNext throws "Posting Date cannot be future date".
      errs.posting_date = t("store.receipt.validation.dateFuture");
    }

    if (!d.items.length) {
      errs.items = t("store.receipt.validation.addItem");
      return { fieldErrors: errs, summary: t("store.receipt.validation.addItem") };
    }

    // Duplicate PO lines: ERPNext throws "Duplicate row N with same ...".
    const seen = new Set();
    for (let i = 0; i < d.items.length; i++) {
      const row = d.items[i];
      if (row.purchase_order_item) {
        if (seen.has(row.purchase_order_item)) {
          errs.items = t("store.receipt.validation.duplicatePoRow");
          break;
        }
        seen.add(row.purchase_order_item);
      }
    }

    if (!errs.items) {
      for (let i = 0; i < d.items.length; i++) {
        const row = d.items[i];
        if (!row.item_code) {
          errs.items = t("store.receipt.validation.pickItem");
          break;
        }
        if (!(Number(row.qty) > 0)) {
          errs.items = t("store.validation.qtyGtZero");
          break;
        }
        const mustWhole = uomInfo[i]?.uoms?.find((u) => u.uom === row.uom)
          ?.must_be_whole_number;
        if (mustWhole && Number(row.qty) % 1 !== 0) {
          errs.items = t("store.receipt.validation.wholeNumberUom", {
            uom: row.uom,
          });
          break;
        }
        if (row.rate === "" || row.rate === undefined || row.rate === null) {
          errs.items = t("store.receipt.validation.rateRequired");
          break;
        }
        if (!row.warehouse) {
          errs.items = t("store.receipt.validation.warehouseRequired");
          break;
        }
      }
    }

    const list = Object.values(errs);
    setFieldErrors(errs);
    return {
      fieldErrors: errs,
      summary: list.length > 1 ? t("common.fixErrors") : list[0] || "",
    };
  };

  /* ================= SAVE / SUBMIT ================= */

  const handleSave = async () => {
    const current = docRef.current;
    const result = validate(current);
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await saveDocument({
        doctype: "Purchase Receipt",
        name: isEdit ? name : undefined,
        doc: toSavePayload(current),
      });
      navigate(`/store/purchase-receipt/${res.data.name}`);
    } catch (e) {
      setError(e.message || t("common.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      await submitDocument({ doctype: "Purchase Receipt", name });
      loadDoc();
    } catch (e) {
      setError(e.message || t("common.submitFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= HEADER ================= */

  useEffect(() => {
    setHeader({
      title: isEdit ? name : t("store.receipt.newTitle"),
      subtitle: t("store.receipt.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.receipt.title"), path: "/store/purchase-receipt" },
        { label: isEdit ? name : t("common.new") },
      ],
      actions: [
        !doc.docstatus && {
          label: loading ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
        },
        isEdit &&
          doc.docstatus === 0 && {
            label: t("common.submit"),
            variant: "btn-primary",
            onClick: handleSubmit,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, name, doc.docstatus, loading]);

  /* ================= MOUNT ================= */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isEdit) {
        await loadDoc();
        return;
      }

      setLoading(true);
      try {
        if (poName) {
          // ERPNext's own mapper: validates the PO is submitted, maps supplier /
          // currency / warehouses / taxes, and prefills each line with the
          // outstanding qty, its conversion factor and rate.
          const res = await get(
            "method/erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt",
            { source_name: poName },
          );
          const draft = Array.isArray(res.message) ? res.message[0] : res.message;
          if (!draft || cancelled) return;

          setDoc({
            supplier: draft.supplier || "",
            company: draft.company || "",
            posting_date: draft.posting_date || todayISO(),
            set_warehouse: draft.set_warehouse || "",
            currency: draft.currency || "",
            conversion_rate: draft.conversion_rate ?? 1,
            items: (draft.items || []).map((r) => ({
              item_code: r.item_code,
              item_name: r.item_name,
              project: r.project || "",
              qty: r.qty ?? "",
              rejected_qty: r.rejected_qty ?? "",
              uom: r.uom || "",
              stock_uom: r.stock_uom || "",
              conversion_factor: r.conversion_factor ?? 1,
              stock_qty: r.stock_qty ?? "",
              rate: r.rate ?? "",
              warehouse: r.warehouse || draft.set_warehouse || "",
              purchase_order: r.purchase_order || poName,
              purchase_order_item: r.purchase_order_item || "",
              rate_from_po: r.rate ?? "",
            })),
            docstatus: 0,
          });

          if (!(draft.items || []).length) {
            setError(t("store.receipt.nothingOutstanding", { po: poName }));
          }

          draft.items?.forEach((r, i) => {
            if (r.item_code) loadUomInfo(i, r.item_code);
          });
        } else {
          await autoCompany();
        }
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= UI ================= */

  const rows = useMemo(() => doc.items, [doc.items]);

  if (loading && rows.length === 0 && !isEdit && !poName) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 pt-4">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {fromPo ? (
        <p className="flex items-center gap-2 rounded border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          {t("store.receipt.lockedFromPo", { po: poName })}
        </p>
      ) : null}

      {/* HEADER */}
      <FormSection
        title={t("store.form.basics")}
        icon={ClipboardList}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        <FormField
          label={t("store.receipt.supplier")}
          required
          name="supplier"
          error={fieldErrors.supplier}
        >
          <LinkField
            doctype="Supplier"
            value={doc.supplier}
            onChange={(v) => setDoc((p) => ({ ...p, supplier: v || "" }))}
            disabled={fromPo || isEdit}
          />
        </FormField>

        <FormField
          label={t("store.form.company")}
          required
          name="company"
          error={fieldErrors.company}
        >
          <Input value={doc.company} disabled />
        </FormField>

        <FormField
          label={t("store.receipt.postingDate")}
          required
          name="posting_date"
          error={fieldErrors.posting_date}
        >
          <Input
            type="date"
            value={doc.posting_date}
            disabled={!!doc.docstatus}
            onChange={(e) => setDoc({ ...doc, posting_date: e.target.value })}
          />
        </FormField>

        <FormField
          label={t("store.receipt.acceptedWarehouse")}
          name="set_warehouse"
        >
          <LinkField
            doctype="Warehouse"
            value={doc.set_warehouse}
            onChange={(v) => {
              setDoc((p) => ({
                ...p,
                set_warehouse: v || "",
                // One warehouse for the whole receipt: propagating it here is
                // what stops each row needing its own.
                items: p.items.map((r) => (r.warehouse ? { ...r, warehouse: v || "" } : r)),
              }));
            }}
          />
        </FormField>
      </FormSection>

      {/* ITEMS */}
      <FormSection
        title={t("store.receipt.items")}
        icon={Table2}
        action={
          !doc.docstatus && !fromPo ? (
            <Button size="sm" onClick={addRow}>
              <Plus />
              {t("common.addRow")}
            </Button>
          ) : null
        }
        contentClassName="flex flex-col gap-3"
      >
        <FormField
          name="items"
          error={fieldErrors.items}
          className={fieldErrors.items ? "" : "sr-only"}
        >
          <span className="sr-only">{t("store.receipt.items")}</span>
        </FormField>

        {rows.length === 0 ? (
          <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Info className="size-3.5" />
            {t("store.receipt.noItems")}
          </p>
        ) : null}

        {rows.map((row, i) => {
          const info = uomInfo[i];
          const poRow = isPoRow(row);
          const multiUom = (info?.uoms?.length || 0) > 1;
          const factor = Number(row.conversion_factor) || 1;
          const rateChanged =
            poRow && row.rate !== "" && Number(row.rate) !== Number(row.rate_from_po);

          return (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-12 md:items-end"
            >
              {/* ITEM */}
              <div className="col-span-2 md:col-span-3">
                <FormField label={t("store.form.item")} required>
                  <LinkField
                    doctype="Item"
                    value={row.item_code}
                    onChange={(v) => handleItemChange(i, v)}
                    disabled={poRow || !!doc.docstatus}
                  />
                </FormField>
              </div>

              {/* QTY — the field the whole screen is built around */}
              <div className="md:col-span-2">
                <FormField label={t("store.receipt.acceptedQty")} required>
                  <Input
                    type="number"
                    value={row.qty}
                    onChange={(e) => applyQty(i, e.target.value, factor)}
                  />
                </FormField>
                {/* The payoff of auto-conversion: the stock quantity the entry
                    actually moves, visible before saving. */}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {factor !== 1 ? (
                    <>
                      {t("store.receipt.inStockUom")}: {row.stock_qty} {row.stock_uom}{" "}
                      · {t("store.receipt.factor")} ×{factor}
                    </>
                  ) : (
                    t("store.receipt.stockUom", {
                      qty: row.stock_qty ?? row.qty,
                      uom: row.stock_uom || row.uom,
                    })
                  )}
                </p>
              </div>

              {/* UOM — only when there is a choice to make */}
              <div className="md:col-span-2">
                {multiUom ? (
                  <FormField label={t("store.form.uom")} required>
                    <FormSelect
                      value={row.uom}
                      disabled={poRow || !!doc.docstatus}
                      onChange={(v) => handleUomChange(i, v)}
                      options={info.uoms.map((u) => ({
                        value: u.uom,
                        label:
                          u.conversion_factor !== 1
                            ? `${u.uom} (×${u.conversion_factor})`
                            : u.uom,
                      }))}
                    />
                  </FormField>
                ) : (
                  <FormField label={t("store.form.uom")}>
                    <Input value={row.uom || ""} disabled />
                  </FormField>
                )}
              </div>

              {/* RATE */}
              <div className="md:col-span-2">
                <FormField label={t("store.receipt.rate")} required>
                  <Input
                    type="number"
                    value={row.rate}
                    onChange={(e) => updateRow(i, { rate: e.target.value })}
                  />
                </FormField>
                {rateChanged ? (
                  <p className="mt-1 text-[11px] text-amber-600">
                    {t("store.receipt.rateDiffers", { rate: row.rate_from_po })}
                  </p>
                ) : null}
              </div>

              {/* PROJECT */}
              <div className="md:col-span-2">
                <FormField label={t("store.labels.projectOptional")}>
                  <LinkField
                    doctype="Project"
                    value={row.project}
                    onChange={(v) => updateRow(i, { project: v || "" })}
                    // ERPNext compares project against the PO line when the PO
                    // has one, so changing it there is a guaranteed save failure.
                    disabled={poRow || !!doc.docstatus}
                  />
                </FormField>
              </div>

              {/* WAREHOUSE */}
              <div className="md:col-span-1">
                <FormField label={t("store.labels.targetWarehouse")} required>
                  <LinkField
                    doctype="Warehouse"
                    value={row.warehouse}
                    onChange={(v) => updateRow(i, { warehouse: v || "" })}
                    disabled={!!doc.docstatus}
                  />
                </FormField>
              </div>

              {/* REJECTED */}
              <div className="md:col-span-1">
                <FormField label={t("store.receipt.rejectedQty")}>
                  <Input
                    type="number"
                    value={row.rejected_qty}
                    onChange={(e) => updateRow(i, { rejected_qty: e.target.value })}
                  />
                </FormField>
              </div>

              {/* DELETE — not available on a mapped receipt */}
              {!doc.docstatus && !poRow ? (
                <div className="col-span-2 flex items-end md:col-span-1">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => removeRow(i)}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </FormSection>
    </div>
  );
}
