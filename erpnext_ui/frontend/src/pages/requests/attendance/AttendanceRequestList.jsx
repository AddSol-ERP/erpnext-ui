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
const getStatus = (docstatus) => {
  if (docstatus === 1)
    return { key: "requests.status.approved", color: "complete" };
  if (docstatus === 2)
    return { key: "requests.status.rejected", color: "danger" };
  return { key: "requests.status.pending", color: "pending" };
};

/* ================= MAIN ================= */
export default function AttendanceRequestList() {
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
        field: "docstatus",
        type: "select",
        options: [
          { value: "Pending", label: t("requests.status.pending") },
          { value: "Approved", label: t("requests.status.approved") },
          { value: "Rejected", label: t("requests.status.rejected") },
        ],
      },
      {
        label: t("requests.filters.employee"),
        field: "employee",
        type: "link",
        doctype: "Employee",
      },
      {
        label: t("requests.filters.fromDate"),
        field: "from_date",
        type: "date",
      },
      {
        label: t("requests.filters.toDate"),
        field: "to_date",
        type: "date",
      },
    ],
  };

  useEffect(() => {
    setHeader({
      title: t("requests.header.attendanceListTitle"),
      subtitle: t("requests.header.attendanceListSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.requests"), path: "/requests" },
        { label: t("requests.header.attendanceListTitle") },
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
      const filters = [];

      if (selectedFilters.docstatus) {
        const map = { Pending: 0, Approved: 1, Rejected: 2 };
        filters.push(["docstatus", "=", map[selectedFilters.docstatus]]);
      }
      if (selectedFilters.employee) {
        filters.push(["employee", "=", selectedFilters.employee]);
      }
      if (selectedFilters.from_date) {
        filters.push(["from_date", ">=", selectedFilters.from_date]);
      }
      if (selectedFilters.to_date) {
        filters.push(["to_date", "<=", selectedFilters.to_date]);
      }

      const params = {
        fields: JSON.stringify([
          "name",
          "employee",
          "employee_name",
          "from_date",
          "to_date",
          "reason",
          "docstatus",
          "modified",
        ]),
        order_by: "modified desc",
        limit_start,
        limit_page_length,
      };

      if (filters.length) params.filters = JSON.stringify(filters);

      const orFilters = debouncedSearch
        ? [
            ["employee", "like", `%${debouncedSearch}%`],
            ["employee_name", "like", `%${debouncedSearch}%`],
          ]
        : [];
      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get("resource/Attendance Request", params),
        get("method/frappe.client.get_count", {
          doctype: "Attendance Request",
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
        const status = getStatus(row.docstatus);
        return {
          title: row.employee_name || row.employee,
          subtitle: `${row.from_date}${
            row.to_date && row.to_date !== row.from_date
              ? " → " + row.to_date
              : ""
          }`,
          meta: row.reason || "",
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
        id: "meta",
        header: t("requests.list.reason") || t("common.status"),
        hideBelow: "md",
        cell: (row) => (
          <span className="truncate text-xs text-muted-foreground">
            {row.meta}
          </span>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row) => (
          <StatusBadge tone={row.statusColor}>{row.statusLabel}</StatusBadge>
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
      emptyTitle={t("requests.list.emptyAttendance")}
    />
  );
}
