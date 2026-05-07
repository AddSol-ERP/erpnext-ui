import { useEffect, useState } from "react";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import FilterModal from "../../../components/FilterModal";
import ListLayout from "../../../components/ListLayout"; // ✅ important
import { get } from "../../../services/api";
import WorkOrderPreviewModal from "./WorkOrderPreviewModal";

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
  if (row.status === "In Process")
    return { label: "In Process", color: "pending" };
  if (row.status === "Not Started") return { label: "Open", color: "open" };

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
      options: ["Not Started", "In Process", "Completed"],
    },
    {
      label: "Item",
      field: "production_item",
      type: "link",
      doctype: "Item",
    },
  ],
};

/* ===============================
   MAIN
================================ */
export default function WorkOrderList() {
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});

  const [previewDoc, setPreviewDoc] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  /* HEADER */
  useEffect(() => {
    setHeader({
      title: "Work Orders",
      subtitle: "Track and manage production jobs",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Production", path: "/production" },
        { label: "Work Orders" },
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
      let filters = [["docstatus", "!=", 2]];

      Object.entries(selectedFilters).forEach(([k, v]) => {
        if (v) filters.push([k, "=", v]);
      });

      const params = {
        fields: JSON.stringify([
          "name",
          "production_item",
          "qty",
          "produced_qty",
          "status",
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
          ["production_item", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Work Order", params),
        get("method/frappe.client.get_count", {
          doctype: "Work Order",
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
      subtitle: row.production_item,
      meta: `${row.produced_qty || 0} / ${row.qty || 0}`,
      status: status.color,
      statusLabel: status.label,
      raw: row,
    };
  });

  return (
    <>
      {/* MODAL */}
      <WorkOrderPreviewModal
        show={showPreview}
        onClose={() => setShowPreview(false)}
        doc={previewDoc}
        onSuccess={loadData}
      />

      {/* FILTER */}
      <FilterModal
        show={showFilter}
        onClose={() => setShowFilter(false)}
        config={filterConfig}
        initialFilters={selectedFilters}
        onApply={(f) => {
          setSelectedFilters(f);
          setPage(1);
        }}
      />

      <ListLayout
        actionBar={
          <ActionBar
            onSearch={setSearch}
            onFilter={() => setShowFilter(true)}
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
        emptyState="No Work Orders found"
      >
        <div className="list-container">
          {listData.map((item, i) => (
            <ListRow
              key={i}
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
