import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

/* ================= STATUS ================= */
const getStatus = (row) => {
  if (row.status === "Approved")
    return { key: "requests.status.approved", color: "complete" };
  if (row.status === "Rejected")
    return { key: "requests.status.rejected", color: "danger" };
  if (row.status === "Submitted")
    return { key: "requests.status.submitted", color: "pending" };
  if (row.status === "Paid") return { key: "requests.status.paid", color: "info" };

  return { key: "requests.status.draft", color: "open" };
};

/* ================= MAIN ================= */
export default function ExpenseClaimList() {
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

  const filterConfig = {
    filters: [
      {
        label: t("common.status"),
        field: "status",
        type: "select",
        options: [
          { value: "Draft", label: t("requests.status.draft") },
          { value: "Submitted", label: t("requests.status.submitted") },
          { value: "Approved", label: t("requests.status.approved") },
          { value: "Rejected", label: t("requests.status.rejected") },
          { value: "Paid", label: t("requests.status.paid") },
        ],
      },
      {
        label: t("requests.filters.employee"),
        field: "employee",
        type: "link",
        doctype: "Employee",
      },
    ],
  };

  useEffect(() => {
    setHeader({
      title: t("requests.header.expenseListTitle"),
      subtitle: t("requests.header.expenseListSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.requests"), path: "/requests" },
        { label: t("requests.header.expenseListTitle") },
      ],
      actions: [
        {
          label: t("requests.list.create"),
          variant: "btn-primary",
          onClick: () => navigate("new"),
        },
      ],
    });

    return () => setHeader({});
  }, [navigate, setHeader, t]);

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
      const filters = [["docstatus", "!=", 2]];

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
        limit_start,
        limit_page_length,
      };

      const orFilters = debouncedSearch
        ? [
            ["name", "like", `%${debouncedSearch}%`],
            ["employee_name", "like", `%${debouncedSearch}%`],
          ]
        : [];

      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get("resource/Expense Claim", params),
        get("method/frappe.client.get_count", {
          doctype: "Expense Claim",
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
  }, [debouncedSearch, selectedFilters, limit_start, limit_page_length, setTotal]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const listData = useMemo(
    () =>
      data.map((row) => {
        const status = getStatus(row);
        return {
          title: row.employee_name || row.employee,
          subtitle: `₹ ${row.total_claimed_amount} • ${row.posting_date}`,
          meta: row.modified,
          statusColor: status.color,
          statusLabel: t(status.key),
          raw: row,
        };
      }),
    [data, t],
  );

  const columns = useMemo(
    () => [
      {
        id: "title",
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
        id: "amount",
        header: t("common.amount"),
        cellClassName: "text-end tabular-nums",
        cell: (row) => row.raw?.total_claimed_amount ?? "—",
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
              key={item.raw?.name ?? i}
              item={item}
              index={limit_start + i + 1}
              onClick={(doc) => navigate(doc.name)}
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
      emptyTitle={t("requests.list.emptyExpense")}
    />
  );
}
