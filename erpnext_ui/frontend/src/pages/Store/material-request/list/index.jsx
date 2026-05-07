import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHeader } from "../../../../context/HeaderContext";

import ActionBar from "../../../../components/ActionBar";
import Pagination from "../../../../components/Pagination";
import FilterModal from "../../../../components/FilterModal";
import ListLayout from "../../../../components/ListLayout";

import { get } from "../../../../services/api";

const PAGE_SIZE = 10;

/* ================= STATUS ================= */
const getStatus = (row) => {
  if (row.docstatus === 0) return { label: "Draft", color: "open" };

  if (row.docstatus === 1) {
    if (row.status === "Stopped") return { label: "Stopped", color: "danger" };

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
      options: ["Draft", "Submitted", "Stopped", "Cancelled"],
    },
    {
      label: "Company",
      field: "company",
      type: "link",
      doctype: "Company",
    },
  ],
};

export default function MaterialRequestList() {
  const { type } = useParams();
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
    const formattedType = (type || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    setHeader({
      title: `${formattedType} Requests`,
      subtitle: "Track and manage requests",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Store", path: "/store" },
        { label: "Material Requests", path: "/store/material-request" },
        { label: formattedType },
      ],

      actions: [
        {
          label: "+ New",
          onClick: () => navigate(`/store/material-request/type/${type}/new`),
        },
      ],
    });

    return () => setHeader({});
  }, [type]);

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
      let filters = [
        ["material_request_type", "=", type],
        ["docstatus", "!=", 2],
      ];

      Object.entries(selectedFilters).forEach(([k, v]) => {
        if (v) filters.push([k, "=", v]);
      });

      const params = {
        fields: JSON.stringify([
          "name",
          "transaction_date",
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
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Material Request", params),
        get("method/frappe.client.get_count", {
          doctype: "Material Request",
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
  }, [page, debouncedSearch, selectedFilters, type]);

  /* ================= MAP ================= */
  const listData = data.map((row) => {
    const status = getStatus(row);

    return {
      title: row.name,
      subtitle: `${row.company || ""} • ${row.transaction_date}`,
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
        emptyState="No material requests found"
      >
        <div className="list-container">
          {listData.map((item, i) => (
            <div
              key={i}
              className="list-row"
              onClick={() => navigate(`${item.raw.name}`)}
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
