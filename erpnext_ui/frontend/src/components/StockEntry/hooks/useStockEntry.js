import { useEffect, useState } from "react";
import { loadEntryTypesAPI } from "../api/LoadEntryType";
import { get, post } from "../../../services/api";
import { useToast } from "../../../context/ToastContext";

export function useStockEntry() {
  const toast = useToast();

  const [mode, setMode] = useState("incoming");
  const [items, setItems] = useState([]);
  const [scan, setScan] = useState("");
  const [fromWarehouse, setFromWarehouse] = useState("");
  const [toWarehouse, setToWarehouse] = useState("");
  const [warehouse, setWarehouse] = useState(""); // for adjustment
  const [entryTypes, setEntryTypes] = useState([]);
  const [showSource, setShowSource] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [postingDate, setPostingDate] = useState(null);
  const [postingTime, setPostingTime] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [project, setProject] = useState(null);
  const [workOrder, setWorkOrder] = useState(null);

  const [invalidItems, setInvalidItems] = useState([]);
  const [showFixModal, setShowFixModal] = useState(false);

  const openSubmitModal = () => setShowSubmit(true);
  const closeSubmitModal = () => setShowSubmit(false);

  const isWarehouseValid = fromWarehouse || toWarehouse;
  const hasItems = items.length > 0;

  const canAddItems = isWarehouseValid;
  const canSubmit = isWarehouseValid && hasItems;

  const [isSetupManuallyExpanded, setIsSetupManuallyExpanded] = useState(false);

  // FINAL VISIBILITY LOGIC
  const showSetup = !hasItems || isSetupManuallyExpanded;
  const isCompact = hasItems && !isSetupManuallyExpanded;

  const resetSetup = () => {
    setMode("");
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
  // ADD / SCAN ITEM
  // =============================
  const addItem = async (item) => {
    let updated;

    setItems((prev) => {
      const existing = prev.find((i) => i.code === item.code);

      if (existing) {
        updated = prev.map((i) =>
          i.code === item.code ? { ...i, qty: i.qty + 1 } : i,
        );
      } else {
        updated = [
          ...prev,
          {
            ...item,
            qty: 1,
            uom: item.uom || "Nos",
            uomOptions: item.uomOptions || ["Nos"],
          },
        ];
      }

      return updated;
    });

    let enriched = await enrichStock(updated, fromWarehouse);

    // 🔥 ADD THIS
    enriched = await enrichValuation(enriched);

    setItems(enriched);
  };

  // =============================
  // SCAN HANDLER
  // =============================
  const handleScan = (value) => {
    if (!value) return;

    // MOCK ITEM FETCH (replace with API)
    const item = {
      code: value,
      name: "Item " + value,
    };

    addItem(item);
    setScan("");
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

        // 🔥 only restrict in strict mode
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
  // LOAD SOURCE (MR/BOM/etc)
  // =============================
  const loadSource = async (items, sourceType) => {
    const mode = getStockMode(sourceType);

    let enriched = items;

    if (mode !== "none") {
      enriched = await enrichStock(items, fromWarehouse);
    }

    // 🔥 ADD THIS
    enriched = await enrichValuation(enriched);

    setItems(
      enriched.map((i) => ({
        ...i,
        stockMode: mode,
      })),
    );
  };

  useEffect(() => {
    if (!fromWarehouse || !items.length) return;

    const updateAll = async () => {
      let updated = await enrichStock(items, fromWarehouse);
      updated = await enrichValuation(updated);

      setItems(updated);
    };

    updateAll();
  }, [fromWarehouse]);

  // =============================
  // SUBMIT
  // =============================
  const submit = async () => {
    const invalid = getInvalidItems();

    if (invalid.length) {
      setInvalidItems(invalid);
      setShowFixModal(true);
      setShowSubmit(false);
      return;
    }

    const payload = buildPayload();

    try {
      const res = await post("resource/Stock Entry", payload);

      // optional submit (docstatus = 1)
      await post(`resource/Stock Entry/${res.data.name}`, {
        run_method: "submit",
      });

      toast.success("✅ Stock Entry Created: " + res.data.name);

      setItems([]);
      closeSubmitModal();
    } catch (err) {
      toast.error("✅ Stock Entry Failed");
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

  const getStockMode = (sourceType) => {
    if (["Purchase Receipt", "Purchase Invoice"].includes(sourceType))
      return "none";

    return "strict";
  };

  const getValidItems = () => {
    return items.filter((i) => {
      const available = (i.stockQty || 0) - (i.reservedQty || 0);
      return !(i.stockMode === "strict" && i.qty > available);
    });
  };

  const buildPayload = () => {
    const validItems = getValidItems();

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

        // 🔥 Warehouse mapping (IMPORTANT)
        if (selectedType === "Material Receipt") {
          item.t_warehouse = toWarehouse;
        } else if (selectedType === "Material Issue") {
          item.s_warehouse = fromWarehouse;
        } else if (selectedType === "Material Transfer") {
          item.s_warehouse = fromWarehouse;
          item.t_warehouse = toWarehouse;
        } else if (selectedType === "Material Transfer for Manufacture") {
          item.s_warehouse = fromWarehouse;
          item.t_warehouse = toWarehouse;
        } else if (selectedType === "Material Consumption for Manufacture") {
          item.s_warehouse = fromWarehouse;
        } else {
          // fallback (safe)
          item.s_warehouse = fromWarehouse;
          item.t_warehouse = toWarehouse;
        }

        // 🔥 Incoming valuation
        if (selectedType === "Material Receipt") {
          item.basic_rate = i.valuation_rate || 0;
          item.valuation_rate = i.valuation_rate || 0;
        }

        // 🔥 Outgoing fallback safety
        if (selectedType !== "Material Receipt") {
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

  const enrichValuation = async (items) => {
    const valuationMap = await getBulkValuation(items);

    return items.map((i) => {
      const val = valuationMap[i.code] || {};

      return {
        ...i,
        valuation_rate: val.valuation_rate,
        valuation_status: val.status,
      };
    });
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

    return res.message;
  };

  return {
    mode,
    setMode,
    setItems,
    items,
    scan,
    setScan,
    handleScan,
    updateQty,
    removeItem,
    loadSource,
    submit,
    totalQty,

    fromWarehouse,
    setFromWarehouse,
    toWarehouse,
    setToWarehouse,
    warehouse,
    setWarehouse,
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
