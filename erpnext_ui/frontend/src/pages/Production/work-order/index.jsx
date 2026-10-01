import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import ListLayout from "../../../components/ListLayout";
import { ListRow } from "../../../components/List/ListRow";
import DataTable from "../../../components/List/DataTable";
import { StatusBadge } from "../../../components/List/StatusBadge";
import useListPagination from "../../../hooks/useListPagination";
import { get } from "../../../services/api";
import { listFilterHandlers } from "../../../lib/filterChips";
import WorkOrderPreviewModal from "./WorkOrderPreviewModal";

const getStatus = (row, t) => {
  if (row.status === "Completed")
    return { label: t("production.statusCompleted"), color: "complete" };
  if (row.status === "In Process")
    return { label: t("production.statusInProgress"), color: "pending" };
  if (row.status === "Not Started")
    return { label: t("common.open"), color: "open" };

  return { label: row.status || t("production.statusUnknown"), color: "open" };
};

export default function WorkOrderList() {
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedFilters, setSelectedFilters] = useState({});

  const [previewDoc, setPreviewDoc] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const {
    page,
    setPage,
    totalItems,
    setTotal,
    totalPages,
    resetPage,
    limit_start,
    limit_page_length,
  } = useListPagination({ pageSize: 10 });

  const filterUi = useMemo(
    () => listFilterHandlers(setSelectedFilters, resetPage),
    [resetPage],
  );

  const filterConfig = {
    filters: [
      {
        label: t("common.status"),
        field: "status",
        type: "select",
        options: ["Not Started", "In Process", "Completed"],
      },
      {
        label: t("production.item"),
        field: "production_item",
        type: "link",
        doctype: "Item",
      },
    ],
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = [["docstatus", "!=", 2]];

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
        limit_start,
        limit_page_length,
      };

      const orFilters = debouncedSearch
        ? [
            ["name", "like", `%${debouncedSearch}%`],
            ["production_item", "like", `%${debouncedSearch}%`],
          ]
        : [];
      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get("resource/Work Order", params),
        get("method/frappe.client.get_count", {
          doctype: "Work Order",
          filters: JSON.stringify(filters),
          ...(orFilters.length && { or_filters: JSON.stringify(orFilters) }),
        }),
      ]);

      setData(listRes.data || []);
      setTotal(countRes.message || 0);
    } catch (e) {
      console.error(e);
      setError(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    selectedFilters,
    limit_start,
    limit_page_length,
    setTotal,
  ]);

  useEffect(() => {
    setHeader({
      title: t("production.workOrders"),
      subtitle: t("production.workOrdersSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.production"), path: "/production" },
        { label: t("production.workOrders") },
      ],
      actions: [
        {
          label: t("common.refresh"),
          variant: "btn-outline-primary",
          onClick: loadData,
        },
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const listData = useMemo(
    () =>
      data.map((row) => {
        const status = getStatus(row, t);
        return {
          title: row.name,
          subtitle: row.production_item,
          meta: `${row.produced_qty || 0} / ${row.qty || 0}`,
          status: status.color,
          statusLabel: status.label,
          raw: row,
        };
      }),
    [data, t],
  );

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: t("common.name"),
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.subtitle}
            </div>
          </div>
        ),
      },
      {
        id: "meta",
        header: t("common.total"),
        hideBelow: "md",
        cellClassName: "tabular-nums",
        cell: (row) => row.meta,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row) => (
          <StatusBadge tone={row.status}>{row.statusLabel}</StatusBadge>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <WorkOrderPreviewModal
        show={showPreview}
        onClose={() => setShowPreview(false)}
        doc={previewDoc}
        onSuccess={loadData}
      />

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
            selectedFilters={selectedFilters}
            {...filterUi}
          />
        }
        cards={
          <div className="card-stack flex flex-col gap-2.5">
            {listData.map((item, i) => (
              <ListRow
                key={i}
                item={item}
                index={limit_start + i + 1}
                onClick={(doc) => {
                  setPreviewDoc(doc);
                  setShowPreview(true);
                }}
              />
            ))}
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={listData}
            rowKey={(row) => row.raw?.name}
            onRowClick={(row) => {
              setPreviewDoc(row.raw);
              setShowPreview(true);
            }}
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
        isEmpty={!loading && listData.length === 0}
        emptyTitle={t("production.emptyWorkOrders")}
      />
    </>
  );
}
