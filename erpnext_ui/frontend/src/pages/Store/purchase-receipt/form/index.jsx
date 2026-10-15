import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ClipboardList,
  Plus,
  Trash2,
  Info,
  Lock,
  Pencil,
  Scale,
} from "lucide-react";
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
import {
  needsMeasuredTotal,
  parseSerials,
  serialCount,
  validateBatch,
  validateLineRow,
  validateSerials,
} from "../../../../lib/receiptConversion";
import ReceiptItemWorkbench from "../components/ReceiptItemWorkbench";
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
  "name",
  "owner",
  "creation",
  "modified",
  "modified_by",
  "idx",
  "docstatus",
  "amended_from",
  "amended_by",
  "_user_tags",
  "_comments",
  "_assign",
  "_liked_by",
  "doctype",
  "__islocal",
  "__unsaved",
];

const CHILD_SYSTEM_FIELDS = [
  "name",
  "parent",
  "parenttype",
  "parentfield",
  "docstatus",
  "idx",
  "__islocal",
  "__unsaved",
  "owner",
  "creation",
  "modified",
  "modified_by",
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
    delete clean.pending_qty;
    delete clean.rate_from_po;
    delete clean.factor_from_po;
    delete clean.factor_source_po;
    delete clean.conversion_source;
    delete clean.weight_per_unit;
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
  const [plateConfig, setPlateConfig] = useState({ enabled: false });
  const [plateItems, setPlateItems] = useState({});
  const plateConfigRef = useRef(plateConfig);

  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const rows = useMemo(() => doc.items, [doc.items]);

  /* ================= LOADERS ================= */

  const autoCompany = useCallback(async () => {
    try {
      const company =
        (
          await get("method/frappe.client.get_list", {
            doctype: "Company",
            fields: JSON.stringify(["name"]),
            limit_page_length: 1,
          })
        )?.message?.[0]?.name || "";
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
      const blocked =
        !!s.maintain_same_rate && s.maintain_same_rate_action === "Stop";
      setRateEditable(!blocked || !!s.role_to_override_stop_action);
    } catch {
      setRateEditable(false);
    }
  }, []);

  const loadPlateConfig = useCallback(async () => {
    try {
      const res = await get(
        "method/addsol_nl_custom.addsol_nl_custom.plates.api.get_plate_settings",
      );
      const settings = res.message || {};
      const next = {
        ...settings,
        enabled: !!settings.enable_weight_based_purchasing,
      };
      plateConfigRef.current = next;
      setPlateConfig(next);
      return next;
    } catch {
      // Other customers do not install addsol_nl_custom. A missing extension
      // means ordinary receipts, never a broken generic receiving page.
      const next = { enabled: false };
      plateConfigRef.current = next;
      setPlateConfig(next);
      return next;
    }
  }, []);

  const loadPlateStatus = useCallback(async (rid, itemCode) => {
    if (!itemCode || !plateConfigRef.current.enabled) {
      setPlateItems((p) => ({ ...p, [rid]: false }));
      return false;
    }
    try {
      const res = await get(
        "method/addsol_nl_custom.addsol_nl_custom.plates.api.is_weight_managed_item",
        { item_code: itemCode },
      );
      const isPlate = !!res.message;
      setPlateItems((p) => ({ ...p, [rid]: isPlate }));
      return isPlate;
    } catch {
      setPlateItems((p) => ({ ...p, [rid]: null }));
      return null;
    }
  }, []);

  const loadUomInfo = useCallback(
    async (rid, itemCode) => {
      if (!itemCode) return;
      try {
        const message = await get(
          "method/erpnext_ui.api.get_item_uom_options",
          {
            item_code: itemCode,
          },
        );
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
        setUomErrors((p) => ({
          ...p,
          [rid]: t("store.receipt.uomLookupFailed"),
        }));
      }
    },
    [t],
  );

  const loadDoc = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get(`resource/Purchase Receipt/${name}`);
      const d = res.data;
      const items = (d.items || []).map((r) => ({
        ...r,
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
        ...d,
        posting_date: d.posting_date || todayISO(),
        items,
        docstatus: d.docstatus,
      });

      // Warm the UOM cache so an existing receipt shows its unit data.
      await Promise.all(items.map(async (r) => {
        if (r.item_code) {
          await Promise.all([
            loadUomInfo(r._rid, r.item_code),
            loadPlateStatus(r._rid, r.item_code),
          ]);
        }
      }));
    } catch {
      setError(t("common.failedToLoad", { name: t("store.receipt.title") }));
    } finally {
      setLoading(false);
    }
  }, [name, t, loadUomInfo, loadPlateStatus]);

  /* ================= ITEMS ================= */

  const patchById = useCallback((rid, patch) => {
    setDoc((p) => ({
      ...p,
      items: p.items.map((row) =>
        row._rid === rid ? { ...row, ...patch } : row,
      ),
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
          // A blank direct-entry row has no source document, so the factor is a
          // placeholder rather than a rate -- and the form has to be able to tell
          // the difference when deciding whether a weight is required.
          conversion_factor: 1,
          conversion_source: "default",
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
    // A factor of 0 or missing is not a rate. `TEST-KG-NOS` carries 0.0 on its
    // Nos conversion row precisely because the real factor is a measurement, so
    // this must be a presence test and not a truthiness one.
    const poFactor = Number(line.conversion_factor);
    const hasPoFactor = Number.isFinite(poFactor) && poFactor > 0;
    const row = {
      ...line,
      _rid: rid,
      item_code: line.item_code,
      item_name: line.item_name || "",
      project: line.project || "",
      qty: line.qty ?? "",
      rejected_qty: "",
      uom: line.uom || "",
      stock_uom: line.stock_uom || "",
      measured_total: "",
      // The PO line's factor, which `make_purchase_receipt` already returned and
      // which `validate_with_previous_doc` never compares -- so it is free to
      // use and correct as ordered. This used to be hardcoded to 1 while the PO's
      // stock_qty was kept, leaving the row self-contradictory: the server
      // recomputes stock_qty = qty * conversion_factor, so a delivery that could
      // not be weighed booked 10 Kg instead of 10,000 Kg, silently.
      conversion_factor: poFactor,
      conversion_source: hasPoFactor
        ? "purchase_order"
        : "default",
      stock_qty: hasPoFactor ? Number(line.qty) * poFactor : line.stock_qty ?? "",
      rate: line.rate ?? "",
      warehouse: line.warehouse || docRef.current.set_warehouse || "",
      // Tracking fields. Empty until the user supplies them (or ERPNext generates
      // them from a series), but present on the row so an edit round-trip through
      // the server does not silently drop them.
      serial_no: "",
      batch_no: "",
      purchase_order: line.purchase_order || poName || "",
      purchase_order_item: line.purchase_order_item || "",
      rate_from_po: line.rate ?? "",
      // Remembered so clearing a measured weight returns the ordered rate
      // instead of dropping the row to factor 1.
      factor_from_po: hasPoFactor ? poFactor : null,
      factor_source_po: hasPoFactor ? "purchase_order" : null,
      pending_qty: line.pending_qty,
    };
    // A picked line is no longer offered by the picker. Dropping it from the
    // catalogue here (rather than relying on a "picked" check at render time)
    // keeps the catalogue and doc.items in step even if a row is removed again.
    setAvailable((p) =>
      p.filter(
        (l) =>
          (l.purchase_order_item || l.item_code) !==
          (line.purchase_order_item || line.item_code),
      ),
    );
    setDoc((p) => ({ ...p, items: [...p.items, row] }));
    if (row.item_code) loadUomInfo(rid, row.item_code);
    if (row.item_code) loadPlateStatus(rid, row.item_code);
    setEditing(rid);
  };

  /** Item chosen by hand on a direct (no PO) receipt. */
  const handleItemChange = async (rid, itemCode) => {
    if (!itemCode) {
      patchById(rid, { item_code: "", item_name: "", uom: "", stock_uom: "" });
      loadPlateStatus(rid, "");
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
        custom_unit_weight_kg: d.weight_per_unit || "",
        warehouse: current.set_warehouse || d.warehouse || "",
      });
      await loadUomInfo(rid, itemCode);
      await loadPlateStatus(rid, itemCode);
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  /* ================= VALIDATION ================= */

  const validate = (
    d = docRef.current,
    forSubmit = false,
    plateStatus = plateItems,
  ) => {
    const errs = {};

    if (!d.supplier)
      errs.supplier = t("store.receipt.validation.supplierRequired");
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
      return {
        fieldErrors: errs,
        summary: t("store.receipt.validation.addItem"),
      };
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
      if (plateConfig.enabled && plateStatus[row._rid] == null) {
        errs.items = t("store.receipt.validation.plateLookupFailed");
        break;
      }
      const isPlate = plateConfig.enabled && plateStatus[row._rid];
      if (info?.failed) {
        errs.items = t("store.receipt.uomLookupFailed");
        break;
      }

      const lineErr = validateLineRow(row, info, t);
      if (lineErr) {
        errs.items = lineErr;
        break;
      }

      // Serial and batch rules. Separate from `validateLineRow` because they are
      // about TRACKING rather than arithmetic -- but they are just as fatal: a
      // serialised row whose count does not match stock_qty fails in
      // serial_batch_bundle with a message that never mentions serials.
      const serialErr = validateSerials(row, info);
      if (serialErr) {
        errs.items = t(serialErr, {
          expected: serialCount(row),
          entered: parseSerials(row.serial_no).length,
          uom: info?.stock_uom,
        });
        break;
      }

      const batchErr = validateBatch(row, info);
      if (batchErr) {
        errs.items = t(batchErr);
        break;
      }

      if (!isPlate && (row.rate === "" || row.rate === undefined || row.rate === null)) {
        errs.items = t("store.receipt.validation.rateRequired");
        break;
      }
      if (!row.warehouse) {
        errs.items = t("store.receipt.validation.warehouseRequired");
        break;
      }

      if (forSubmit && isPlate) {
        if (!(Number(row.custom_supplier_weight_kg) > 0)) {
          errs.items = t("store.receipt.validation.plateSupplierWeightRequired");
          break;
        }
        if (!row.custom_heat_number) {
          errs.items = t("store.receipt.validation.plateHeatRequired");
          break;
        }
        if (!(Number(row.custom_rate_per_kg) > 0)) {
          errs.items = t("store.receipt.validation.plateRateRequired");
          break;
        }
        const estimate =
          Number(row.qty) *
          Number(
            row.custom_unit_weight_kg || row.item_weight_per_unit || row.weight_per_unit,
          );
        const variance = estimate > 0
          ? Number(
              (((Number(row.custom_supplier_weight_kg) - estimate) / estimate) * 100).toFixed(2),
            )
          : 0;
        const outsideTolerance =
          Math.abs(variance) > Number(plateConfig.weight_tolerance_pct || 0);
        if (outsideTolerance && !row.custom_weight_decision) {
          errs.items = t("store.receipt.validation.plateDecisionRequired");
          break;
        }
        if (outsideTolerance && !plateConfig.can_decide_weight) {
          errs.items = t("store.receipt.validation.plateApproverRequired");
          break;
        }
        if (
          row.custom_weight_decision === "Accept Weighbridge Weight" &&
          !(Number(row.custom_weighbridge_weight_kg) > 0)
        ) {
          errs.items = t("store.receipt.validation.plateWeighbridgeRequired");
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
    const current = docRef.current;
    let checkedPlateItems = plateItems;
    if (plateConfig.enabled) {
      const statusRows = await Promise.all(
        current.items.map(async (row) => [
          row._rid,
          await loadPlateStatus(row._rid, row.item_code),
        ]),
      );
      checkedPlateItems = {
        ...plateItems,
        ...Object.fromEntries(statusRows),
      };
    }
    const result = validate(current, true, checkedPlateItems);
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }
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
      await loadPlateConfig();
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
          const draft = Array.isArray(res.message)
            ? res.message[0]
            : res.message;
          if (!draft || cancelled) return;

          const catalogue = (draft.items || []).map((r) => ({
            ...r,
            item_code: r.item_code,
            item_name: r.item_name,
            project: r.project || "",
            qty: r.qty ?? "",
            uom: r.uom || "",
            stock_uom: r.stock_uom || "",
            rate: r.rate ?? "",
            // The mapper returns this and the form discarded it, which is how the
            // row ended up with the PO's stock_qty and a factor of 1.
            conversion_factor: r.conversion_factor ?? "",
            warehouse: r.warehouse || draft.set_warehouse || "",
            purchase_order: r.purchase_order || poName,
            purchase_order_item: r.purchase_order_item || "",
            pending_qty: r.qty,
          }));

          setAvailable(catalogue);

          setDoc({
            ...draft,
            posting_date: draft.posting_date || todayISO(),
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

  const editingRow = editing
    ? rows.find((r) => r._rid === editing) || null
    : null;
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
                items: p.items.map((r) =>
                  r.warehouse ? { ...r, warehouse: v || "" } : r,
                ),
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
          !doc.docstatus &&
          (fromPo ? (
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
            {t("store.receipt.progress", {
              picked: rows.length,
              total: rows.length + (outstanding || 0),
            })}
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
                        <span>
                          {t("store.receipt.rate")}: {row.rate}
                        </span>
                      ) : null}
                      {plateItems[row._rid] ? (
                        <>
                          {row.custom_supplier_weight_kg ? (
                            <span>
                              {t("store.receipt.supplierWeight")}: {row.custom_supplier_weight_kg} Kg
                            </span>
                          ) : null}
                          {row.custom_heat_number ? (
                            <span>
                              {t("store.receipt.heatNumber")}: {row.custom_heat_number}
                            </span>
                          ) : null}
                        </>
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

      {/* ONE surface, two sections: the outstanding lines on the left, the line
          being completed on the right, collapsing to one-at-a-time below `md`.
          This used to be `ReceiptItemPicker` opening `ReceiptLineDialog` on top
          of itself. The tray's Edit button still opens the dialog -- that row is
          already on the receipt and has no picker behind it. */}
      {fromPo ? (
        <ReceiptItemWorkbench
          show={pickerOpen}
          onClose={() => setPickerOpen(false)}
          lines={available}
          pickedKeys={pickedKeys}
          onPick={pickLine}
          row={editingRow}
          info={editingRow ? uomInfo[editingRow._rid] : null}
          uomError={editingRow ? uomErrors[editingRow._rid] : null}
          rateEditable={rateEditable || !editingRow?.purchase_order_item}
          plateEnabled={plateConfig.enabled}
          plateRow={!!editingRow && !!plateItems[editingRow._rid]}
          plateConfig={plateConfig}
          onItemChange={handleItemChange}
          onSave={(next) => patchById(next._rid, next)}
        />
      ) : null}

      {/* Tray edit. NOT gated on `fromPo`: the workbench covers ADDING a line,
          while this row is already on the receipt, so there is no picker behind
          it to stack on. Gating this on the purpose is what broke the Edit
          button on a PO receipt -- it set `editing`, and the only surface that
          reads `editing` for that purpose was the workbench, which is closed.

          Gated on `!pickerOpen` so the two can never be open at once: picking a
          line inside the workbench sets `editing` too, and that must show in the
          workbench's own pane rather than in a dialog on top of it. */}
      <ReceiptLineDialog
        show={!!editingRow && !pickerOpen}
        onClose={() => setEditing(null)}
        row={editingRow}
        info={editingRow ? uomInfo[editingRow._rid] : null}
        uomError={editingRow ? uomErrors[editingRow._rid] : null}
        rateEditable={rateEditable || !editingRow?.purchase_order_item}
        plateEnabled={plateConfig.enabled}
        plateRow={!!editingRow && !!plateItems[editingRow._rid]}
        plateConfig={plateConfig}
        onItemChange={handleItemChange}
        onSave={(next) => patchById(next._rid, next)}
      />
    </div>
  );
}
