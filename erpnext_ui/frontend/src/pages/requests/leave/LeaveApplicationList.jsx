import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import FilterModal from "../../../components/FilterModal";
import ListLayout from "../../../components/ListLayout";
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

      <div className="list-col meta">{item.meta}</div>

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
const getStatus = (row) => {
  if (row.status === "Approved")
    return { label: "Approved", color: "complete" };
  if (row.status === "Rejected") return { label: "Rejected", color: "danger" };
  if (row.status === "Open") return { label: "Pending", color: "pending" };

  return { label: "Draft", color: "open" };
};

/* ================= FILTER ================= */
const filterConfig = {
  filters: [
    {
      label: "Leave Type",
      field: "leave_type",
      type: "link",
      doctype: "Leave Type",
    },
    {
      label: "Status",
      field: "status",
      type: "select",
      options: ["Open", "Approved", "Rejected"],
    },
  ],
};

export default function LeaveApplicationList() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({});

  /* HEADER */
  useEffect(() => {
    setHeader({
      title: "Leave Applications",
      subtitle: "Track and manage employee leaves",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Requests", path: "/requests" },
        { label: "Leave Applications" },
      ],

      actions: [
        {
          label: "+ New",
          onClick: () => navigate("/requests/leave/new"),
        },
      ],
    });

    return () => setHeader({});
  }, []);

  /* SEARCH */
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
          "employee",
          "employee_name",
          "leave_type",
          "from_date",
          "to_date",
          "status",
          "docstatus",
          "modified",
        ]),
        filters: JSON.stringify(filters),
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      if (debouncedSearch) {
        params.or_filters = JSON.stringify([
          ["employee", "like", `%${debouncedSearch}%`],
          ["employee_name", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Leave Application", params),
        get("method/frappe.client.get_count", {
          doctype: "Leave Application",
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

  /* MAP */
  const listData = data.map((row) => {
    const status = getStatus(row);

    return {
      title: row.employee_name || row.employee,
      subtitle: `${row.leave_type} • ${row.from_date}${
        row.to_date !== row.from_date ? " → " + row.to_date : ""
      }`,
      meta: row.modified,
      status: status.color,
      statusLabel: status.label,
      raw: row,
    };
  });

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
        emptyState="No leave applications found"
      >
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
