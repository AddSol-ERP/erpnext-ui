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

  if (row.status === "Submitted")
    return { label: "Submitted", color: "pending" };

  if (row.status === "Paid") return { label: "Paid", color: "dark" };

  return { label: "Draft", color: "open" };
};

/* ================= FILTER ================= */
const filterConfig = {
  filters: [
    {
      label: "Status",
      field: "status",
      type: "select",
      options: ["Draft", "Submitted", "Approved", "Rejected", "Paid"],
    },
    {
      label: "Employee",
      field: "employee",
      type: "link",
      doctype: "Employee",
    },
  ],
};

export default function ExpenseClaimList() {
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
      title: "Expense Claims",
      subtitle: "Track and manage employee expense submissions",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Requests", path: "/requests" },
        { label: "Expense Claims" },
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
      let filters = [["docstatus", "!=", 2]];

      Object.entries(selectedFilters).forEach(([k, v]) => {
        if (v) filters.push([k, "=", v]);
      });

      const params = {
        fields: JSON.stringify([
          "name",
          "employee",
          "employee_name",
          "posting_date",
          "total_claimed_amount",
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
          ["employee_name", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Expense Claim", params),
        get("method/frappe.client.get_count", {
          doctype: "Expense Claim",
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
      title: row.employee_name || row.employee,
      subtitle: `₹ ${row.total_claimed_amount} • ${row.posting_date}`,
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
        emptyState="No expense claims found"
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
