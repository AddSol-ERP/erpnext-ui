import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import ListLayout from "../../../components/ListLayout";
import FilterModal from "../../../components/FilterModal";
import { get } from "../../../services/api";

const PAGE_SIZE = 10;

/* ================= ROW ================= */
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

/* ================= STATUS ================= */
const getStatus = (docstatus) => {
  if (docstatus === 1) return { label: "Approved", color: "complete" };
  if (docstatus === 2) return { label: "Rejected", color: "danger" };
  return { label: "Pending", color: "pending" };
};

/* ================= FILTER CONFIG ================= */
const filterConfig = {
  filters: [
    {
      label: "Status",
      field: "docstatus",
      type: "select",
      options: ["Pending", "Approved", "Rejected"],
    },
    {
      label: "Employee",
      field: "employee",
      type: "link",
      doctype: "Employee",
    },
    {
      label: "From Date",
      field: "from_date",
      type: "date",
    },
    {
      label: "To Date",
      field: "to_date",
      type: "date",
    },
  ],
};

/* ================= MAIN ================= */
export default function AttendanceRequestList() {
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
      title: "Attendance Requests",
      subtitle: "Review and manage attendance corrections",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Requests", path: "/requests" },
        { label: "Attendance Requests" },
      ],

      actions: [
        {
          label: "Create",
          variant: "btn-primary",
          onClick: () => navigate("new"),
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
      let filters = [];

      /* STATUS */
      if (selectedFilters.docstatus) {
        const map = {
          Pending: 0,
          Approved: 1,
          Rejected: 2,
        };
        filters.push(["docstatus", "=", map[selectedFilters.docstatus]]);
      }

      /* EMPLOYEE */
      if (selectedFilters.employee) {
        filters.push(["employee", "=", selectedFilters.employee]);
      }

      /* DATE RANGE */
      if (selectedFilters.from_date) {
        filters.push(["from_date", ">=", selectedFilters.from_date]);
      }

      if (selectedFilters.to_date) {
        filters.push(["to_date", "<=", selectedFilters.to_date]);
      }

      const params = {
        fields: JSON.stringify([
          "name",
          "employee",
          "employee_name",
          "from_date",
          "to_date",
          "reason",
          "docstatus",
          "modified",
        ]),
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      if (filters.length) {
        params.filters = JSON.stringify(filters);
      }

      if (debouncedSearch) {
        params.or_filters = JSON.stringify([
          ["employee", "like", `%${debouncedSearch}%`],
          ["employee_name", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Attendance Request", params),
        get("method/frappe.client.get_count", {
          doctype: "Attendance Request",
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
    const status = getStatus(row.docstatus);

    return {
      title: row.employee_name || row.employee,
      subtitle: `${row.from_date}${
        row.to_date && row.to_date !== row.from_date ? " → " + row.to_date : ""
      }`,
      meta: row.reason || "",
      status: status.color,
      statusLabel: status.label,
      raw: row,
    };
  });

  /* ================= UI ================= */
  return (
    <>
      {/* FILTER MODAL */}
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
        emptyState="No attendance requests found"
      >
        {/* ACTIVE FILTERS */}
        {Object.keys(selectedFilters).length > 0 && (
          <div className="px-2 small text-muted mb-2">
            Filters:{" "}
            {Object.entries(selectedFilters)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")}
          </div>
        )}

        {/* LIST */}
        <div className="list-container">
          {listData.map((item, i) => (
            <ListRow
              key={i}
              item={item}
              onClick={() => navigate(item.raw.name)}
            />
          ))}
        </div>
      </ListLayout>
    </>
  );
}
