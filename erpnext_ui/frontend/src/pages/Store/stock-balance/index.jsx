import { useEffect, useState } from "react";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";

import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import FilterModal from "../../../components/FilterModal";
import ListLayout from "../../../components/ListLayout";

const PAGE_SIZE = 20;

/* ================= FILTER ================= */
const filterConfig = {
  filters: [
    {
      label: "Item",
      field: "item_code",
      type: "link",
      doctype: "Item",
    },
    {
      label: "Warehouse",
      field: "warehouse",
      type: "link",
      doctype: "Warehouse",
    },
    {
      label: "Company",
      field: "company",
      type: "link",
      doctype: "Company",
    },
  ],
};

export default function StockBalance() {
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);
  const [uomMap, setUomMap] = useState({});

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({});

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: "📦 Stock Balance",
      subtitle: "Real-time inventory status",
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Store", path: "/store" },
        { label: "Stock Balance" },
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

  /* ================= LOAD UOM ================= */
  const loadUOM = async (items) => {
    try {
      if (!items.length) return;

      const res = await get("resource/Item", {
        fields: JSON.stringify(["name", "stock_uom"]),
        filters: JSON.stringify([["name", "in", items]]),
        limit_page_length: items.length,
      });

      const map = {};
      (res.data || []).forEach((i) => {
        map[i.name] = i.stock_uom;
      });

      setUomMap(map);
    } catch (e) {
      console.error("UOM load failed", e);
    }
  };

  /* ================= LOAD DATA ================= */
  const loadData = async () => {
    try {
      let apiFilters = [["actual_qty", "!=", 0]];

      Object.entries(filters).forEach(([k, v]) => {
        if (v) apiFilters.push([k, "=", v]);
      });

      const params = {
        fields: JSON.stringify([
          "item_code",
          "warehouse",
          "actual_qty",
          "valuation_rate",
        ]),
        filters: JSON.stringify(apiFilters),
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      if (debouncedSearch) {
        params.or_filters = JSON.stringify([
          ["item_code", "like", `%${debouncedSearch}%`],
          ["warehouse", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Bin", params),
        get("method/frappe.client.get_count", {
          doctype: "Bin",
          filters: JSON.stringify(apiFilters),
        }),
      ]);

      const list = listRes.data || [];
      setData(list);

      setTotalPages(Math.ceil((countRes.message || 0) / PAGE_SIZE));

      /* 🔥 LOAD UOM */
      const items = [...new Set(list.map((d) => d.item_code))];
      loadUOM(items);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, debouncedSearch, filters]);

  /* ================= UI ================= */
  return (
    <>
      <FilterModal
        show={showFilter}
        onClose={() => setShowFilter(false)}
        config={filterConfig}
        initialFilters={filters}
        onApply={(f) => {
          setFilters(f);
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
        isEmpty={data.length === 0}
        emptyState="No stock available"
      >
        <div className="list-container">
          {data.map((row, i) => {
            const qty = row.actual_qty || 0;
            const value = qty * (row.valuation_rate || 0);
            const uom = uomMap[row.item_code] || "";

            const statusClass =
              qty <= 0
                ? "status-danger"
                : qty < 10
                  ? "status-pending"
                  : "status-complete";

            return (
              <div key={i} className="list-row">
                {/* LEFT */}
                <div className="list-col main">
                  <div className="list-title">{row.item_code}</div>
                  <div className="list-sub text-muted">{row.warehouse}</div>
                </div>

                {/* QTY + UOM */}
                <div className="list-col">
                  <span className={`badge ${statusClass}`}>
                    {qty} {uom}
                  </span>
                </div>

                {/* VALUE */}
                <div className="list-col actions">
                  <div className="text-end">
                    <div className="list-title">₹ {value.toLocaleString()}</div>
                    <div className="list-sub text-muted">Value</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ListLayout>
    </>
  );
}
