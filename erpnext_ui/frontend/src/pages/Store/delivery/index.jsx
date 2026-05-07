import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";

import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import FilterModal from "../../../components/FilterModal";
import ListLayout from "../../../components/ListLayout";

import { get } from "../../../services/api";

const PAGE_SIZE = 10;

/* ================= STATUS ================= */
const getStatus = (row) => {
  if (row.docstatus === 0) return { label: "Draft", color: "open" };

  if (row.docstatus === 1) {
    if (row.status === "Completed")
      return { label: "Completed", color: "complete" };

    if (row.status === "To Bill") return { label: "To Bill", color: "warning" };

    return { label: row.status || "Submitted", color: "complete" };
  }

  return { label: "Cancelled", color: "danger" };
};

/* ================= FILTER ================= */
const filterConfig = {
  filters: [
    {
      label: "Status",
      field: "status",
      type: "select",
      options: ["Draft", "To Bill", "Completed", "Cancelled"],
    },
    {
      label: "Customer",
      field: "customer",
      type: "link",
      doctype: "Customer",
    },
    {
      label: "Company",
      field: "company",
      type: "link",
      doctype: "Company",
    },
  ],
};

export default function DeliveryNoteList() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: "Delivery Notes",
      subtitle: "Dispatch & delivery tracking",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Store", path: "/store" },
        { label: "Delivery Notes" },
      ],

      actions: [
        {
          label: "+ New",
          onClick: () => navigate("/store/delivery/new"),
        },
      ],
    });

    return () => setHeader({});
  }, []);

  /* ================= SEARCH ================= */
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);

    return () => clearTimeout(t);
  }, [search]);

  /* ================= LOAD ================= */
  const loadData = async () => {
    try {
      let filters = [["docstatus", "!=", 2]];

      Object.entries(selectedFilters).forEach(([k, v]) => {
        if (v) filters.push([k, "=", v]);
      });

      const params = {
        fields: JSON.stringify([
          "name",
          "customer",
          "posting_date",
          "status",
          "docstatus",
          "company",
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
          ["customer", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Delivery Note", params),
        get("method/frappe.client.get_count", {
          doctype: "Delivery Note",
          filters: JSON.stringify(filters),
        }),
      ]);

      setData(listRes.data || []);
      setTotalPages(Math.ceil((countRes.message || 0) / PAGE_SIZE));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, debouncedSearch, selectedFilters]);

  /* ================= MAP ================= */
  const listData = data.map((row) => {
    const status = getStatus(row);

    return {
      title: row.name,
      subtitle: `${row.customer || ""} • ${row.posting_date}`,
      meta: row.modified,
      status: status.color,
      statusLabel: status.label,
      raw: row,
    };
  });

  /* ================= UI ================= */
  return (
    <>
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
        emptyState="No delivery notes found"
      >
        <div className="list-container">
          {listData.map((item, i) => (
            <div
              key={i}
              className="list-row"
              onClick={() => navigate(`/store/delivery/${item.raw.name}`)}
            >
              <div className="list-col main">
                <div className="list-title">{item.title}</div>
                <div className="list-sub text-muted">{item.subtitle}</div>
              </div>

              <div className="list-col meta">{item.meta}</div>

              <div className="list-col actions">
                <span className={`badge status-${item.status}`}>
                  {item.statusLabel}
                </span>

                <button className="btn btn-icon">
                  <i className="bi bi-chevron-right" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ListLayout>
    </>
  );
}
