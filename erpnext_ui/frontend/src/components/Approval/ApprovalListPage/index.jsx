import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../ActionBar";
import Pagination from "../../Pagination";
import { get } from "../../../services/api";
import FilterModal from "../../FilterModal";
import ApprovalPreview from "../ApprovalPreview";

const PAGE_SIZE = 10;

const BASE_FIELDS = ["name", "owner", "creation", "modified", "status"];

const DOCTYPE_FIELDS = {
  "Purchase Order": [
    "supplier",
    "transaction_date",
    "grand_total",
    "terms",
    "workflow_state",
  ],
  "Expense Claim": [
    "employee",
    "posting_date",
    "total_claimed_amount",
    "workflow_state",
  ],
  "Leave Application": [
    "employee",
    "employee_name",
    "leave_type",
    "from_date",
    "to_date",
    "total_leave_days",
    "workflow_state",
  ],
  Quotation: [
    "customer_name",
    "transaction_date",
    "grand_total",
    "terms",
    "workflow_state",
  ],
};

const SEARCH_FIELDS = {
  "Purchase Order": ["name", "supplier"],
  "Expense Claim": ["name", "employee"],
  "Leave Application": ["name", "employee", "employee_name"],
  Quotation: ["customer_name", "title"],
};

/* ===============================
   LIST ROW
================================ */
function ListRow({ item, onClick }) {
  return (
    <div className="list-row" onClick={() => onClick(item.raw)}>
      <div className="list-col main">
        <div className="list-title">{item.title}</div>
        <div className="list-sub text-muted">{item.subtitle}</div>
      </div>

      <div className="list-col meta d-none d-md-block">{item.meta}</div>

      <div className="list-col actions">
        <span className={`badge status-${item.status}`}>{item.status}</span>

        <button className="btn btn-icon">
          <i className="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}

/* ===============================
   STATUS MAP
================================ */

const STATUS_MAP = {
  // 🔹 draft
  Draft: "open",

  // 🔹 pending / in-progress
  Open: "open",
  "To Receive": "pending",
  "To Bill": "pending",
  "To Receive and Bill": "pending",
  Pending: "pending",

  // 🔹 success
  Approved: "complete",
  Completed: "complete",
  Delivered: "complete",

  // 🔹 cancelled / rejected
  Cancelled: "danger",
  Rejected: "danger",
  Closed: "danger",
};

/* ===============================
   MAIN PAGE
================================ */
const ApprovalListPage = () => {
  const { doctype } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});
  const fieldsCache = useRef({});
  const [filterConfig, setFilterConfig] = useState(null);

  /* ===============================
     HEADER
  ============================== */
  useEffect(() => {
    setHeader({
      title: doctype,
      subtitle: "Pending approvals",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Approvals", path: "/approvals" },
        { label: doctype },
      ],

      actions: [
        {
          label: "Refresh",
          variant: "btn-outline-primary",
          icon: "bi bi-arrow-clockwise",
          onClick: loadData,
        },
      ],
    });

    return () => setHeader({});
  }, [doctype, page]);

  useEffect(() => {
    const loadFilters = async () => {
      const config = await buildFilterConfig(doctype);
      setFilterConfig(config);
    };

    if (doctype) loadFilters();
  }, [doctype]);

  const buildFilterConfig = async (doctype) => {
    try {
      const res = await get(`resource/DocType/${doctype}`);
      const fields = res.data.fields || [];

      // 🎯 Priority fields (ordered)
      const PRIORITY_FIELDS = [
        "workflow_state",
        "status",
        "company",
        "supplier",
        "customer",
        "employee",
        "posting_date",
        "transaction_date",
        "from_date",
        "to_date",
      ];

      const allowedTypes = ["Link", "Select", "Date"];

      let filters = [];

      // 🔥 STEP 1: Pick priority fields first
      PRIORITY_FIELDS.forEach((key) => {
        const f = fields.find((x) => x.fieldname === key);
        if (!f) return;

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
          filters.push({
            label: f.label,
            field: f.fieldname,
            type: "date",
          });
        }
      });

      // 🔥 STEP 2: Fill remaining slots (max 8 total)
      for (let f of fields) {
        if (filters.length >= 8) break;

        if (!f.fieldname || filters.find((x) => x.field === f.fieldname))
          continue;

        if (!allowedTypes.includes(f.fieldtype)) continue;

        // skip noisy fields
        if (
          [
            "name",
            "owner",
            "creation",
            "modified",
            "idx",
            "docstatus",
          ].includes(f.fieldname)
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
          filters.push({
            label: f.label,
            field: f.fieldname,
            type: "date",
          });
        }
      }

      return { filters };
    } catch (e) {
      console.error(e);
      return { filters: [] };
    }
  };

  /* ===============================
     BASE FILTERS
  ============================== */
  const getBaseFilters = () => {
    // 🔥 Common rule
    let filters = [];

    // Only submitted docs (ready for approval)
    filters.push(["docstatus", "=", 0]);

    // DOCTYPE specific adjustments
    if (doctype === "Purchase Order") {
      filters.push(["status", "not in", ["Completed", "Cancelled"]]);
    }

    if (doctype === "Expense Claim") {
      filters.push(["approval_status", "!=", "Approved"]);
    }

    if (doctype === "Leave Application") {
      filters.push(["status", "in", ["Open", "Applied"]]);
    }

    return filters;
  };

  /* ===============================
     OR SEARCH FILTER
  ============================== */
  const buildOrFilters = () => {
    if (!search) return [];

    const fields = SEARCH_FIELDS[doctype] || ["name"];

    return fields.map((f) => [f, "like", `%${search}%`]);
  };

  /* ===============================
     FINAL FILTERS (AND)
  ============================== */
  const buildFilters = () => {
    let filters = [];

    const status = selectedFilters.status || selectedFilters.workflow_state;

    // 🔥 smart handling
    if (status === "Draft") {
      filters.push(["docstatus", "=", 0]);
    } else if (status) {
      filters.push(["docstatus", "=", 1]);
      filters.push(["status", "=", status]);
    } else {
      // default
      filters.push(...getBaseFilters());
    }

    // apply other filters
    Object.entries(selectedFilters).forEach(([field, value]) => {
      if (!value) return;

      // skip already handled
      if (field === "status" || field === "workflow_state") return;

      filters.push([field, "=", value]);
    });

    return filters;
  };

  /* ===============================
     FIELD BUILDER
  ============================== */
  const getFields = async () => {
    if (fieldsCache.current[doctype]) {
      return fieldsCache.current[doctype];
    }

    const fields = [...BASE_FIELDS, ...(DOCTYPE_FIELDS[doctype] || [])];
    fieldsCache.current[doctype] = fields;

    return fields;
  };

  /* ===============================
     LOAD DATA
  ============================== */
  const loadData = async () => {
    try {
      const fields = await getFields();
      const filters = buildFilters();
      const or_filters = buildOrFilters();

      const params = {
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      if (or_filters.length) {
        params.or_filters = JSON.stringify(or_filters);
      }

      const [listRes, countRes] = await Promise.all([
        get(`resource/${doctype}`, params),
        get("method/frappe.client.get_count", {
          doctype,
          filters: JSON.stringify(filters),
          ...(or_filters.length && {
            or_filters: JSON.stringify(or_filters),
          }),
        }),
      ]);

      const count = countRes.message || 0;

      setData(listRes.data || []);
      setTotalPages(Math.ceil(count / PAGE_SIZE));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [doctype, page, search, selectedFilters]);

  /* ===============================
     RESET PAGE
  ============================== */
  useEffect(() => {
    setPage(1);
  }, [search, selectedFilters]);

  const getDisplayStatus = (row) => {
    const raw =
      row.workflow_state ||
      row.status ||
      (row.docstatus === 0
        ? "Draft"
        : row.docstatus === 1
          ? "Submitted"
          : row.docstatus === 2
            ? "Cancelled"
            : "");

    // 🔴 Rejected
    if (row.docstatus === 2 || raw === "Rejected") {
      return { label: "Rejected", color: "danger" };
    }

    // 🟢 Approved
    if (["Approved", "Completed", "Delivered", "Closed"].includes(raw)) {
      return { label: "Approved", color: "complete" };
    }

    // 🟡 Waiting for approval (🔥 MOST IMPORTANT)
    if (
      [
        "Open",
        "Pending",
        "To Receive",
        "To Bill",
        "To Receive and Bill",
        "Submitted",
      ].includes(raw) ||
      row.docstatus === 1
    ) {
      return { label: "Waiting for Approval", color: "pending" };
    }

    // ⚪ Draft
    if (row.docstatus === 0) {
      return { label: "Draft", color: "open" };
    }

    return { label: raw || "Unknown", color: "open" };
  };

  /* ===============================
     MAP DATA
  ============================== */
  const mapToList = (row) => {
    const status = getDisplayStatus(row);

    // 🔥 Leave Application (CUSTOM VIEW)
    if (doctype === "Leave Application") {
      return {
        title: row.employee_name || row.employee || "—",
        subtitle: row.leave_type || "—",
        meta: `${row.from_date || ""} → ${row.to_date || ""}${
          row.total_leave_days ? ` (${row.total_leave_days} days)` : ""
        }`,
        status: status.color,
        statusLabel: status.label,
        raw: row,
      };
    }

    if (doctype === "Quotation") {
      return {
        title: row.name || "—",
        subtitle: row.customer_name,
        meta: `${row.transaction_date}`,
        status: status.color,
        statusLabel: status.label,
        raw: row,
      };
    }

    // 🔥 Default (other doctypes)
    return {
      title: row.name,
      subtitle: row.title || row.supplier || row.employee || row.party || "—",
      meta: row.posting_date || row.transaction_date || row.creation || "",
      status: status.color,
      statusLabel: status.label,
      raw: row,
    };
  };

  const listData = data.map(mapToList);

  /* ===============================
     ROW CLICK
  ============================== */

  const [previewDoc, setPreviewDoc] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleRowClick = (doc) => {
    setPreviewDoc(doc);
    setShowPreview(true);
  };

  return (
    <div className="d-flex flex-column h-100" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* MODALS */}
      <ApprovalPreview
        show={showPreview}
        onClose={() => setShowPreview(false)}
        doc={previewDoc}
        doctype={doctype}
        onSuccess={loadData}
      />

      {filterConfig && (
        <FilterModal
          show={showFilter}
          onClose={() => setShowFilter(false)}
          config={filterConfig}
          initialFilters={selectedFilters}
          onApply={(filters) => setSelectedFilters(filters)}
        />
      )}

      {/* 🔥 ACTION BAR (fixed) */}
      <div className="flex-shrink-0">
        <ActionBar onSearch={setSearch} onFilter={() => setShowFilter(true)} />
      </div>

      {/* 🔥 SCROLLABLE LIST */}
      <div className="flex-grow-1 list-scroll">
        <div className="list-container">
          {listData.length === 0 ? (
            <div className="list-empty">No pending approvals found</div>
          ) : (
            listData.map((item, idx) => (
              <ListRow key={idx} item={item} onClick={handleRowClick} />
            ))
          )}
        </div>
      </div>

      {/* 🔥 PAGINATION (fixed bottom) */}
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
};

export default ApprovalListPage;
