import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";

import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import ListLayout from "../../../components/ListLayout";
import DataTable from "../../../components/List/DataTable";
import { StatusBadge } from "../../../components/List/StatusBadge";
import { ListRow } from "../../../components/List/ListRow";
import useListPagination from "../../../hooks/useListPagination";
import { listFilterHandlers } from "../../../lib/filterChips";
import { cn } from "cn";

const qtyTone = (qty) =>
  qty <= 0 ? "danger" : qty < 10 ? "warning" : "complete";

export default function StockBalance() {
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [uomMap, setUomMap] = useState({});
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    page,
    setPage,
    totalItems,
    setTotal,
    totalPages,
    resetPage,
    limit_start,
    limit_page_length,
  } = useListPagination({ pageSize: 20 });

  const [filters, setFilters] = useState({});

  const filterUi = useMemo(
    () => listFilterHandlers(setFilters, resetPage),
    [resetPage],
  );

  const filterConfig = {
    filters: [
      {
        label: t("store.filters.item"),
        field: "item_code",
        type: "link",
        doctype: "Item",
      },
      {
        label: t("store.filters.warehouse"),
        field: "warehouse",
        type: "link",
        doctype: "Warehouse",
      },
      {
        label: t("store.filters.company"),
        field: "company",
        type: "link",
        doctype: "Company",
      },
    ],
  };

  useEffect(() => {
    setHeader({
      title: t("store.balance.title"),
      subtitle: t("store.balance.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.balance.title") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(
    (q) => {
      setDebouncedSearch(q);
      resetPage();
    },
    [resetPage],
  );

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiFilters = [["actual_qty", "!=", 0]];

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
        limit_start,
        limit_page_length,
      };

      const orFilters = debouncedSearch
        ? [
            ["item_code", "like", `%${debouncedSearch}%`],
            ["warehouse", "like", `%${debouncedSearch}%`],
          ]
        : [];
      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get("resource/Bin", params),
        get("method/frappe.client.get_count", {
          doctype: "Bin",
          filters: JSON.stringify(apiFilters),
          ...(orFilters.length && { or_filters: JSON.stringify(orFilters) }),
        }),
      ]);

      const list = listRes.data || [];
      setData(list);
      setTotal(countRes.message || 0);

      const items = [...new Set(list.map((d) => d.item_code))];
      loadUOM(items);
    } catch (e) {
      console.error(e);
      setError(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    filters,
    limit_start,
    limit_page_length,
    setTotal,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const columns = useMemo(
    () => [
      {
        id: "item",
        header: t("common.name"),
        cell: (row) => {
          const qty = row.actual_qty || 0;
          const uom = uomMap[row.item_code] || "";
          return (
            <div className="min-w-0">
              <div className="truncate font-medium">{row.item_code}</div>
              <div className="truncate text-xs text-muted-foreground">
                {row.warehouse}
              </div>
              <span
                className={cn(
                  "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                  qtyTone(qty) === "danger"
                    ? "bg-destructive/15 text-destructive ring-destructive/30"
                    : qtyTone(qty) === "warning"
                      ? "bg-orange-500/15 text-orange-600 ring-orange-500/30 dark:text-orange-400"
                      : "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
                )}
              >
                {qty} {uom}
              </span>
            </div>
          );
        },
      },
      {
        id: "value",
        header: t("store.balance.value"),
        cellClassName: "text-end tabular-nums",
        cell: (row) => {
          const value =
            (row.actual_qty || 0) * (row.valuation_rate || 0);
          return `₹ ${value.toLocaleString()}`;
        },
      },
    ],
    [t, uomMap],
  );

  return (
    <ListLayout
      contentMode="auto"
      loading={loading}
      error={error}
      onRetry={loadData}
      actionBar={
        <ActionBar
          onSearch={handleSearch}
          resultCount={totalItems}
          filterConfig={filterConfig}
          selectedFilters={filters}
          {...filterUi}
        />
      }
      cards={
          <div className="card-stack flex flex-col gap-2">
            {data.map((row, i) => {
              const qty = row.actual_qty || 0;
              const value = qty * (row.valuation_rate || 0);
              const uom = uomMap[row.item_code] || "";

              return (
                <ListRow
                  key={`${row.item_code}-${row.warehouse}`}
                  index={limit_start + i + 1}
                  item={{
                    title: row.item_code,
                    subtitle: row.warehouse,
                    meta: `₹ ${value.toLocaleString()}`,
                    statusLabel: `${qty} ${uom}`.trim(),
                    statusColor: qtyTone(qty),
                    raw: row,
                  }}
                />
              );
            })}
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={data}
            rowKey={(row) => `${row.item_code}-${row.warehouse}`}
            loading={loading}
            rowOffset={limit_start}
          />
        }
        pagination={
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={totalItems}
            pageSize={limit_page_length}
            disabled={loading}
          />
        }
        isEmpty={!loading && data.length === 0}
        emptyTitle={t("store.balance.empty")}
    />
  );
}
