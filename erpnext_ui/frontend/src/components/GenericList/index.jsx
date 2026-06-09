import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { get } from "../../services/api";
import { getDoctypeConfig } from "../../config/doctypes";
import ActionBar from "../ActionBar";
import Pagination from "../Pagination";
import FilterModal from "../FilterModal";

/** Extract the hub name from the first segment of the current path. */
function useHub() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  return segments[0] || "";
}

const PAGE_SIZE = 10;
const BASE_FIELDS = ["name", "owner", "creation", "modified", "docstatus"];

/**
 * Status color mapping for status badges.
 */
const STATUS_COLORS = {
  // Draft / Open
  Draft: "open",
  "Not Started": "open",
  Open: "open",
  // Pending / In Progress
  "To Receive and Bill": "pending",
  "To Receive": "pending",
  "To Bill": "pending",
  Pending: "pending",
  "In Process": "pending",
  Applied: "pending",
  "Waiting for Approval": "pending",
  // Success / Approved
  Approved: "complete",
  Completed: "complete",
  Delivered: "complete",
  Present: "complete",
  Submitted: "pending",
  Active: "complete",
  // Danger / Rejected / Cancelled
  Cancelled: "danger",
  Rejected: "danger",
  Closed: "danger",
  Absent: "danger",
  "On Leave": "info",
  "Half Day": "warning",
};

/**
 * Resolve display status for a row given its doctype config.
 */
function resolveStatus(row, statusField) {
  if (!statusField) return { label: "", color: "" };

  let raw = row[statusField];

  // Handle docstatus field
  if (statusField === "docstatus") {
    const map = { 0: "Draft", 1: "Submitted", 2: "Cancelled" };
    raw = map[row.docstatus] || "Draft";
  }

  // Handle disabled / is_active boolean fields
  if (typeof raw === "boolean" || raw === 0 || raw === 1) {
    if (raw === true || raw === 1)
      return { label: "Active", color: "complete" };
    return { label: "Disabled", color: "danger" };
  }

  const label = raw || "Unknown";
  const color = STATUS_COLORS[label] || "open";
  return { label, color };
}

/* ===============================
   LIST ROW
=============================== */
function ListRow({ item, onClick }) {
  return (
    <div className="list-row" onClick={() => onClick(item.raw)}>
      <div className="list-col main">
        <div className="list-title">{item.title}</div>
        {item.subtitle && (
          <div className="list-sub text-muted">{item.subtitle}</div>
        )}
      </div>

      <div className="list-col meta d-none d-md-block">{item.meta}</div>

      <div className="list-col actions">
        {item.statusLabel && (
          <span className={`badge status-${item.statusColor}`}>
            {item.statusLabel}
          </span>
        )}

        <button className="btn btn-icon">
          <i className="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}

/* ===============================
   GENERIC LIST PAGE
=============================== */
export default function GenericListPage() {
  const { doctype } = useParams();
  const hub = useHub();
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});
  const [filterConfig, setFilterConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const config = useMemo(() => getDoctypeConfig(doctype), [doctype]);
  const fieldsCache = useRef({});
  const decodedDoctype = decodeURIComponent(doctype);

  /* ===============================
     HEADER
  ============================== */
  useEffect(() => {
    const hubName = hub ? hub.charAt(0).toUpperCase() + hub.slice(1) : "";
    const actions = [];

    // "New" button: nativeForm → ERPNext in new tab, readOnly → hidden, else → our GenericForm
    if (config.nativeForm) {
      actions.push({
        label: "New",
        variant: "btn-primary",
        icon: "bi bi-plus-lg",
        onClick: () =>
          window.open(
            `/app/${decodedDoctype.toLowerCase().replace(" ", "-")}/new-${decodedDoctype.toLowerCase().replace(" ", "-")}`,
            "_blank",
          ),
      });
    } else if (!config.readOnly) {
      actions.push({
        label: "New",
        variant: "btn-primary",
        icon: "bi bi-plus-lg",
        onClick: () =>
          navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}/new`),
      });
    }

    actions.push({
      label: "Refresh",
      variant: "btn-outline-primary",
      icon: "bi bi-arrow-clockwise",
      onClick: loadData,
    });

    setHeader({
      title: decodedDoctype,
      subtitle: `${hubName} module`,
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: hubName, path: `/${hub}` },
        { label: decodedDoctype },
      ],
      actions,
    });
    return () => setHeader({});
  }, [doctype, hub, page, config.readOnly, config.nativeForm]);

  /* ===============================
     BUILD FILTERS FROM METADATA
  ============================== */
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const res = await get(`resource/DocType/${decodedDoctype}`);
        const fields = res.data?.fields || [];
        const config = buildFilterConfig(fields);
        setFilterConfig(config);
      } catch {
        setFilterConfig({ filters: [] });
      }
    };
    loadFilters();
  }, [doctype]);

  const buildFilterConfig = (fields) => {
    const PRIORITY_FIELDS = [
      "workflow_state",
      "status",
      "company",
      "department",
      "supplier",
      "customer",
      "employee",
      "employee_name",
      "posting_date",
      "transaction_date",
      "from_date",
      "to_date",
      "item_code",
      "item_group",
    ];

    const allowedTypes = ["Link", "Select", "Date"];
    let filters = [];

    // Priority fields first
    PRIORITY_FIELDS.forEach((key) => {
      const f = fields.find((x) => x.fieldname === key);
      if (!f) return;
      if (filters.length >= 8) return;

      if (f.fieldtype === "Select" && f.options) {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "select",
          options: f.options
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean),
        });
      }
      if (f.fieldtype === "Link") {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "link",
          doctype: f.options,
        });
      }
      if (f.fieldtype === "Date") {
        filters.push({ label: f.label, field: f.fieldname, type: "date" });
      }
    });

    // Fill remaining slots
    for (const f of fields) {
      if (filters.length >= 8) break;
      if (!f.fieldname || filters.find((x) => x.field === f.fieldname))
        continue;
      if (!allowedTypes.includes(f.fieldtype)) continue;
      if (
        ["name", "owner", "creation", "modified", "idx", "docstatus"].includes(
          f.fieldname,
        )
      )
        continue;

      if (f.fieldtype === "Link") {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "link",
          doctype: f.options,
        });
      }
      if (f.fieldtype === "Select" && f.options) {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "select",
          options: f.options.split("\n"),
        });
      }
      if (f.fieldtype === "Date") {
        filters.push({ label: f.label, field: f.fieldname, type: "date" });
      }
    }

    return { filters };
  };

  /* ===============================
     BUILD FIELDS LIST
  ============================== */
  const getFields = useCallback(async () => {
    if (fieldsCache.current[decodedDoctype]) {
      return fieldsCache.current[decodedDoctype];
    }

    const customFields = [];
    const cfg = config.list;
    if (cfg.titleField && cfg.titleField !== "name")
      customFields.push(cfg.titleField);
    if (cfg.subtitleField) customFields.push(cfg.subtitleField);
    if (cfg.metaField) customFields.push(cfg.metaField);
    if (cfg.statusField) customFields.push(cfg.statusField);

    const fields = [...BASE_FIELDS, ...customFields];
    fieldsCache.current[decodedDoctype] = fields;
    return fields;
  }, [decodedDoctype, config]);

  /* ===============================
     BUILD QUERY FILTERS
  ============================== */
  const buildFilters = useCallback(() => {
    const filters = [];

    // Apply selected filters from FilterModal
    Object.entries(selectedFilters).forEach(([field, value]) => {
      if (!value) return;
      filters.push([field, "=", value]);
    });

    return filters;
  }, [selectedFilters]);

  const buildOrFilters = useCallback(() => {
    if (!search) return [];
    const fields = config.searchFields || ["name"];
    return fields.map((f) => [f, "like", `%${search}%`]);
  }, [search, config]);

  /* ===============================
     LOAD DATA
  ============================== */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fields = await getFields();
      const filters = buildFilters();
      const orFilters = buildOrFilters();

      const params = {
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      if (orFilters.length) {
        params.or_filters = JSON.stringify(orFilters);
      }

      const [listRes, countRes] = await Promise.all([
        get(`resource/${decodedDoctype}`, params),
        get("method/frappe.client.get_count", {
          doctype: decodedDoctype,
          filters: JSON.stringify(filters),
          ...(orFilters.length && { or_filters: JSON.stringify(orFilters) }),
        }),
      ]);

      setData(listRes.data || []);
      setTotalPages(Math.ceil((countRes.message || 0) / PAGE_SIZE));
    } catch (e) {
      console.error(`Failed to load ${decodedDoctype}:`, e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [
    decodedDoctype,
    page,
    search,
    selectedFilters,
    getFields,
    buildFilters,
    buildOrFilters,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset to page 1 on search/filter change
  useEffect(() => {
    setPage(1);
  }, [search, selectedFilters]);

  /* ===============================
     ROW CLICK
  ============================== */
  const handleRowClick = (doc) => {
    if (config.nativeForm) {
      // Open ERPNext native form in new tab
      window.open(
        `/app/${decodedDoctype.toLowerCase().replace(" ", "-")}/${doc.name}`,
        "_blank",
      );
    } else if (config.readOnly) {
      // Navigate to print preview for read-only doctypes
      navigate(
        `/${hub}/print/${encodeURIComponent(decodedDoctype)}/${encodeURIComponent(doc.name)}`,
      );
    } else {
      navigate(
        `/${hub}/${encodeURIComponent(decodedDoctype)}/${encodeURIComponent(doc.name)}`,
      );
    }
  };

  /* ===============================
     MAP DATA TO LIST ROWS
  ============================== */
  const mapToList = (row) => {
    const cfg = config.list;
    const status = resolveStatus(row, cfg.statusField);

    return {
      title: cfg.titleField ? row[cfg.titleField] || row.name || "—" : row.name,
      subtitle: cfg.subtitleField ? row[cfg.subtitleField] || "" : "",
      meta: cfg.metaField ? row[cfg.metaField] || "" : "",
      statusLabel: status.label,
      statusColor: status.color,
      raw: row,
    };
  };

  const listData = data.map(mapToList);

  return (
    <div
      className="d-flex flex-column h-100"
      style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}
    >
      {/* FILTER MODAL */}
      {filterConfig && (
        <FilterModal
          show={showFilter}
          onClose={() => setShowFilter(false)}
          config={filterConfig}
          initialFilters={selectedFilters}
          onApply={(filters) => setSelectedFilters(filters)}
        />
      )}

      {/* ACTION BAR */}
      <div className="flex-shrink-0">
        <ActionBar onSearch={setSearch} onFilter={() => setShowFilter(true)} />
      </div>

      {/* LIST BODY */}
      <div className="flex-grow-1 list-scroll">
        <div className="list-container">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : listData.length === 0 ? (
            <div className="list-empty">No records found</div>
          ) : (
            listData.map((item, idx) => (
              <ListRow key={idx} item={item} onClick={handleRowClick} />
            ))
          )}
        </div>
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 pagination-sticky">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
