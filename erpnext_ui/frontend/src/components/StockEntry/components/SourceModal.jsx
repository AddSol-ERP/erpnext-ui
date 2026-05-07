import { useRef, useState } from "react";
import AppModal from "../../AppModal";
import { get } from "../../../services/api";

export default function SourceModal({ show, onClose, loadSource }) {
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [qcDone, setQcDone] = useState(false);
  const [documents, setDocuments] = useState([]);

  const searchTimeout = useRef(null);

  const SOURCE_TYPES = [
    { label: "Material Request", value: "Material Request" },
    { label: "Purchase Receipt", value: "Purchase Receipt" },
    { label: "Bill of Materials", value: "BOM" },
    { label: "Purchase Invoice", value: "Purchase Invoice" },
    { label: "Item Master", value: "Item" },
  ];

  const handleLoad = async () => {
    const doc = await fetchSourceItems(sourceType, sourceId);

    let items = mapItems(sourceType, doc);

    // 🔥 enrich UOM options
    items = await enrichWithUOM(items);

    loadSource(items, sourceType);
    resetData();
    onClose();
  };

  const resetData = () => {
    setSourceType("");
    setSourceId("");
    setQcDone(false);
    setDocuments([]);
  };

  const getSourceDocuments = async (doctype) => {
    const res = await get(`resource/${doctype}`, {
      fields: JSON.stringify(["name"]),
      limit_page_length: 20,
    });

    return res.data || [];
  };

  const fetchSourceItems = async (doctype, name) => {
    const res = await get(`resource/${doctype}/${name}`);
    return res.data;
  };

  const mapItems = (doctype, doc, qcDone) => {
    let items = [];

    if (doctype === "Material Request") {
      items = doc.items;
    }

    if (doctype === "Purchase Receipt") {
      items = doc.items.filter((i) => (qcDone ? i.quality_inspection : true));
    }

    if (doctype === "BOM") {
      items = doc.items;
    }

    if (doctype === "Item") {
      items = [
        {
          item_code: doc.name,
          qty: 1,
          uom: doc.stock_uom,
          item_name: doc.item_name,
        },
      ];
    }

    return items.map((i) => ({
      code: i.item_code,
      name: i.item_name,

      qty: i.qty,
      uom: i.uom,
      stockUOM: i.stock_uom,

      conversionFactor: i.conversion_factor,

      // 🔥 IMPORTANT
      uomOptions: [i.uom], // default (will expand later)
    }));
  };

  const enrichWithUOM = async (items) => {
    return Promise.all(
      items.map(async (item) => {
        const res = await get(`resource/Item/${item.code}`);
        const doc = res.data;

        const uomOptions = (doc.uoms || []).map((u) => u.uom);

        return {
          ...item,
          uomOptions: uomOptions.length > 0 ? uomOptions : [item.uom],
        };
      }),
    );
  };

  const handleSearch = (value) => {
    setSourceId(value);

    if (!value || value.length < 2) {
      setDocuments([]);
      return;
    }

    clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(async () => {
      const args = {
        doctype: sourceType,
        txt: value,
        page_length: 10,
      };

      if (
        sourceType === "Purchase Receipt" ||
        sourceType === "Purchase Invoice"
      ) {
        args.filters = JSON.stringify([["docstatus", "=", 1]]);
      }

      if (sourceType === "Material Request") {
        args.filters = JSON.stringify([
          ["docstatus", "=", 1],
          ["material_request_type", "!=", "Purchase"],
        ]);
      }

      if (sourceType === "BOM") {
        args.filters = JSON.stringify([["is_active", "=", 1]]);
      }
      if (sourceType === "Item") {
        const res = await get("resource/Item", {
          filters: JSON.stringify([
            ["disabled", "=", 0],
            ["has_variants", "=", 0],
            ["item_name", "like", `%${value}%`],
          ]),
          fields: JSON.stringify(["name", "item_name"]),
          limit_page_length: 10,
        });

        setDocuments(
          res.data.map((d) => ({
            value: d.name,
            description: d.item_name,
          })),
        );

        return;
      }

      const res = await get("method/frappe.desk.search.search_link", args);

      setDocuments(res.message || []);
    }, 300);
  };

  const handleFocus = async () => {
    if (!sourceType) return;

    const args = {
      doctype: sourceType,
      txt: "",
      page_length: 10,
    };

    if (sourceType === "Material Request") {
      args.filters = JSON.stringify([
        ["docstatus", "=", 1],
        ["material_request_type", "!=", "Purchase"],
      ]);
    }

    if (
      sourceType === "Purchase Receipt" ||
      sourceType === "Purchase Invoice"
    ) {
      args.filters = JSON.stringify([["docstatus", "=", 1]]);
    }

    if (sourceType === "BOM") {
      args.filters = JSON.stringify([["is_active", "=", 1]]);
    }

    const res = await get("method/frappe.desk.search.search_link", args);

    setDocuments(res.message || []);
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
            onChange={async (e) => {
              const type = e.target.value;
              setSourceType(type);
              setSourceId("");

              if (type) {
                const docs = await getSourceDocuments(type);
                setDocuments(docs);
              }
            }}
          >
            <option value="">Select Source Type</option>
            {SOURCE_TYPES.map((source_type, source_type_idx) => {
              return (
                <option
                  key={`source-${source_type_idx}`}
                  value={source_type.value}
                >
                  {source_type.label}
                </option>
              );
            })}
          </select>
        </div>

        {/* DOCUMENT */}
        <div className="col-12">
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
            onFocus={handleFocus}
          />
          {documents.length > 0 && (
            <div className="dropdown-menu show w-100 p-0 shadow-sm">
              {documents.map((doc) => (
                <button
                  key={doc.value}
                  className="dropdown-item rich-item"
                  onClick={() => {
                    setSourceId(doc.value);
                    setDocuments([]);
                  }}
                >
                  <div className="d-flex align-items-start gap-2">
                    {/* ICON */}
                    <div className="rich-icon">
                      <i className="bi bi-file-earmark-text"></i>
                    </div>

                    {/* CONTENT */}
                    <div className="flex-grow-1 overflow-hidden">
                      {/* ID */}
                      <div className="fw-semibold text-truncate">
                        {doc.value}
                      </div>

                      {/* DESCRIPTION */}
                      <div
                        className="text-muted small line-clamp-2"
                        title={doc.description}
                      >
                        {doc.description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* QC */}
        <div className="col-12">
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="qcDone"
              checked={qcDone}
              onChange={(e) => setQcDone(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="qcDone">
              Only QC Passed Items
            </label>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
