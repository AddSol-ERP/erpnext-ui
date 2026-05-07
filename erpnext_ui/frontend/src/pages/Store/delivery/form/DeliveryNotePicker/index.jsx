import { useState } from "react";
import AppModal from "../../../../../components/AppModal";
import { get } from "../../../../../services/api";

const SOURCE_TYPES = [
  { label: "Sales Order", value: "Sales Order" },
  { label: "Pick List", value: "Pick List" },
];

export default function DeliveryNotePicker({ show, onClose, onLoad }) {
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [documents, setDocuments] = useState([]);

  /* ================= RESET ================= */
  const resetData = () => {
    setSourceType("");
    setSourceId("");
    setDocuments([]);
  };

  /* ================= SEARCH ================= */
  const handleSearch = async (text) => {
    setSourceId(text);
    console.log(sourceType, text, "======");

    if (!sourceType) return;

    try {
      const res = await get(`resource/${sourceType}`, {
        fields: JSON.stringify(["name", "customer"]),
        filters: JSON.stringify([
          ["docstatus", "=", 1],
          ["status", "!=", "Closed"],
        ]),
        or_filters: JSON.stringify([
          ["name", "like", `%${text}%`],
          ["customer", "like", `%${text}%`],
        ]),
        limit_page_length: 10,
      });

      const formatted = (res.data || []).map((d) => ({
        value: d.name,
        description: d.customer,
      }));

      setDocuments(formatted);
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= LOAD ================= */
  const handleLoad = async () => {
    try {
      if (!sourceType || !sourceId) return;

      /* ===== SALES ORDER ===== */
      if (sourceType === "Sales Order") {
        const res = await get(`resource/Sales Order/${sourceId}`);
        const so = res.data;

        const items = (so.items || []).map((i) => ({
          item_code: i.item_code,
          qty: i.qty - (i.delivered_qty || 0),
          uom: i.uom,
          warehouse: i.warehouse,
          against_sales_order: so.name,
          so_detail: i.name,
        }));

        const filtered = items.filter((i) => i.qty > 0);

        onLoad({
          customer: so.customer,
          items: filtered,
        });
      }

      /* ===== PICK LIST (future ready) ===== */
      if (sourceType === "Pick List") {
        const res = await get(`resource/Pick List/${sourceId}`);
        const pl = res.data;

        const items = (pl.locations || []).map((i) => ({
          item_code: i.item_code,
          qty: i.qty,
          uom: i.uom,
          warehouse: i.warehouse,
        }));

        onLoad({
          items,
        });
      }

      onClose();
      resetData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AppModal
      show={show}
      onClose={() => {
        onClose();
        resetData();
      }}
      title="📦 Load Items"
      footer={
        <>
          <button
            className="btn btn-outline-primary"
            onClick={() => {
              onClose();
              resetData();
            }}
          >
            Cancel
          </button>

          <button
            className="btn btn-primary"
            disabled={!sourceType || !sourceId}
            onClick={handleLoad}
          >
            Load
          </button>
        </>
      }
    >
      <div className="row g-2">
        {/* TYPE */}
        <div className="col-12">
          <select
            className="form-select"
            value={sourceType}
            onChange={(e) => {
              setSourceType(e.target.value);
              setSourceId("");
              setDocuments([]);
            }}
          >
            <option value="">Select Source Type</option>
            {SOURCE_TYPES.map((t, i) => (
              <option key={i} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* DOCUMENT SEARCH */}
        <div className="col-12 position-relative">
          <input
            type="text"
            className="form-control"
            value={sourceId}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={
              sourceType ? "Search document..." : "Select type first"
            }
            disabled={!sourceType}
            onBlur={() => setTimeout(() => setDocuments([]), 200)}
            onFocus={() => handleSearch(sourceId)}
          />

          {documents.length > 0 && (
            <div className="dropdown-menu show w-100 p-0 shadow-sm">
              {documents.map((doc) => (
                <button
                  key={doc.value}
                  className="dropdown-item"
                  onClick={() => {
                    setSourceId(doc.value);
                    setDocuments([]);
                  }}
                >
                  <div className="fw-semibold">{doc.value}</div>
                  <div className="text-muted small">
                    {doc.description || "No customer"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppModal>
  );
}
