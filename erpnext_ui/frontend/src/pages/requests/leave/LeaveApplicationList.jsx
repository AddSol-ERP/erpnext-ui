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
  if (row.status === "Open")
    return { key: "requests.status.pending", color: "pending" };

  return { key: "requests.status.draft", color: "open" };
};

/* ================= MAIN ================= */
export default function LeaveApplicationList() {
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

  /* ================= FILTER CONFIG ================= */
  const filterConfig = {
    filters: [
      {
        label: t("requests.filters.leaveType"),
        field: "leave_type",
        type: "link",
        doctype: "Leave Type",
      },
      {
        label: t("common.status"),
        field: "status",
        type: "select",
        options: [
          { value: "Open", label: t("requests.status.pending") },
          { value: "Approved", label: t("requests.status.approved") },
          { value: "Rejected", label: t("requests.status.rejected") },
        ],
      },
    ],
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: t("requests.header.leaveListTitle"),
      subtitle: t("requests.header.leaveListSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.requests"), path: "/requests" },
        { label: t("requests.header.leaveListTitle") },
      ],
      actions: [
        {
          label: t("requests.list.create"),
          onClick: () => navigate("/requests/leave/new"),
        },
      ],
    });

    return () => setHeader({});
  }, [navigate, setHeader, t]);

  /* ================= SEARCH (ActionBar debounce) ================= */
  const handleSearch = useCallback(
    (q) => {
      setDebouncedSearch(q);
      resetPage();
    },
    [resetPage],
  );

  /* ================= LOAD ================= */
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
          "leave_type",
          "from_date",
          "to_date",
          "status",
          "docstatus",
          "modified",
        ]),
        filters: JSON.stringify(filters),
        order_by: "modified desc",
        limit_start,
        limit_page_length,
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
          ...(debouncedSearch && {
            or_filters: JSON.stringify([
              ["employee", "like", `%${debouncedSearch}%`],
              ["employee_name", "like", `%${debouncedSearch}%`],
            ]),
          }),
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
    // loadData only setStates after awaited API responses; the compiler
    // rule conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  /* ================= MAP + COLUMNS ================= */
  const listData = useMemo(
    () =>
      data.map((row) => {
        const status = getStatus(row);
        return {
          title: row.employee_name || row.employee,
          subtitle: `${row.leave_type} • ${row.from_date}${
            row.to_date !== row.from_date ? " → " + row.to_date : ""
          }`,
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

  /* ================= UI ================= */
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
      emptyTitle={t("requests.list.emptyLeave")}
    />
  );
}
