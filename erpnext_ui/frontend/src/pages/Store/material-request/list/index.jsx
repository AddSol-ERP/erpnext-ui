import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";

import ActionBar from "../../../../components/ActionBar";
import Pagination from "../../../../components/Pagination";
import ListLayout from "../../../../components/ListLayout";
import { ListRow } from "../../../../components/List/ListRow";
import DataTable from "../../../../components/List/DataTable";
import { StatusBadge } from "../../../../components/List/StatusBadge";
import useListPagination from "../../../../hooks/useListPagination";
import { get } from "../../../../services/api";
import { listFilterHandlers } from "../../../../lib/filterChips";

/* ================= STATUS ================= */
const getStatus = (row) => {
  if (row.docstatus === 0) return { label: "Draft", color: "open" };

  if (row.docstatus === 1) {
    if (row.status === "Stopped") return { label: "Stopped", color: "danger" };
    return { label: row.status || "Submitted", color: "complete" };
  }

  return { label: "Cancelled", color: "danger" };
};

const STATUS_LABEL_KEYS = {
  Draft: "store.status.draft",
  Stopped: "store.status.stopped",
  Submitted: "store.status.submitted",
  Cancelled: "store.status.cancelled",
};

const TYPE_LABEL_KEYS = {
  purchase: "store.types.purchase",
  transfer: "store.types.transfer",
  "material-issue": "store.types.materialIssue",
  "material-receipt": "store.types.materialReceipt",
  "customer-provided": "store.types.customerProvided",
};

export default function MaterialRequestList() {
  const { type } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
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
  } = useListPagination({ pageSize: 10 });

  const [selectedFilters, setSelectedFilters] = useState({});

  const filterUi = useMemo(
    () => listFilterHandlers(setSelectedFilters, resetPage),
    [resetPage],
  );

  const formattedType = (type || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const typeKey =
    TYPE_LABEL_KEYS[formattedType.toLowerCase().replace(/\s+/g, "-")];
  const typeLabel = typeKey ? t(typeKey) : formattedType;

  const filterConfig = {
    filters: [
      {
        label: t("common.status"),
        field: "status",
        type: "select",
        options: ["Draft", "Submitted", "Stopped", "Cancelled"],
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
      title: t("store.mr.listTitle", { type: typeLabel }),
      subtitle: t("store.mr.listSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.mr.title"), path: "/store/material-request" },
        { label: typeLabel },
      ],
      actions: [
        {
          label: t("common.new"),
          onClick: () => navigate(`/store/material-request/type/${type}/new`),
        },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const handleSearch = useCallback(
    (q) => {
      setDebouncedSearch(q);
      resetPage();
    },
    [resetPage],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = [
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
        limit_start,
        limit_page_length,
      };

      const orFilters = debouncedSearch
        ? [["name", "like", `%${debouncedSearch}%`]]
        : [];
      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get("resource/Material Request", params),
        get("method/frappe.client.get_count", {
          doctype: "Material Request",
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
    type,
    debouncedSearch,
    selectedFilters,
    limit_start,
    limit_page_length,
    setTotal,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const listData = useMemo(
    () =>
      data.map((row) => {
        const status = getStatus(row);
        const statusKey = STATUS_LABEL_KEYS[status.label];
        return {
          title: row.name,
          subtitle: `${row.company || ""} • ${row.transaction_date}`,
          meta: row.modified,
          statusColor: status.color,
          statusLabel: statusKey ? t(statusKey) : status.label,
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
        id: "status",
        header: t("common.status"),
        cell: (row) => (
          <StatusBadge tone={row.statusColor}>{row.statusLabel}</StatusBadge>
        ),
      },
      {
        id: "meta",
        header: t("common.modified"),
        hideBelow: "lg",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{row.meta}</span>
        ),
      },
    ],
    [t],
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
          selectedFilters={selectedFilters}
          {...filterUi}
        />
      }
      cards={
        <div className="card-stack flex flex-col gap-2">
          {listData.map((item, i) => (
            <ListRow
              key={i}
              item={item}
              index={limit_start + i + 1}
              onClick={(doc) => navigate(`${doc.name}`)}
            />
          ))}
        </div>
      }
      table={
        <DataTable
          columns={columns}
          data={listData}
          rowKey={(row) => row.raw?.name}
          onRowClick={(row) => navigate(row.raw.name)}
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
      emptyTitle={t("store.mr.empty")}
    />
  );
}
