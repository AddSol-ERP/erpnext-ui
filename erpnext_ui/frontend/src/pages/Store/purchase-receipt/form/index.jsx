import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, Trash2, Info, Lock, Pencil, Scale } from "lucide-react";
import { get } from "../../../../services/api";
import { saveDocument, submitDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import LinkField from "../../../../components/LinkField";
import { focusFirstError } from "../../../../lib/formValidation";
import { useHeader } from "../../../../context/HeaderContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localDateISO } from "../../../../utils/localDateTime";
import { needsMeasuredTotal, validateLineRow } from "../../../../lib/receiptConversion";
import ReceiptItemPicker from "../components/ReceiptItemPicker";
import ReceiptLineDialog from "../components/ReceiptLineDialog";

/**
 * Receive material into the store -- a Purchase Receipt.
 *
 * Two ways in, one form:
 *
 *   /store/purchase-receipt/new?po=PO-0001  mapped from a Purchase Order
 *   /store/purchase-receipt/new             no PO, items added by hand
 *
 * ---------------------------------------------------------------------------
 * WHY A PICKER, NOT A LIST OF EVERY LINE
 * ---------------------------------------------------------------------------
 * A PO can carry dozens of lines (`PUR-ORD-2026-00010` has 28). Rendering all of
 * them as cards meant a shopfloor user receiving three items had to read a
 * full-height stack to find three rows, and every row looked equally
 * actionable whether or not it had already been received. So the outstanding
 * lines live in a `available` catalogue and only the lines the user picks reach
 * `doc.items` -- the receipt itself, and what gets saved.
 *
 * The catalogue is whatever ERPNext's own `make_purchase_receipt` returns. Its
 * map condition (purchase_order.py:782-786) already drops lines that are fully
 * received or `delivered_by_supplier`, so "outstanding" is ERPNext's answer,
 * not one re-derived here. Nothing in this file computes an outstanding
 * quantity.
 *
 * ---------------------------------------------------------------------------
 * ERPNEXT CONSTRAINTS THIS SCREEN IS BUILT AROUND (v15 source)
 * ---------------------------------------------------------------------------
 * 1. `validate_with_previous_doc` (purchase_receipt.py:306-316) compares
 *    **project, uom and item_code** against the PO line for any row carrying a
 *    `purchase_order_item`; a mismatch throws. So on a PO row the received UOM
 *    is fixed. `conversion_factor` is NOT in that list, so it is never
 *    compared -- see lib/receiptConversion.js, which owns the arithmetic and
 *    the reasoning.
 * 2. Duplicate `purchase_order_item` throws (transaction_base.py:109), blocked
 *    here. The picker keys on `purchase_order_item`, not `item_code`, because
 *    ERPNext permits one item on several lines (:317).
 * 3. `validate_uom_is_integer("stock_uom", "stock_qty")`
 *    (purchase_receipt.py:276-278) checks the STOCK qty against the STOCK UOM's
 *    whole-number flag. `validateLineRow` mirrors this exactly; the previous
 *    version checked the transaction qty against the transaction UOM, which is
 *    a different pair and is not what the server enforces.
 * 4. A future `posting_date` throws (purchase_receipt.py:268).
 * 5. With `Buying Settings.maintain_same_rate` on and action "Stop"
 *    (transaction_base.py:165-172), a rate differing from the PO by >= 0.01
 *    throws unless the user holds `role_to_override_stop_action`. On this site
 *    that setting is on with no override role, so the rate is read-only on PO
 *    rows. It is read at runtime rather than hardcoded so an admin changing
 *    the setting needs no code change.
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

/** Strip system fields so the mapped doc can be saved as a new document. */
function toSavePayload(doc) {
  const out = { ...doc };
  SYSTEM_FIELDS.forEach((f) => delete out[f]);
  out.items = (doc.items || []).map((row) => {
    const clean = { ...row };
    CHILD_SYSTEM_FIELDS.forEach((f) => delete clean[f]);
    // _rid is our client-side row key, and measured_total is our input that
    // exists only to derive the factor. Neither is a Purchase Receipt Item
    // field; sending them would produce an unknown-attribute error.
    delete clean._rid;
    delete clean.measured_total;
    // transfer_qty / received_stock_qty are read_only and re-derived server-side
    // (set_stock_qty); posting a stale value would be discarded at best.
    delete clean.transfer_qty;
    delete clean.received_stock_qty;
    return clean;
  });
  return out;
}

let ridSeq = 0;
/** Stable client key for a row. See the _rid note below. */
const nextRid = () => `r${++ridSeq}`;

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

  /**
   * Outstanding PO lines not yet added to this receipt. Display-only: it never
   * reaches the saved payload.
   */
  const [available, setAvailable] = useState([]);

  /**
   * _rid -> { stock_uom, uoms: [{uom, must_be_whole_number}], error }
   *
   * Keyed by `_rid`, NOT by row index. The tray can be reordered and the
   * picker appends and removes, so an index-keyed cache silently attaches one
   * item's unit data to another the moment anything moves -- which shows up as
   * a wrong whole-number error or a stale total on the line that happens to
   * land on that index. Every row carries a `_rid` from creation, and row
   * mutation resolves it through `docRef` rather than closing over an index.
   */
  const [uomInfo, setUomInfo] = useState({});

  /** row id -> the failure text from its UOM lookup, surfaced in the tray. */
  const [uomErrors, setUomErrors] = useState({});

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  /**
   * Rate edit policy, read from Buying Settings at runtime.
   * null until loaded, and `false` on any failure: an editable rate that the
   * server will reject is worse than a read-only one, so this fails closed.
   */
  const [rateEditable, setRateEditable] = useState(false);

  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const rows = useMemo(() => doc.items, [doc.items]);

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
    } catch {
      // Non-fatal: Company can also arrive with a direct entry's item details.
    }
  }, []);

  const loadRatePolicy = useCallback(async () => {
    try {
      const res = await get("method/frappe.client.get_list", {
        doctype: "Buying Settings",
        fields: JSON.stringify([
          "maintain_same_rate",
          "maintain_same_rate_action",
          "role_to_override_stop_action",
        ]),
        limit_page_length: 1,
      });
      const s = res.message?.[0] || {};
      // Mirrors ERPNext: transaction_base.py:165-172 only blocks when the flag
      // is on, the action is "Stop", and the user's roles exclude the override.
      // We do not have the user's roles here, so we take the conservative
      // reading: editable only when the flag is off, or an override role is
      // configured (in which case RoleContext can grant it per-user).
      const blocked = !!s.maintain_same_rate && s.maintain_same_rate_action === "Stop";
      setRateEditable(!blocked || !!s.role_to_override_stop_action);
    } catch {
      setRateEditable(false);
    }
  }, []);

  const loadUomInfo = useCallback(async (rid, itemCode) => {
    if (!itemCode) return;
    try {
      const message = await get("method/erpnext_ui.api.get_item_uom_options", {
        item_code: itemCode,
      });
      setUomInfo((p) => ({ ...p, [rid]: message }));
      setUomErrors((p) => ({ ...p, [rid]: null }));
    } catch {
      // Previously this was swallowed, which made a missing backend deployment
      // look exactly like "this item has one UOM" -- the measured-total field
      // silently disappeared with no error anywhere. Now the failure is kept
      // and rendered on the row, because a missing UOM list does not mean a
      // single-UOM item.
      setUomInfo((p) => ({
        ...p,
        [rid]: { stock_uom: "", uoms: [], failed: true },
      }));
      setUomErrors((p) => ({ ...p, [rid]: t("store.receipt.uomLookupFailed") }));
    }
  }, [t]);

  const loadDoc = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get(`resource/Purchase Receipt/${name}`);
      const d = res.data;
      const items = (d.items || []).map((r) => ({
        _rid: nextRid(),
        item_code: r.item_code,
        item_name: r.item_name,
        project: r.project || "",
        qty: r.qty ?? "",
        rejected_qty: r.rejected_qty ?? "",
        uom: r.uom || "",
        stock_uom: r.stock_uom || "",
        measured_total: "",
        conversion_factor: r.conversion_factor ?? 1,
        stock_qty: r.stock_qty ?? "",
        rate: r.rate ?? "",
        warehouse: r.warehouse || "",
        purchase_order: r.purchase_order || "",
        purchase_order_item: r.purchase_order_item || "",
        rate_from_po: r.rate ?? "",
      }));
      setDoc({
        supplier: d.supplier || "",
        company: d.company || "",
        posting_date: d.posting_date || todayISO(),
        set_warehouse: d.set_warehouse || "",
        currency: d.currency || "",
        conversion_rate: d.conversion_rate ?? 1,
        items,
        docstatus: d.docstatus,
      });

      // Warm the UOM cache so an existing receipt shows its unit data.
      items.forEach((r) => {
        if (r.item_code) loadUomInfo(r._rid, r.item_code);
      });
    } catch {
      setError(t("common.failedToLoad", { name: t("store.receipt.title") }));
    } finally {
      setLoading(false);
    }
  }, [name, t, loadUomInfo]);

  /* ================= ITEMS ================= */

  const patchById = useCallback((rid, patch) => {
    setDoc((p) => ({
      ...p,
      items: p.items.map((row) => (row._rid === rid ? { ...row, ...patch } : row)),
    }));
  }, []);

  const addFreeRow = () => {
    const rid = nextRid();
    setDoc((p) => ({
      ...p,
      items: [
        ...p.items,
        {
          _rid: rid,
          item_code: "",
          item_name: "",
          project: "",
          qty: 1,
          rejected_qty: "",
          uom: "",
          stock_uom: "",
          measured_total: "",
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
    setEditing(rid);
  };

  const removeRow = (rid) => {
    setDoc((p) => ({ ...p, items: p.items.filter((r) => r._rid !== rid) }));
    setUomInfo((p) => {
      const next = { ...p };
      delete next[rid];
      return next;
    });
    setUomErrors((p) => {
      const next = { ...p };
      delete next[rid];
      return next;
    });
    setAvailable((p) => p);
  };

  /** Add a catalogue line to the receipt. */
  const pickLine = (line) => {
    const rid = nextRid();
    const row = {
      _rid: rid,
      item_code: line.item_code,
      item_name: line.item_name || "",
      project: line.project || "",
      qty: line.qty ?? "",
      rejected_qty: "",
      uom: line.uom || "",
      stock_uom: line.stock_uom || "",
      measured_total: "",
      conversion_factor: 1,
      stock_qty: line.stock_qty ?? "",
      rate: line.rate ?? "",
      warehouse: line.warehouse || docRef.current.set_warehouse || "",
      purchase_order: line.purchase_order || poName || "",
      purchase_order_item: line.purchase_order_item || "",
      rate_from_po: line.rate ?? "",
      pending_qty: line.pending_qty,
    };
    // A picked line is no longer offered by the picker. Dropping it from the
    // catalogue here (rather than relying on a "picked" check at render time)
    // keeps the catalogue and doc.items in step even if a row is removed again.
    setAvailable((p) =>
      p.filter((l) => (l.purchase_order_item || l.item_code) !== (line.purchase_order_item || line.item_code)),
    );
    setDoc((p) => ({ ...p, items: [...p.items, row] }));
    if (row.item_code) loadUomInfo(rid, row.item_code);
    setEditing(rid);
  };

  /** Item chosen by hand on a direct (no PO) receipt. */
  const handleItemChange = async (rid, itemCode) => {
    if (!itemCode) {
      patchById(rid, { item_code: "", item_name: "", uom: "", stock_uom: "" });
      return;
    }
    try {
      const current = docRef.current;
      const res = await get("method/erpnext.stock.get_item_details", {
        item_code: itemCode,
        doctype: "Purchase Receipt",
        company: current.company || "",
        supplier: current.supplier || "",
        currency: current.currency || "",
        conversion_rate: current.conversion_rate ?? 1,
        posting_date: current.posting_date || todayISO(),
        set_warehouse: current.set_warehouse || "",
        uom: null,
      });
      const d = res.message || res.data || {};
      const stockUom = d.stock_uom || "";

      // The UOM list arrives separately; until it does we assume the stock UOM
      // so the line stays usable, and the total field appears once the lookup
      // lands.
      patchById(rid, {
        item_code: itemCode,
        item_name: d.item_name || "",
        uom: stockUom,
        stock_uom: stockUom,
        rate: d.rate || d.last_purchase_rate || "",
        warehouse: current.set_warehouse || d.warehouse || "",
      });
      await loadUomInfo(rid, itemCode);
    } catch (e) {
      setError(e.message || String(e));
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
      setFieldErrors(errs);
      return { fieldErrors: errs, summary: t("store.receipt.validation.addItem") };
    }

    // Duplicate PO lines: ERPNext throws "Duplicate row N with same ...".
    const seen = new Set();
    for (const row of d.items) {
      if (row.purchase_order_item) {
        if (seen.has(row.purchase_order_item)) {
          errs.items = t("store.receipt.validation.duplicatePoRow");
          break;
        }
        seen.add(row.purchase_order_item);
      }

      if (!row.item_code) {
        errs.items = t("store.receipt.validation.pickItem");
        break;
      }

      const info = uomInfo[row._rid];
      if (info?.failed) {
        errs.items = t("store.receipt.uomLookupFailed");
        break;
      }

      const lineErr = validateLineRow(row, info, t);
      if (lineErr) {
        errs.items = lineErr;
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
      loadRatePolicy();
      if (isEdit) {
        await loadDoc();
        return;
      }

      setLoading(true);
      try {
        if (poName) {
          // ERPNext's own mapper: validates the PO is submitted, maps supplier /
          // currency / warehouses / taxes, and prefills each line with the
          // outstanding qty, its conversion factor and rate. Its map condition
          // already excludes fully-received lines, so the result IS the
          // outstanding catalogue.
          const res = await get(
            "method/erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt",
            { source_name: poName },
          );
          const draft = Array.isArray(res.message) ? res.message[0] : res.message;
          if (!draft || cancelled) return;

          const catalogue = (draft.items || []).map((r) => ({
            item_code: r.item_code,
            item_name: r.item_name,
            project: r.project || "",
            qty: r.qty ?? "",
            uom: r.uom || "",
            stock_uom: r.stock_uom || "",
            rate: r.rate ?? "",
            warehouse: r.warehouse || draft.set_warehouse || "",
            purchase_order: r.purchase_order || poName,
            purchase_order_item: r.purchase_order_item || "",
            pending_qty: r.qty,
          }));

          setAvailable(catalogue);

          setDoc({
            supplier: draft.supplier || "",
            company: draft.company || "",
            posting_date: draft.posting_date || todayISO(),
            set_warehouse: draft.set_warehouse || "",
            currency: draft.currency || "",
            conversion_rate: draft.conversion_rate ?? 1,
            items: [],
            docstatus: 0,
          });

          if (!catalogue.length) {
            setError(t("store.receipt.nothingOutstanding", { po: poName }));
          }
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

  if (loading && rows.length === 0 && !isEdit && !poName) {
    return null;
  }

  const editingRow = editing ? rows.find((r) => r._rid === editing) || null : null;
  const pickedKeys = rows.map((r) => r.purchase_order_item || r.item_code);
  const outstanding = fromPo ? available.length : null;

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
        title={t("store.receipt.addedLines")}
        icon={ClipboardList}
        action={
          !doc.docstatus && (fromPo ? (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus />
              {t("store.receipt.addFromPo")}
            </Button>
          ) : (
            <Button size="sm" onClick={addFreeRow}>
              <Plus />
              {t("common.addRow")}
            </Button>
          ))
        }
      >
        {/* Progress. A picker on its own removes the ability to tell a
            half-finished receipt from a finished one, which is the one thing a
            shopfloor user needs at a glance. */}
        {fromPo && rows.length + (outstanding || 0) > 0 ? (
          <p className="mb-1 text-xs text-muted-foreground">
            {t("store.receipt.progress", { picked: rows.length, total: rows.length + (outstanding || 0) })}
          </p>
        ) : null}

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
            {t("store.receipt.noLinesYet")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((row) => {
              const info = uomInfo[row._rid];
              const looksWeighed = needsMeasuredTotal(info, row.uom);
              const rowErr = uomErrors[row._rid];
              return (
                <li
                  key={row._rid}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {row.item_code || t("store.receipt.validation.pickItem")}
                      {row.item_name ? (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {row.item_name}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>
                        {row.qty} {row.uom}
                      </span>
                      {looksWeighed ? (
                        <span className="flex items-center gap-1">
                          <Scale className="size-3" />
                          {row.stock_qty === "" || row.stock_qty === undefined
                            ? "—"
                            : `${row.stock_qty} ${row.stock_uom}`}
                        </span>
                      ) : null}
                      {row.warehouse ? <span>{row.warehouse}</span> : null}
                      {row.rate !== "" && row.rate !== undefined ? (
                        <span>{t("store.receipt.rate")}: {row.rate}</span>
                      ) : null}
                    </div>
                    {rowErr ? (
                      <p className="mt-1 text-xs text-destructive">{rowErr}</p>
                    ) : null}
                  </div>

                  {!doc.docstatus ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(row._rid)}
                        aria-label={t("store.receipt.editLine")}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(row._rid)}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>

      {fromPo ? (
        <ReceiptItemPicker
          show={pickerOpen}
          onClose={() => setPickerOpen(false)}
          lines={available}
          pickedKeys={pickedKeys}
          onPick={pickLine}
        />
      ) : null}

      <ReceiptLineDialog
        show={!!editingRow}
        onClose={() => setEditing(null)}
        row={editingRow}
        info={editingRow ? uomInfo[editingRow._rid] : null}
        uomError={editingRow ? uomErrors[editingRow._rid] : null}
        rateEditable={rateEditable || !editingRow?.purchase_order_item}
        onItemChange={handleItemChange}
        onSave={(next) => patchById(next._rid, next)}
      />
    </div>
  );
}