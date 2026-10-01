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
import JobCardPreviewModal from "./JobCardPreviewModal";

const getStatus = (row, t) => {
  if (row.status === "Completed")
    return { label: t("production.statusCompleted"), color: "complete" };
  if (row.status === "Work In Progress")
    return { label: t("production.statusInProgress"), color: "pending" };
  if (row.status === "Open") return { label: t("common.open"), color: "open" };
  return { label: row.status || t("production.statusUnknown"), color: "open" };
};

export default function JobCardsList() {
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [previewDoc, setPreviewDoc] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const [selectedFilters, setSelectedFilters] = useState({});

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
        options: ["Open", "Work In Progress", "Completed"],
      },
      {
        label: t("production.workOrder"),
        field: "work_order",
        type: "link",
        doctype: "Work Order",
      },
      {
        label: t("production.operation"),
        field: "operation",
        type: "link",
        doctype: "Operation",
      },
    ],
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = [
        ["docstatus", "!=", 2],
        ["status", "not in", ["Cancelled"]],
      ];

      Object.entries(selectedFilters).forEach(([k, v]) => {
        if (v) filters.push([k, "=", v]);
      });

      const params = {
        fields: JSON.stringify([
          "name",
          "work_order",
          "operation",
          "status",
          "for_quantity",
          "total_completed_qty",
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
            ["operation", "like", `%${debouncedSearch}%`],
            ["work_order", "like", `%${debouncedSearch}%`],
          ]
        : [];
      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get("resource/Job Card", params),
        get("method/frappe.client.get_count", {
          doctype: "Job Card",
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
      title: t("production.jobCards"),
      subtitle: t("production.jobCardsSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.production"), path: "/production" },
        { label: t("production.jobCards") },
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
          subtitle: t("production.jobSubtitle", {
            operation: row.operation || "-",
            work_order: row.work_order || "-",
          }),
          meta: `${row.total_completed_qty || 0} / ${row.for_quantity || 0}`,
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
      <JobCardPreviewModal
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
            onPrint={() => window.print()}
            {...filterUi}
          />
        }
        cards={
          <div className="card-stack flex flex-col gap-2.5">
            {listData.map((item, idx) => (
              <ListRow
                key={idx}
                item={item}
                index={limit_start + idx + 1}
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
        emptyTitle={t("production.emptyJobCards")}
      />
    </>
  );
}
