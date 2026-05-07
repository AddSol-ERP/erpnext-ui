import { useEffect, useState } from "react";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import FilterModal from "../../../components/FilterModal";
import ListLayout from "../../../components/ListLayout"; // ✅ add this
import { get } from "../../../services/api";
import JobCardPreviewModal from "./JobCardPreviewModal";

const PAGE_SIZE = 10;

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
        <span className={`badge status-${item.status}`}>
          {item.statusLabel}
        </span>

        <button className="btn btn-icon">
          <i className="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}

/* ===============================
   STATUS
================================ */
const getStatus = (row) => {
  if (row.status === "Completed")
    return { label: "Completed", color: "complete" };
  if (row.status === "Work In Progress")
    return { label: "In Progress", color: "pending" };
  if (row.status === "Open") return { label: "Open", color: "open" };
  return { label: row.status || "Unknown", color: "open" };
};

/* ===============================
   FILTER CONFIG
================================ */
const filterConfig = {
  filters: [
    {
      label: "Status",
      field: "status",
      type: "select",
      options: ["Open", "Work In Progress", "Completed"],
    },
    {
      label: "Work Order",
      field: "work_order",
      type: "link",
      doctype: "Work Order",
    },
    {
      label: "Operation",
      field: "operation",
      type: "link",
      doctype: "Operation",
    },
  ],
};

export default function JobCardsList() {
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [previewDoc, setPreviewDoc] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});

  /* HEADER */
  useEffect(() => {
    setHeader({
      title: "Job Cards",
      subtitle: "Track and control shop floor operations",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Production", path: "/production" },
        { label: "Job Cards" },
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
  }, []);

  /* DEBOUNCE */
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  /* LOAD */
  const loadData = async () => {
    try {
      let filters = [
        ["docstatus", "!=", 2],
        ["status", "not in", ["Cancelled"]],
      ];

      Object.entries(selectedFilters).forEach(([k, v]) => {
        if (v) filters.push([k, "=", v]);
      });

      const params = {
        fields: JSON.stringify([
          "name",
          "work_order",
          "operation",
          "status",
          "for_quantity",
          "total_completed_qty",
          "modified",
        ]),
        filters: JSON.stringify(filters),
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      if (debouncedSearch) {
        params.or_filters = JSON.stringify([
          ["name", "like", `%${debouncedSearch}%`],
          ["operation", "like", `%${debouncedSearch}%`],
          ["work_order", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Job Card", params),
        get("method/frappe.client.get_count", {
          doctype: "Job Card",
          filters: JSON.stringify(filters),
        }),
      ]);

      setData(listRes.data || []);
      const count = countRes.message || 0;
      setTotalPages(Math.ceil(count / PAGE_SIZE));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, debouncedSearch, selectedFilters]);

  /* MAP */
  const listData = data.map((row) => {
    const status = getStatus(row);
    return {
      title: row.name,
      subtitle: `${row.operation || "-"} · WO: ${row.work_order || "-"}`,
      meta: `${row.total_completed_qty || 0} / ${row.for_quantity || 0}`,
      status: status.color,
      statusLabel: status.label,
      raw: row,
    };
  });

  return (
    <>
      {/* MODALS */}
      <JobCardPreviewModal
        show={showPreview}
        onClose={() => setShowPreview(false)}
        doc={previewDoc}
        onSuccess={loadData}
      />

      <FilterModal
        show={showFilter}
        onClose={() => setShowFilter(false)}
        config={filterConfig}
        initialFilters={selectedFilters}
        onApply={(filters) => {
          setSelectedFilters(filters);
          setPage(1);
        }}
      />

      <ListLayout
        actionBar={
          <ActionBar
            onSearch={setSearch}
            onFilter={() => setShowFilter(true)}
            onPrint={() => window.print()}
            onExport={() => console.log("export")}
          />
        }
        pagination={
          totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )
        }
        isEmpty={listData.length === 0}
        emptyState="No Job Cards found"
      >
        {/* 🔥 EXTRA INFO (filters + search) */}
        <div className="px-2">
          {Object.keys(selectedFilters).length > 0 && (
            <div className="small text-muted mb-2">
              Filters:{" "}
              {Object.entries(selectedFilters)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")}
            </div>
          )}

          {debouncedSearch && (
            <div className="small text-muted mb-2">
              Searching: "{debouncedSearch}"
            </div>
          )}
        </div>

        {/* LIST */}
        <div className="list-container">
          {listData.map((item, idx) => (
            <ListRow
              key={idx}
              item={item}
              onClick={(doc) => {
                setPreviewDoc(doc);
                setShowPreview(true);
              }}
            />
          ))}
        </div>
      </ListLayout>
    </>
  );
}
