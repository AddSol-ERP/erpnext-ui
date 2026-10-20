import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadEntryTypesAPI } from "../api/LoadEntryType";
import { get, post } from "../../../services/api";
import { useToast } from "../../../context/ToastContext";
import { localDateISO, localTimeHHMM } from "../../../utils/localDateTime";
import { STOCK_ENTRY_PURPOSES, stockPurposeForType } from "../../../config/storePurposes";
import { fetchAttachmentConfig, uploadAttachment } from "../../../lib/attachments";

export function useStockEntry() {
  const toast = useToast();
  const { t } = useTranslation();

  const [items, setItems] = useState([]);
  const [fromWarehouse, setFromWarehouse] = useState("");
  const [toWarehouse, setToWarehouse] = useState("");
  const [entryTypes, setEntryTypes] = useState([]);
  const [showSource, setShowSource] = useState(false);
  const [selectedType, setSelectedType] = useState("");

  // Posting date and time default to now, in local time. Both were `null`
  // before, which rendered two blank inputs on a screen whose whole purpose is
  // recording a movement that is happening right now.
  const [postingDate, setPostingDate] = useState(() => localDateISO());
  const [postingTime, setPostingTime] = useState(() => localTimeHHMM());
  const [showSubmit, setShowSubmit] = useState(false);
  const [project, setProject] = useState(null);
  const [workOrder, setWorkOrder] = useState(null);

  const [invalidItems, setInvalidItems] = useState([]);
  const [showFixModal, setShowFixModal] = useState(false);

  const openSubmitModal = () => setShowSubmit(true);
  const closeSubmitModal = () => setShowSubmit(false);
  // The saved Stock Entry name the attach dialog is opened against, and whether
  // it is open. The entry type is passed too so the dialog offers that type's
  // document keys rather than every type's.
  const [attachTarget, setAttachTarget] = useState(null);
  const [showAttach, setShowAttach] = useState(false);

  const isWarehouseValid = fromWarehouse || toWarehouse;
  const hasItems = items.length > 0;

  const canAddItems = isWarehouseValid;
  const canSubmit = isWarehouseValid && hasItems;

  const [isSetupManuallyExpanded, setIsSetupManuallyExpanded] = useState(false);

  // FINAL VISIBILITY LOGIC
  const showSetup = !hasItems || isSetupManuallyExpanded;
  const isCompact = hasItems && !isSetupManuallyExpanded;

  const resetSetup = () => {
    setFromWarehouse("");
    setToWarehouse("");
  };

  const getStockBatch = async (itemCodes, warehouse) => {
    if (!itemCodes.length || !warehouse) return {};

    const res = await get("resource/Bin", {
      filters: JSON.stringify([
        ["item_code", "in", itemCodes],
        ["warehouse", "=", warehouse],
      ]),
      fields: JSON.stringify(["item_code", "actual_qty", "reserved_qty"]),
      limit_page_length: 500,
    });

    const map = {};

    (res.data || []).forEach((row) => {
      map[row.item_code] = row;
    });

    return map;
  };

  const getBulkValuation = async (items) => {
    const payload = items.map((i) => ({
      item_code: i.code,
      qty: i.qty,
      batch_no: i.batch_no,
    }));

    const res = await get(
      "method/shopfloor.api.stock_entry.get_bulk_valuation",
      {
        items: JSON.stringify(payload),
        warehouse: fromWarehouse,
      },
    );

    return res.message || {};
  };

  /**
   * Valuation is a nicety, not a requirement.
   *
   * `shopfloor` is an ERPNext app that this Frappe site does not declare in
   * required_apps, so the call can fail wholesale on a site without it. It used
   * to throw straight out of `enrichValuation`, which meant a store user could
   * not record a movement at all because a helper app was absent. Now a failure
   * degrades to "no valuation", which ERPNext handles via
   * `allow_zero_valuation_rate`.
   */
  const enrichValuation = async (items) => {
    let valuationMap = {};
    try {
      valuationMap = await getBulkValuation(items);
    } catch (e) {
      console.warn("bulk valuation unavailable; continuing without rates", e);
      return items;
    }

    return items.map((i) => {
      const val = (valuationMap && valuationMap[i.code]) || {};

      return {
        ...i,
        valuation_rate: val.valuation_rate,
        valuation_status: val.status,
      };
    });
  };

  const enrichStock = async (items, warehouse) => {
    if (!warehouse || !items.length) return items;

    const itemCodes = items.map((i) => i.code);

    const stockMap = await getStockBatch(itemCodes, warehouse);

    return items.map((item) => {
      const stock = stockMap[item.code] || {};

      return {
        ...item,
        stockQty: stock.actual_qty || 0,
        reservedQty: stock.reserved_qty || 0,
      };
    });
  };


  // =============================
  // UPDATE QTY
  // =============================

  const updateQty = (code, qty) => {
    if (qty < 0) return;

    setItems((prev) =>
      prev.map((i) => {
        if (i.code !== code) return i;

        const available = (i.stockQty || 0) - (i.reservedQty || 0);

        // only restrict in strict mode
        if (i.stockMode === "strict") {
          return {
            ...i,
            qty: Math.min(Number(qty), available),
          };
        }

        return {
          ...i,
          qty: Number(qty),
        };
      }),
    );
  };

  // =============================
  // REMOVE
  // =============================
  const removeItem = (code) => {
    setItems((prev) => prev.filter((i) => i.code !== code));
  };

  // =============================
  // LOAD ITEMS
  // =============================
  /**
   * Take items from a Stock Entry that ERPNext itself mapped out of a source
   * document, rather than rebuilding the mapping here.
   *
   * `material_request.make_stock_entry` and `work_order.make_stock_entry` are
   * whitelisted, validate the source is submitted and of a usable type, and
   * already set the linkage fields (`material_request`,
   * `material_request_item`), the outstanding quantity, the per-row warehouse
   * side and the conversion factor.
   *
   * That linkage is the point: the old hand-rolled version copied
   * `item_code/qty/uom` only, so the source Material Request's `ordered_qty`
   * never moved and an indent looked owed forever even after goods were issued.
   */
  const loadMappedDocument = async (draft, { stockMode = "strict" } = {}) => {
    const rows = (draft?.items || []).map((r) => ({
      code: r.item_code,
      name: r.item_name,
      qty: Number(r.qty) || 0,
      uom: r.uom,
      stockUOM: r.stock_uom,
      conversionFactor: r.conversion_factor,
      uomOptions: [r.uom].filter(Boolean),
      s_warehouse: r.s_warehouse || "",
      t_warehouse: r.t_warehouse || "",
      // Kept so the payload can re-send them; they are what makes the source
      // document update on submit.
      material_request: r.material_request || "",
      material_request_item: r.material_request_item || "",
      work_order: r.work_order || "",
      stockMode,
    }));

    let enriched = await enrichStock(rows, fromWarehouse);
    enriched = await enrichValuation(enriched);

    setItems(enriched.map((i) => ({ ...i, stockMode })));
  };

  /** Add a single item typed or picked by the user. */
  const addItemByCode = async (itemCode, qty = 1) => {
    if (!itemCode) return;

    let item;
    try {
      const res = await get(
        "method/erpnext.stock.get_item_details.get_item_details",
        {
          args: JSON.stringify({
            item_code: itemCode,
            doctype: "Stock Entry",
            company: "",
            posting_date: postingDate,
            qty,
          }),
        },
      );
      const d = res.message || res.data || {};
      item = {
        code: itemCode,
        name: d.item_name || "",
        uom: d.uom || d.stock_uom || "",
        stockUOM: d.stock_uom || "",
        conversionFactor: d.conversion_factor || 1,
      };
    } catch {
      // Fall back to a bare row: a mistyped code should still be visible on
      // the list and correctable, rather than vanishing.
      item = { code: itemCode, name: itemCode, uom: "", stockUOM: "", conversionFactor: 1 };
    }

    const merged = [...items.filter((i) => i.code !== itemCode), { ...item, qty }];
    let enriched = await enrichStock(merged, fromWarehouse);
    enriched = await enrichValuation(enriched);
    setItems(
      enriched.map((i) => ({ ...i, stockMode: i.stockMode || "strict" })),
    );
  };

  useEffect(() => {
    if (!fromWarehouse || !items.length) return;

    const updateAll = async () => {
      let updated = await enrichStock(items, fromWarehouse);
      updated = await enrichValuation(updated);

      // Spread the existing row so `stockMode` survives. The previous version
      // rebuilt rows from scratch here, which silently dropped `stockMode` and
      // downgraded a clamped receipt to an unclamped one whenever the user
      // changed the source warehouse after loading.
      setItems((prev) =>
        prev.map((row) => {
          const next = updated.find((u) => u.code === row.code);
          return next ? { ...row, ...next } : row;
        }),
      );
    };

    updateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromWarehouse]);

  // =============================
  // SUBMIT
  // =============================
  const getValidItems = () => {
    return items.filter((i) => {
      const available = (i.stockQty || 0) - (i.reservedQty || 0);
      return !(i.stockMode === "strict" && i.qty > available);
    });
  };

  const buildPayload = () => {
    const validItems = getValidItems();

    // Every rule about the selected type lives in config/storePurposes.js. An
    // unknown type yields no rules, so a row goes out with neither warehouse
    // rather than with both -- and ERPNext's validate_warehouse will say so.
    const rules = STOCK_ENTRY_PURPOSES[stockPurposeForType(selectedType)] || {};
    const isReceipt = selectedType === "Material Receipt";

    return {
      doctype: "Stock Entry",
      stock_entry_type: selectedType,

      posting_date: postingDate,
      posting_time: postingTime,

      from_warehouse: fromWarehouse,
      to_warehouse: toWarehouse,

      project: project || undefined,
      work_order: workOrder || undefined,

      items: validItems.map((i) => {
        const item = {
          item_code: i.code,
          qty: i.qty,
          uom: i.uom,
        };

        // Warehouse mapping. showFrom/showTo are not a UI nicety:
        // `validate_warehouse` (stock_entry.py:829-900) force-clears to_warehouse
        // for source-only purposes and from_warehouse for target-only ones, so
        // sending both is not "safe" -- it is a field ERPNext silently drops,
        // which on screen looks like a warehouse that was set and then vanished.
        if (rules.showFromWarehouse) item.s_warehouse = fromWarehouse;
        if (rules.showToWarehouse) item.t_warehouse = toWarehouse;

        // Incoming valuation
        if (isReceipt) {
          item.basic_rate = i.valuation_rate || 0;
          item.valuation_rate = i.valuation_rate || 0;
        } else {
          // Outgoing fallback safety
          item.allow_zero_valuation_rate =
            i.valuation_status === "fallback" ? 1 : 0;
        }

        return item;
      }),
    };
  };

  const getInvalidItems = () => {
    return items.filter((i) => {
      const available = (i.stockQty || 0) - (i.reservedQty || 0);
      return i.stockMode === "strict" && i.qty > available;
    });
  };

  const submit = async (initialAttachment) => {
    const invalid = getInvalidItems();

    if (invalid.length) {
      setInvalidItems(invalid);
      setShowFixModal(true);
      setShowSubmit(false);
      return;
    }

    const payload = buildPayload();

    try {
      const attachmentConfig = await fetchAttachmentConfig("Stock Entry");
      const attachmentRequired =
        attachmentConfig.enabled &&
        (attachmentConfig.required_on || []).some((event) => ["save", "submit"].includes(event));
      if (attachmentRequired && !initialAttachment?.file) {
        throw new Error("Attach a document before saving or submitting this Stock Entry.");
      }
      if (attachmentRequired && !initialAttachment?.typeKey) {
        throw new Error("Choose an attachment type before saving or submitting this Stock Entry.");
      }

      const res = await post("resource/Stock Entry", payload);

      if (attachmentRequired) {
        await uploadAttachment({
          doctype: "Stock Entry",
          docname: res.data.name,
          typeKey: initialAttachment.typeKey,
          file: initialAttachment.file,
        });
      }

      // optional submit (docstatus = 1)
      await post(`resource/Stock Entry/${res.data.name}`, {
        run_method: "submit",
      });

      toast.success(
        t("store.entry.createdToast", { name: res.data.name }),
      );

      // AFTER submit, deliberately. This flow inserts and submits in one
      // click, so attaching before would mean splitting it into insert ->
      // attach -> submit and leaving a docstatus 0 entry behind if the operator
      // abandons the dialog. There is no draft step here to hang a file from.
      // The entry is saved and submitted by this point, so the name is real.
      setAttachTarget(res.data.name);
      setShowAttach(true);

      setItems([]);
      closeSubmitModal();
    } catch (error) {
      toast.error(error?.message || t("store.entry.failedToast"));
    }
  };

  useEffect(() => {
    const load = async () => {
      const data = await loadEntryTypesAPI();
      setEntryTypes(data);
    };

    load();
  }, []);

  const openSource = () => setShowSource(true);
  const closeSource = () => setShowSource(false);

  const totalQty = items.reduce((a, b) => a + b.qty, 0);

  const expandSetup = () => setIsSetupManuallyExpanded(true);
  const compactSetup = () => setIsSetupManuallyExpanded(false);

  const updateUOM = (code, uom) => {
    setItems((prev) => prev.map((i) => (i.code === code ? { ...i, uom } : i)));
  };

  const removeInvalidItems = () => {
    setItems((prev) =>
      prev.filter((i) => {
        const available = (i.stockQty || 0) - (i.reservedQty || 0);
        return !(i.stockMode === "strict" && i.qty > available);
      }),
    );

    setShowFixModal(false);
    setShowSubmit(true);
  };

  const adjustToAvailable = () => {
    setItems((prev) =>
      prev
        .map((i) => {
          const available = (i.stockQty || 0) - (i.reservedQty || 0);

          if (i.stockMode === "strict") {
            return {
              ...i,
              qty: Math.min(i.qty, Math.max(available, 0)),
            };
          }

          return i;
        })
        .filter((i) => i.qty > 0),
    );

    setShowFixModal(false);
    setShowSubmit(true);
  };

  return {
    attachTarget,
    showAttach,
    setShowAttach,
    setItems,
    items,
    updateQty,
    removeItem,
    loadMappedDocument,
    addItemByCode,
    submit,
    totalQty,

    fromWarehouse,
    setFromWarehouse,
    toWarehouse,
    setToWarehouse,
    entryTypes,
    setEntryTypes,
    showSource,
    setShowSource,
    openSource,
    closeSource,
    canAddItems,
    canSubmit,
    resetSetup,

    showSetup,
    isCompact,
    expandSetup,
    compactSetup,
    hasItems,

    selectedType,
    setSelectedType,

    postingTime,
    setPostingDate,
    postingDate,
    setPostingTime,
    updateUOM,

    openSubmitModal,
    showSubmit,
    setShowSubmit,
    closeSubmitModal,

    project,
    setProject,
    workOrder,
    setWorkOrder,

    invalidItems,
    removeInvalidItems,
    adjustToAvailable,
    setShowFixModal,
    showFixModal,
  };
}
