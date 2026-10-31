import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, Table2, Trash2, Info, Lock } from "lucide-react";
import { get, getMethod } from "../../../../services/api";
import { saveDocument, submitDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import FormSelect from "../../../../components/FormSelect";
import AppModal from "../../../../components/AppModal";
import { focusFirstError } from "../../../../lib/formValidation";
import LinkField from "../../../../components/LinkField";
import { useHeader } from "../../../../context/HeaderContext";
import { useRole } from "../../../../context/RoleContext";
import { useToast } from "../../../../context/ToastContext";
import { requestPurpose } from "../../../../config/storePurposes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localDateISO } from "../../../../utils/localDateTime";
import RequestSupplierQuotesDialog from "./RequestSupplierQuotesDialog";
import { nextRid } from "../../../../lib/childRows";
import { ratePerUomLabel } from "../../../../lib/uomPricing";

/**
 * Raise an indent (and the other four request purposes).
 *
 * Two things changed here that matter more than they look:
 *
 * 1. **There is no Purpose dropdown.** The type is derived from the `:purpose`
 *    route segment through config/storePurposes.js. The previous form offered a
 *    Select containing "Transfer" and "Material Receipt", neither of which is a
 *    valid `material_request_type` -- every such save died with a bare HTTP 417.
 *    Removing the control removes the possibility rather than validating it.
 *
 * 2. **Every item row carries its own Project.** Setting one switches that row's
 *    Item field from free search to the project's bill of materials, showing
 *    what is still needed. Clearing it goes back to free search. That is the
 *    split between "project specific" and "other than project" the shop floor
 *    actually works in.
 */
export default function MaterialRequestForm() {
  const { name, purpose } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();
  const { t } = useTranslation();
  const { userRoles = [] } = useRole();

  const isEdit = !!name;
  const cfg = purpose ? requestPurpose(purpose) : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [newItem, setNewItem] = useState(null);
  const [newItemError, setNewItemError] = useState("");
  const [defaultTargetWarehouse, setDefaultTargetWarehouse] = useState("");
  const [showSupplierQuotes, setShowSupplierQuotes] = useState(false);

  // Client-only fields that must be stripped before save. Note that
  // `custom_rate_per_pricing_uom` is deliberately NOT here: it is the
  // authoritative rate-per-pricing-UOM the server's `_apply_uom_pricing`
  // reads to derive `rate`/`amount`. Stripping it would push the server onto
  // the `rate` fallback (already the derived standard rate) and double-apply
  // the per-unit factor.
  const MR_ITEM_CLIENT_FIELDS = [
    "_rid",
    "pricing_uom",
  ];

  const [doc, setDoc] = useState({
    // On edit the server value wins; on create the purpose supplies it.
    material_request_type: cfg?.materialRequestType || "",
    company: "",
    customer: "",
    schedule_date: "",
    // Form-level for the production purpose (see the `project` field in the
    // header). ERPNext still carries `project` on every Material Request Item,
    // so this is copied onto each row on save rather than sent once.
    project: "",
    items: [],
    docstatus: 0,
  });

  // _rid -> pricing UOM resolved from the Item Group rule (buying side).
  const [pricingUomByRid, setPricingUomByRid] = useState({});

  /**
   * project -> { loading, hasBom, items, error }
   *
   * Cached per project because several rows usually share one project, and
   * re-exploding a BOM on every keystroke in another row's project field would
   * be wasteful.
   */
  const [projectItems, setProjectItems] = useState({});
  // What the header project just filled in, so the UI can say so rather than
  // leaving the user to wonder why rows appeared.
  const [bomAdded, setBomAdded] = useState(null);

  // The Save button is registered into the page toolbar by an effect that
  // deliberately does not depend on `doc` (re-running it per keystroke would
  // thrash the toolbar), so the registered handler closes over the document as
  // of an early render -- validation and the saved payload then used stale
  // data. Handlers read through this ref.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // Monotonic id for header-project BOM loads. A slow response for project A
  // must not append A's BOM lines after the user has already picked project B.
  const projectRequestId = useRef(0);

  const purposeTitle = cfg ? t(`store.purposes.${cfg.i18nKey}.title`) : t("store.mr.title");
  const isTransfer = doc.material_request_type === "Material Transfer";
  const isCustomerProvided = doc.material_request_type === "Customer Provided";
  const isPurchase = doc.material_request_type === "Purchase";
  const isReadOnly = doc.docstatus !== 0;
  // Every purpose carries one project on the header, copied onto the rows. Only
  // a production request also explodes that project's BOM into the item list;
  // the other purposes copy the project and let the user pick from its BOM one
  // row at a time. Read the doctype value, not the route: the shared edit route
  // has no `:purpose` segment.
  const isProductionRequest = doc.material_request_type === "Manufacture";
  const canRequestSupplierQuotes = userRoles.some((role) =>
    ["Purchase User", "Purchase Manager", "Store Manager", "Stock User", "Stock Manager", "Administrator"].includes(role),
  );

  /* ================= HELPERS ================= */

  // Resolve the effective UOM pricing UOM for an Item (buying side). Fail
  // closed so a missing backend deployment never reprices a line by accident.
  const loadPricingInfo = useCallback(
    async (rid, itemCode) => {
      if (!itemCode) {
        setPricingUomByRid((p) => {
          const next = { ...p };
          delete next[rid];
          return next;
        });
        return;
      }
      try {
        const res = await get("method/erpnext_ui.api.get_item_pricing", {
          item_code: itemCode,
          side: "buying",
        });
        const message = res?.message ?? res ?? {};
        const enabled = !!message.enabled;
        const pricingUom = enabled ? message.pricing_uom || "" : "";
        setPricingUomByRid((p) => ({ ...p, [rid]: pricingUom }));
      } catch {
        setPricingUomByRid((p) => ({ ...p, [rid]: "" }));
      }
    },
    [],
  );

  const autoCompany = useCallback(async () => {
    try {
      const res = await get("method/frappe.client.get_list", {
        doctype: "Company",
        fields: JSON.stringify(["name"]),
        limit_page_length: 1,
      });

      if (res.message?.length) {
        setDoc((p) => ({ ...p, company: p.company || res.message[0].name }));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadDoc = useCallback(async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Material Request/${name}`);
      const d = res.data;

      // Give every existing row a client key so per-UOM pricing state is
      // keyed stably (row indices move when a row is removed).
      const itemsWithRid = (d.items || []).map((r) => ({ ...r, _rid: nextRid() }));

      setDoc({
        material_request_type: d.material_request_type,
        company: d.company,
        customer: d.customer || "",
        schedule_date: d.schedule_date || "",
        // ERPNext stores the project per ITEM row, never on the header, so the
        // form-level value is recovered from the first row that carries one.
        // Without this an existing production indent opens with an empty project
        // box, and clearing it would silently blank every row.
        project: (d.items || []).find((r) => r.project)?.project || "",
        items: itemsWithRid.map((r) => ({
          ...r,
          // Keep these as numbers/strings the inputs can bind to; the server
          // returns floats for qty and stock_qty which render fine either way.
          qty: r.qty ?? "",
          project: r.project || "",
          uom: r.uom || "",
          stock_uom: r.stock_uom || "",
          conversion_factor: r.conversion_factor ?? 1,
          schedule_date: r.schedule_date || "",
          from_warehouse: r.from_warehouse || "",
          warehouse: r.warehouse || "",
        })),
        docstatus: d.docstatus,
      });
      const warehouses = (d.items || []).map((row) => row.warehouse || "");
      setDefaultTargetWarehouse(
        warehouses.length && warehouses.every((warehouse) => warehouse === warehouses[0])
          ? warehouses[0]
          : "",
      );

      // Warm the pricing UOM cache so an existing material request shows its
      // per-UOM rate input.
      await Promise.all(itemsWithRid.map(async (r) => {
        if (r.item_code) await loadPricingInfo(r._rid, r.item_code);
      }));
    } catch {
      setError(t("common.failedToLoad", { name: t("store.mr.title") }));
    } finally {
      setLoading(false);
    }
  }, [name, t, loadPricingInfo]);

  /**
   * Explode the project's BOM so its rows can offer only those items.
   *
   * Failure is recorded but never blocks typing: a person must still be able to
   * free-text items if a BOM is missing or unreadable.
   *
   * Returns the loaded entry because `handleHeaderProjectChange` needs the rows
   * immediately. Reading `projectItems[next]` after the await reads the state
   * from the render that started the request -- which is still empty on the
   * first pick -- so the BOM fill would silently add nothing.
   */
  const loadProjectItems = useCallback(async (project) => {
    if (!project) return null;
    setProjectItems((p) => ({
      ...p,
      [project]: { ...(p[project] || {}), loading: true, error: "" },
    }));

    try {
      const message = await getMethod("method/erpnext_ui.api.get_project_items", {
        project,
      });
      const entry = { loading: false, hasBom: !!message.has_bom, items: message.items || [] };
      setProjectItems((p) => ({ ...p, [project]: entry }));
      return entry;
    } catch (e) {
      const entry = { loading: false, hasBom: false, items: [], error: e.message };
      setProjectItems((p) => ({ ...p, [project]: entry }));
      return entry;
    }
  }, []);

  /* ================= ITEMS ================= */

  const emptyItemRow = (current) => ({
    item_code: "",
    qty: "",
    uom: "",
    stock_uom: "",
    conversion_factor: 1,
    schedule_date: current.schedule_date,
    project: current.project,
    from_warehouse: "",
    warehouse: defaultTargetWarehouse,
    description: "",
    _rid: nextRid(),
    rate: "",
    custom_rate_per_pricing_uom: "",
  });

  /**
   * The header Required By is global: changing it updates every line and any
   * line being composed in the add-item modal. Rows keep their own date input so
   * an individual line can still be pulled earlier/later afterwards.
   */
  const handleScheduleDateChange = (value) => {
    setDoc((current) => ({
      ...current,
      schedule_date: value,
      items: current.items.map((row) => ({ ...row, schedule_date: value })),
    }));
    setNewItem((row) => (row ? { ...row, schedule_date: value } : row));
  };

  const handleDefaultTargetWarehouseChange = (warehouse) => {
    const next = warehouse || "";
    setDefaultTargetWarehouse(next);
    setDoc((current) => ({
      ...current,
      items: current.items.map((row) => ({ ...row, warehouse: next })),
    }));
    setNewItem((row) => row ? { ...row, warehouse: next } : row);
  };

  const addRow = () => {
    setNewItem(emptyItemRow(docRef.current));
    setNewItemError("");
    setItemModalOpen(true);
  };

  const addNewItem = () => {
    const row = { ...(newItem || emptyItemRow(docRef.current)) };
    // A row composed before the header date was chosen still has to inherit the
    // selected date rather than save with an empty Required By.
    if (!row.schedule_date) row.schedule_date = docRef.current.schedule_date || "";
    if (!row.item_code || !row.qty || Number(row.qty) <= 0 || !row.uom || !row.warehouse ||
      (isTransfer && !row.from_warehouse) || (isPurchase && !String(row.description || "").trim())) {
      setNewItemError(t("store.validation.fillAllRows"));
      return;
    }
    if (isTransfer && row.from_warehouse === row.warehouse) {
      setNewItemError(t("store.validation.sameWarehouse"));
      return;
    }
    // Ensure a stable _rid for the new row.
    const rowWithRid = { ...row, _rid: nextRid() };
    setDoc((p) => ({ ...p, items: [...p.items, rowWithRid] }));
    setItemModalOpen(false);
    setNewItem(null);
    setNewItemError("");
  };

  const updateNewItem = (field, value) => {
    setNewItem((row) => ({ ...row, [field]: value }));
    setNewItemError("");
  };

  const handleNewItemChange = async (itemCode) => {
    updateNewItem("item_code", itemCode || "");
    if (!itemCode) return;
    try {
      const res = await get(`resource/Item/${encodeURIComponent(itemCode)}`);
      const item = res.data;
      setNewItem((row) => row ? ({
        ...row,
        uom: item.stock_uom || "",
        stock_uom: item.stock_uom || "",
        conversion_factor: 1,
      }) : row);
      // Load pricing info for the new item. The `_rid` is already set by `emptyItemRow`.
      await loadPricingInfo(newItem._rid, itemCode);
    } catch (e) {
      console.error(e);
    }
  };

  const updateRow = (i, field, value) => {
    setDoc((p) => ({
      ...p,
      items: p.items.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    }));
  };

  const removeRow = (i) => {
    setDoc((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  };

  /**
   * Setting a project clears the item on that row.
   *
   * Otherwise the row would keep an item chosen under a different project's
   * BOM, and the UI would claim it is a project item when it is not.
   */
  const handleProjectChange = (i, project) => {
    updateRow(i, "project", project || "");
    updateRow(i, "item_code", "");
    updateRow(i, "qty", "");
    updateRow(i, "uom", "");
    if (project) loadProjectItems(project);
  };

  /**
   * Choose the whole indent's project.
   *
   * The project is a property of the whole request for every purpose: it is
   * copied onto each row (ERPNext stores it per item, never on the header) and
   * an explicit change here overwrites the rows. A row's own project field stays
   * editable afterwards for an exception.
   *
   * A production indent IS a project: the bill of materials says what is needed,
   * so its BOM lines are added automatically. The other purposes only copy the
   * project; they still offer its BOM through the row item picker, one row at a
   * time.
   *
   * Additive on purpose. Rows that already carry an item are left alone, and BOM
   * lines already present are skipped, so re-picking the project cannot silently
   * discard work or duplicate a line. Clearing the project keeps the items and
   * drops the project from each row: they are real items either way, and deleting
   * a typed list because a filter was cleared is the destructive choice.
   */
  const handleHeaderProjectChange = async (project) => {
    const next = project || "";
    const requestId = ++projectRequestId.current;

    setDoc((p) => ({
      ...p,
      project: next,
      items: p.items.map((r) => ({ ...r, project: next })),
    }));
    setNewItem((row) => (row ? { ...row, project: next } : row));

    if (!next) {
      setBomAdded(null);
      return;
    }

    const cache = await loadProjectItems(next);
    // The user changed the project again while this BOM was loading; its rows
    // must not be appended to the newer selection.
    if (projectRequestId.current !== requestId) return;

    if (!isProductionRequest) {
      setBomAdded(null);
      return;
    }

    const bomItems = cache?.items || [];
    const onDoc = new Set(
      docRef.current.items.map((r) => r.item_code).filter(Boolean),
    );
    const wanted = bomItems.filter((it) => !onDoc.has(it.item_code));

    setDoc((p) => {
      // Keep one spare empty row so the table never ends on a filled row.
      const rows = p.items.length ? p.items : [{ item_code: "", qty: "", uom: "", stock_uom: "", conversion_factor: 1, schedule_date: p.schedule_date, project: next, from_warehouse: "", warehouse: "", description: "", _rid: nextRid(), rate: "", custom_rate_per_pricing_uom: "" }];
      const withProject = rows.map((r) => ({ ...r, project: next }));
      const empties = withProject.filter((r) => !r.item_code);
      const filled = withProject.filter((r) => r.item_code);
      const fresh = wanted.map((it) => bomRow(it, next, p.schedule_date));
      // Keep exactly ONE spare empty row so the table never ends on a filled
      // row -- the user needs somewhere to add the next item.
      return { ...p, project: next, items: [...filled, ...fresh, ...empties.slice(0, 1)] };
    });

    setBomAdded({ project: next, added: wanted.length, total: bomItems.length, hasBom: cache?.hasBom });
  };

  /** One Material Request Item built from one BOM line. */
  const bomRow = (it, project, scheduleDate) => {
    const outstanding = Number(it.outstanding_qty ?? 0);
    return {
      item_code: it.item_code,
      item_name: it.item_name,
      uom: it.uom || it.stock_uom,
      stock_uom: it.stock_uom,
      conversion_factor: it.conversion_factor || 1,
      // The gap, not the full BOM quantity: asking for material already
      // requested is how duplicate indents happen.
      qty: String(outstanding > 0 ? outstanding : it.required_qty ?? ""),
      warehouse: it.source_warehouse || "",
      schedule_date: scheduleDate || "",
      project,
      from_warehouse: "",
      description: "",
      _rid: nextRid(),
      rate: "",
      custom_rate_per_pricing_uom: "",
    };
  };

  /** Adopt a BOM item: quantity defaults to what is still outstanding. */
  const applyBomItem = (i, itemCode) => {
    const cache = projectItems[doc.items[i]?.project];
    const match = cache?.items?.find((it) => it.item_code === itemCode);
    if (!match) return;

    const outstanding = Number(match.outstanding_qty ?? 0);
    setDoc((p) => ({
      ...p,
      items: p.items.map((row, idx) =>
        idx === i
          ? {
              ...row,
              item_code: match.item_code,
              item_name: match.item_name,
              uom: match.uom || match.stock_uom,
              stock_uom: match.stock_uom,
              conversion_factor: match.conversion_factor || 1,
              // Pre-fill with the gap, not the full BOM quantity: asking for
              // material that was already requested is how duplicate indents
              // happen. Falls back to the BOM quantity when nothing is pending.
              qty:
                row.qty !== "" && row.qty != null
                  ? row.qty
                  : String(outstanding > 0 ? outstanding : match.required_qty ?? ""),
              warehouse: row.warehouse || match.source_warehouse || "",
              rate: "",
              custom_rate_per_pricing_uom: "",
            }
          : row,
      ),
    }));
  };

  /** Free-search item: fill UOM from the Item master. */
  const handleItemChange = async (i, itemCode) => {
    updateRow(i, "item_code", itemCode || "");
    if (!itemCode) return;

    try {
      // encodeURIComponent matters: an item code may legitimately contain "/"
      // or "#", which would otherwise split the REST path.
      const res = await get(`resource/Item/${encodeURIComponent(itemCode)}`);
      const item = res.data;

      setDoc((p) => ({
        ...p,
        items: p.items.map((row, idx) =>
          idx === i
            ? {
                ...row,
                uom: item.stock_uom,
                stock_uom: item.stock_uom,
                conversion_factor: 1,
                // UOM Conversion Factor has no server-side derivation here, so
                // an explicit change away from stock UOM must at least reset it
                // to something valid rather than leave a stale 0.
                qty: row.qty,
              }
            : row,
        ),
      }));
      await loadPricingInfo(doc.items[i]?._rid || doc.items[i]?.name, itemCode);
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= VALIDATION ================= */

  const validate = (d = docRef.current) => {
    const errs = {};

    if (!d.material_request_type) {
      errs.material_request_type = t("store.validation.typeRequired");
    }
    if (!d.company) {
      errs.company = t("store.validation.companyRequired");
    }
    if (d.material_request_type === "Customer Provided" && !d.customer) {
      errs.customer = t("store.validation.customerRequired");
    }

    if (!d.items.length) {
      errs.items = t("store.validation.addAtLeastOneItem");
    } else {
      for (let i = 0; i < d.items.length; i++) {
        const row = d.items[i];
        if (!row.item_code || !row.qty) {
          errs.items = t("store.validation.fillAllRows");
          break;
        }
        if (!row.uom) {
          errs.items = t("store.validation.uomRequired");
          break;
        }
        // Material Request Item.schedule_date is `reqd: 1` even though the
        // header's Required By is optional. Clearing the global date blanks
        // every row, so catch it here instead of at save with a MandatoryError.
        if (!row.schedule_date) {
          errs.items = t("store.validation.scheduleDateRequired");
          break;
        }
        if (!row.conversion_factor || row.conversion_factor <= 0) {
          errs.items = t("store.validation.invalidConversion");
          break;
        }
        if (parseFloat(row.qty) <= 0) {
          errs.items = t("store.validation.qtyGtZero");
          break;
        }
        if (d.material_request_type === "Purchase" && !String(row.description || "").trim()) {
          errs[`item_description_${i}`] = t("store.validation.purchaseRemarkRequired");
        }
        // "Transfer" was never a valid material_request_type; the correct
        // value is "Material Transfer". Comparing against the wrong string
        // meant the transfer warehouse rules never ran.
        if (d.material_request_type === "Material Transfer") {
          if (!row.from_warehouse || !row.warehouse) {
            errs.items = t("store.validation.fromToWarehouseRequired");
            break;
          }
          if (row.from_warehouse === row.warehouse) {
            errs.items = t("store.validation.sameWarehouse");
            break;
          }
        } else if (!row.warehouse) {
          errs.items = t("store.validation.warehouseRequired");
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

  /* ================= SAVE ================= */

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

      // `project` is a FORM-level control, not a Material Request field. ERPNext
      // carries it on each item row (already set on every row), and posting an
      // unknown header field would send a key the doctype has no column for.
      const { project: _formProject, ...payload } = current;

      // Strip client-only fields (`_rid`, `pricing_uom`) so ERPNext does not
      // reject unknown attributes. `payload` is already a fresh shallow copy
      // from the rest spread, and `map` builds new row objects, so the source
      // `doc.items` rows are never mutated. `custom_rate_per_pricing_uom` is
      // deliberately KEPT -- it is the authoritative rate-per-pricing-UOM the
      // server reads; stripping it would double-apply the per-unit factor.
      payload.items = payload.items.map((row) => {
        const clean = { ...row };
        MR_ITEM_CLIENT_FIELDS.forEach((f) => delete clean[f]);
        return clean;
      });

      const res = await saveDocument({
        doctype: "Material Request",
        name: isEdit ? name : undefined,
        doc: payload,
      });

      // A registered, real route. The old code navigated to
      // /store/material-request/<type>/view/<name>, which nothing matched --
      // the user landed on a blank page after every successful save.
      navigate(`/store/material-request/${res.data.name}`);
    } catch (e) {
      // NOT `catch { setError(t("common.saveFailed")) }`. A bare catch throws
      // away `e`, and `e.message` is the whole point of the work in
      // services/api.jsx: it resolves the server's own wording out of
      // `_server_messages`, with informational `alert: 1` entries filtered out.
      // Replacing it with "Failed to save" means a MandatoryError naming four
      // missing fields, or a LinkValidationError naming one, both arrive as the
      // same four words -- so a failed save is indistinguishable from a network
      // blip and the user has no idea what to change.
      toast.error(e.message || t("common.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= SUBMIT ================= */

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // `frappe.client.submit` takes the whole document, not {doctype, name}.
      await submitDocument({ doctype: "Material Request", name });
      loadDoc();
    } catch (e) {
      toast.error(e.message || t("common.submitFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= HEADER ================= */

  useEffect(() => {
    setHeader({
      title: isEdit ? name : t("store.mr.newTitle"),
      subtitle: t("store.mr.createSubtitle", { type: purposeTitle }),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        {
          // Points at the single all-requests list, not a per-purpose one.
          // Purpose cards open the form directly, so a per-purpose list would
          // have no way in — an unreachable route is worse than no route.
          label: t("store.mr.allTitle"),
          path: "/store/material-request",
        },
        { label: purposeTitle },
        { label: isEdit ? name : t("common.new") },
      ],

      actions: [
        isEdit && {
          label: t("common.print"),
          variant: "btn-outline-primary",
          onClick: () => navigate(`/store/print/Material%20Request/${encodeURIComponent(name)}`),
        },
        isEdit &&
          doc.docstatus === 1 &&
          doc.material_request_type === "Purchase" &&
          canRequestSupplierQuotes && {
            label: t("store.mr.supplierEmail.action"),
            variant: "btn-primary",
            onClick: () => setShowSupplierQuotes(true),
          },
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
  }, [isEdit, name, purpose, purposeTitle, doc.docstatus, doc.material_request_type, loading, canRequestSupplierQuotes, navigate]);

  /* ================= DEFAULT ================= */

  useEffect(() => {
    if (!isEdit) {
      // Mirror route/default values into the form on first mount.
      // Same pattern as the delivery form: this only seeds state once, on
      // mount, and the alternative (deriving in render) would fight loadDoc.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDoc((p) => ({
        ...p,
        material_request_type: cfg?.materialRequestType || "",
        schedule_date: p.schedule_date || localDateISO(),
      }));

      autoCompany();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= LOAD ================= */
  useEffect(() => {
    // loadDoc sets `loading` synchronously but only writes `doc` after its
    // awaited fetch resolves, so this does not cascade a render per keystroke.
    // Same reasoning as the delivery form's INIT effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isEdit) loadDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Warm the BOM cache for every project already on a loaded document, so an
  // existing indent opens showing its quantities rather than empty rows.
  useEffect(() => {
    if (!isEdit || loading) return;
    const projects = new Set(
      doc.items.map((r) => r.project).filter(Boolean),
    );
    projects.forEach((p) => {
      if (!projectItems[p]) loadProjectItems(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, loading, doc.items]);

  const bomOptionsFor = useMemo(
    () => (project) => {
      const cache = projectItems[project];
      if (!cache || cache.loading || !cache.items?.length) return [];
      return cache.items.map((it) => {
        const outstanding = Number(it.outstanding_qty ?? 0);
        const suffix =
          outstanding > 0
            ? ` — ${t("store.projectItems.outstanding")}: ${outstanding}`
            : ` — ${t("store.projectItems.required")}: ${it.required_qty}`;
        return { value: it.item_code, label: `${it.item_code} · ${it.item_name}${suffix}` };
      });
    },
    [projectItems, t],
  );

  /* ================= UI ================= */

  if (!cfg && !isEdit) {
    return (
      <div className="mx-auto w-full max-w-[1100px] pt-4">
        <FormErrorSummary
          summary={t("store.mr.unknownPurpose")}
          fieldErrors={{}}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 pt-4 md:h-full md:min-h-0">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {isReadOnly ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>{t("store.mr.readOnlySubmitted")}</p>
        </div>
      ) : null}

      {/*
        A submitted document is immutable in ERPNext. The toolbar already hides
        Save and Submit, but every input stayed live: editing one changed only
        local state, so the screen said "submitted" while accepting changes that
        could never be saved. `fieldset disabled` makes the whole form read-only
        at the DOM level, including LinkField, FormSelect and the item rows.
      */}
      <fieldset disabled={isReadOnly} className="contents">
        {/* BASIC */}
      <FormSection
        title={t("store.form.basics")}
        icon={ClipboardList}
        collapsible
        className="shrink-0"
        errorCount={(fieldErrors.company ? 1 : 0) + (fieldErrors.customer ? 1 : 0)}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        <FormField label={t("store.form.purpose")} required name="material_request_type">
          <Input value={purposeTitle} disabled />
        </FormField>

        <FormField
          label={t("store.form.company")}
          required
          name="company"
          error={fieldErrors.company}
        >
          <LinkField
            doctype="Company"
            value={doc.company}
            onChange={(v) => setDoc({ ...doc, company: v })}
          />
        </FormField>

        <FormField label={t("store.labels.targetWarehouseAll")}>
          <LinkField
            doctype="Warehouse"
            value={defaultTargetWarehouse}
            onChange={handleDefaultTargetWarehouseChange}
          />
        </FormField>

        {isCustomerProvided && (
          <FormField
            label={t("store.form.customer")}
            required
            name="customer"
            error={fieldErrors.customer}
          >
            <LinkField
              doctype="Customer"
              value={doc.customer}
              onChange={(v) => setDoc({ ...doc, customer: v })}
            />
          </FormField>
        )}

        {/* PROJECT -- one for the whole request, copied onto every row. A row
            can still override it afterwards. */}
        <FormField
          label={t("store.mr.form.project")}
          name="project"
          error={fieldErrors.project}
        >
          <LinkField
            doctype="Project"
            value={doc.project}
            onChange={handleHeaderProjectChange}
            placeholder={t("store.projectItems.chooseProject")}
          />
        </FormField>

        <FormField label={t("store.form.requiredBy")} name="schedule_date">
          <Input
            type="date"
            value={doc.schedule_date}
            onChange={(e) => handleScheduleDateChange(e.target.value)}
          />
        </FormField>
      </FormSection>

      {/* ITEMS */}
      <FormSection
        title={t("store.mr.form.items")}
        icon={Table2}
        className="md:flex md:min-h-0 md:flex-1 md:flex-col"
        contentClassName="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto pr-1 md:max-h-none md:min-h-0 md:flex-1"
      >
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("store.projectItems.hint")}
        </p>

        <FormField
          name="items"
          error={fieldErrors.items}
          className={fieldErrors.items ? "" : "sr-only"}
        >
          <span className="sr-only">{t("store.mr.form.items")}</span>
        </FormField>

        {/* What the header project just did. Without it rows appear from nowhere
            and the user cannot tell whether the BOM was read or the list is just
            empty. */}
        {bomAdded ? (
          <p
            className={
              bomAdded.added > 0
                ? "rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                : "rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700"
            }
          >
            {bomAdded.added > 0
              ? t("store.projectItems.filledFromBom", {
                  project: bomAdded.project,
                  added: bomAdded.added,
                  total: bomAdded.total,
                })
              : bomAdded.hasBom
                ? t("store.projectItems.allPresent", { project: bomAdded.project })
                : t("store.projectItems.noBom", { project: bomAdded.project })}
          </p>
        ) : null}

        {doc.items.map((row, i) => {
          const cache = row.project ? projectItems[row.project] : null;
          const bomOptions = bomOptionsFor(row.project);
          // A header project change copies the project onto rows that may
          // already carry a free-text item. Keep that item in the LinkField
          // instead of handing its code to a Select whose options do not
          // contain it -- and once the item is cleared (or chosen from the BOM)
          // the picker takes over.
          const useBomPicker = Boolean(
            row.project &&
              bomOptions.length &&
              (!row.item_code || bomOptions.some((opt) => opt.value === row.item_code)),
          );

          return (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-12 md:items-end"
            >
              {/* PROJECT — an explicit override of the header project. It also
                  switches the item field between free search and the project's
                  BOM. */}
              <div className="col-span-2 md:col-span-2">
                <FormField label={t("store.labels.projectOptional")}>
                  <LinkField
                    doctype="Project"
                    value={row.project}
                    onChange={(v) => handleProjectChange(i, v)}
                    placeholder={t("store.projectItems.chooseProject", {
                      defaultValue: "Choose a project",
                    })}
                  />
                </FormField>
              </div>

              {/* ITEM — BOM picker when a project with a BOM is set */}
              <div className="col-span-2 md:col-span-4">
                <FormField label={t("store.form.item")} required>
                  {useBomPicker ? (
                    <FormSelect
                      value={row.item_code}
                      placeholder={t("store.projectItems.chooseBom", {
                        defaultValue: "Choose an item",
                      })}
                      onChange={(v) => applyBomItem(i, v)}
                      options={bomOptions}
                    />
                  ) : (
                    <LinkField
                      doctype="Item"
                      value={row.item_code}
                      onChange={(v) => handleItemChange(i, v)}
                    />
                  )}
                </FormField>

                {row.project && cache?.loading && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("common.loading")}
                  </p>
                )}
                {row.project && !cache?.loading && cache && !cache.hasBom && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    {t("store.projectItems.noBomShort")}
                  </p>
                )}
              </div>

              {/* QTY */}
              <div className="md:col-span-1">
                <FormField label={t("store.form.qty")} required>
                  <Input
                    type="number"
                    value={row.qty}
                    onChange={(e) => updateRow(i, "qty", e.target.value)}
                  />
                </FormField>
              </div>

              {/* UOM */}
              <div className="md:col-span-1">
                <FormField label={t("store.form.uom")} required>
                  <Input value={row.uom || ""} disabled />
                </FormField>
              </div>

              {/* SOURCE — transfer only */}
              {isTransfer && (
                <div className="col-span-2 md:col-span-2">
                  <FormField label={t("store.labels.sourceWarehouse")} required>
                    <LinkField
                      doctype="Warehouse"
                      value={row.from_warehouse}
                      onChange={(v) => updateRow(i, "from_warehouse", v)}
                    />
                  </FormField>
                </div>
              )}

              {/* TARGET */}
              <div className="col-span-2 md:col-span-2">
                <FormField label={t("store.labels.targetWarehouse")} required>
                  <LinkField
                    doctype="Warehouse"
                    value={row.warehouse}
                    onChange={(v) => updateRow(i, "warehouse", v)}
                  />
                </FormField>
              </div>

              {/* REQUIRED BY */}
              <div className="md:col-span-1">
                <FormField label={t("store.form.requiredBy")}>
                  <Input
                    type="date"
                    value={row.schedule_date}
                    onChange={(e) => updateRow(i, "schedule_date", e.target.value)}
                  />
                </FormField>
              </div>

              {/* RATE -- standard ERPNext rate per document UOM. */}
              {!doc.docstatus && (
                <div className="md:col-span-2">
                  <FormField label={t("store.form.rate")}>
                    <Input
                      type="number"
                      step="any"
                      value={row.rate ?? ""}
                      onChange={(e) => updateRow(i, "rate", e.target.value)}
                    />
                  </FormField>
                </div>
              )}

              {/* Per-UOM rate input when a pricing UOM is resolved. */}
              {!doc.docstatus && pricingUomByRid[row._rid] ? (
                <div className="md:col-span-3">
                  <FormField label={ratePerUomLabel(pricingUomByRid[row._rid]) || t("store.form.rate")}>
                    <Input
                      type="number"
                      step="any"
                      value={row.custom_rate_per_pricing_uom ?? ""}
                      onChange={(e) =>
                        updateRow(i, "custom_rate_per_pricing_uom", e.target.value)
                      }
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("store.form.ratePerUomHint", { uom: pricingUomByRid[row._rid] })}
                    </p>
                  </FormField>
                </div>
              ) : null}

              {/* DELETE */}
              {!doc.docstatus && (
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
              )}

              {isPurchase ? (
                <div className="col-span-2 md:col-span-12">
                  <FormField
                    label={t("store.mr.form.remark")}
                    name={`item_description_${i}`}
                    required
                    error={fieldErrors[`item_description_${i}`]}
                  >
                    <Input
                      value={row.description || ""}
                      onChange={(e) => updateRow(i, "description", e.target.value)}
                    />
                  </FormField>
                </div>
              ) : null}
            </div>
          );
        })}

        {!doc.docstatus ? (
          <div className="sticky bottom-0 z-10 -mx-2 flex justify-end bg-background/95 px-2 py-2 backdrop-blur">
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus />
              {t("store.getItems.addItem")}
            </Button>
          </div>
        ) : null}
      </FormSection>
      </fieldset>

      <AppModal
        show={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={t("store.getItems.addItem")}
        width="lg"
        contentClassName="max-h-[calc(100dvh-1rem)] sm:max-h-[92vh]"
        bodyClassName="pb-12"
        footer={(
          <>
            <Button variant="outline" onClick={() => setItemModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={addNewItem}>
              <Plus />
              {t("store.getItems.addItem")}
            </Button>
          </>
        )}
      >
        {newItem ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t("store.labels.projectOptional")}>
              <LinkField
                doctype="Project"
                value={newItem.project || ""}
                onChange={(v) => {
                  updateNewItem("project", v || "");
                  if (v) loadProjectItems(v);
                }}
                placeholder={t("store.projectItems.chooseProject", { defaultValue: "Choose a project" })}
              />
            </FormField>
            <FormField label={t("store.form.item")} required>
              {newItem.project && bomOptionsFor(newItem.project).length ? (
                <FormSelect
                  value={newItem.item_code || ""}
                  placeholder={t("store.projectItems.chooseBom", { defaultValue: "Choose an item" })}
                  onChange={(code) => {
                    const match = projectItems[newItem.project]?.items?.find((it) => it.item_code === code);
                    if (!match) return;
                    const outstanding = Number(match.outstanding_qty ?? 0);
                    setNewItem((row) => ({
                      ...row,
                      item_code: match.item_code,
                      item_name: match.item_name,
                      uom: match.uom || match.stock_uom,
                      stock_uom: match.stock_uom,
                      conversion_factor: match.conversion_factor || 1,
                      qty: String(outstanding > 0 ? outstanding : match.required_qty ?? ""),
                      warehouse: row.warehouse || match.source_warehouse || "",
                    }));
                    setNewItemError("");
                  }}
                  options={bomOptionsFor(newItem.project)}
                />
              ) : (
                <LinkField doctype="Item" value={newItem.item_code || ""} onChange={handleNewItemChange} />
              )}
            </FormField>
            <FormField label={t("store.form.qty")} required>
              <Input type="number" min="0" step="any" value={newItem.qty} onChange={(e) => updateNewItem("qty", e.target.value)} />
            </FormField>
            <FormField label={t("store.form.uom")} required>
              <Input value={newItem.uom || ""} disabled />
            </FormField>
            {isTransfer ? (
              <FormField label={t("store.labels.sourceWarehouse")} required>
                <LinkField doctype="Warehouse" value={newItem.from_warehouse || ""} onChange={(v) => updateNewItem("from_warehouse", v || "")} />
              </FormField>
            ) : null}
            <FormField label={t("store.labels.targetWarehouse")} required>
              <LinkField doctype="Warehouse" value={newItem.warehouse || ""} onChange={(v) => updateNewItem("warehouse", v || "")} />
            </FormField>
            <FormField label={t("store.form.requiredBy")}>
              <Input type="date" value={newItem.schedule_date || ""} onChange={(e) => updateNewItem("schedule_date", e.target.value)} />
            </FormField>
            {isPurchase ? (
              <FormField label={t("store.mr.form.remark")} required className="sm:col-span-2">
                <Input value={newItem.description || ""} onChange={(e) => updateNewItem("description", e.target.value)} />
              </FormField>
            ) : null}
            {newItemError ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{newItemError}</p> : null}
          </div>
        ) : null}
      </AppModal>
      {showSupplierQuotes ? (
        <RequestSupplierQuotesDialog
          show
          onClose={() => setShowSupplierQuotes(false)}
          materialRequestName={name}
        />
      ) : null}
    </div>
  );
}
