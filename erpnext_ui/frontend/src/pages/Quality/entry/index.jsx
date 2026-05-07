import { useEffect, useState } from "react";
import { useHeader } from "../../../context/HeaderContext";
import { useNavigate } from "react-router-dom";
import { get } from "../../../services/api";
import FilterModal from "../../../components/FilterModal";
import ListLayout from "../../../components/ListLayout";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";

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
const getStatus = (row) => {
  if (row.status === "Accepted") return { label: "PASS", color: "complete" };

  if (row.status === "Rejected") return { label: "FAIL", color: "danger" };

  return { label: "Draft", color: "open" };
};

/* ================= FILTER ================= */
const filterConfig = {
  filters: [
    {
      label: "Result",
      field: "status",
      type: "select",
      options: ["PASS", "FAIL"],
    },
    {
      label: "Template",
      field: "quality_inspection_template",
      type: "link",
      doctype: "Quality Inspection Template",
    },
  ],
};

/* ================= MAIN ================= */
export default function InspectionList() {
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
      title: "Inspections",
      subtitle: "Monitor and manage quality inspection records",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Quality", path: "/quality" },
        { label: "Inspections" },
      ],

      actions: [
        {
          label: "New Inspection",
          variant: "btn-primary",
          onClick: () => navigate("/quality/inspection/new"),
        },
      ],
    });

    return () => setHeader({});
  }, []);

  /* SEARCH (debounce) */
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
          "quality_inspection_template",
          "item_code",
          "reference_name",
          "status",
          "inspection_type",
          "report_date",
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
          ["quality_inspection_template", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Quality Inspection", params),
        get("method/frappe.client.get_count", {
          doctype: "Quality Inspection",
          filters: JSON.stringify(filters),
          ...(debouncedSearch && {
            or_filters: JSON.stringify([
              ["name", "like", `%${debouncedSearch}%`],
              ["quality_inspection_template", "like", `%${debouncedSearch}%`],
            ]),
          }),
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
      subtitle: `${row.item_code || "-"} · ${row.inspection_type}`,
      meta: `${row.reference_name || "-"} · ${row.report_date || "-"}`,
      status: status.color,
      statusLabel: status.label,
      raw: row,
    };
  });

  /* UI */
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
          totalPages > 1 ? (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          ) : null
        }
        isEmpty={listData.length === 0}
        emptyState="No inspections found"
      >
        {listData.map((item, i) => (
          <ListRow
            key={i}
            item={item}
            onClick={() => navigate(`/quality/inspection/${item.raw.name}`)}
          />
        ))}
      </ListLayout>
    </>
  );
}
