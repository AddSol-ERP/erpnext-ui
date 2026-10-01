import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import { useNavigate } from "react-router-dom";
import { get } from "../../../services/api";
import ListLayout from "../../../components/ListLayout";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import { ListRow } from "../../../components/List/ListRow";
import DataTable from "../../../components/List/DataTable";
import { StatusBadge } from "../../../components/List/StatusBadge";
import useListPagination from "../../../hooks/useListPagination";
import { listFilterHandlers } from "../../../lib/filterChips";

const getStatus = (row, t) => {
  if (row.status === "Accepted")
    return { label: t("quality.statusPass"), color: "complete" };
  if (row.status === "Rejected")
    return { label: t("quality.statusFail"), color: "danger" };
  return { label: t("quality.statusDraft"), color: "open" };
};

const getTypeLabel = (type, t) => {
  if (type === "Incoming") return t("quality.typeIncoming");
  if (type === "In Process") return t("quality.typeInProcess");
  if (type === "Outgoing") return t("quality.typeOutgoing");
  return type || "-";
};

export default function InspectionList() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        label: t("quality.result"),
        field: "status",
        type: "select",
        options: ["PASS", "FAIL"],
      },
      {
        label: t("quality.template"),
        field: "quality_inspection_template",
        type: "link",
        doctype: "Quality Inspection Template",
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
        limit_start,
        limit_page_length,
      };

      const orFilters = debouncedSearch
        ? [
            ["name", "like", `%${debouncedSearch}%`],
            ["quality_inspection_template", "like", `%${debouncedSearch}%`],
          ]
        : [];
      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get("resource/Quality Inspection", params),
        get("method/frappe.client.get_count", {
          doctype: "Quality Inspection",
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
      title: t("quality.inspections"),
      subtitle: t("quality.inspectionsSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.inspections") },
      ],
      actions: [
        {
          label: t("quality.newInspection"),
          variant: "btn-primary",
          onClick: () => navigate("/quality/inspection/new"),
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
          subtitle: `${row.item_code || "-"} · ${getTypeLabel(row.inspection_type, t)}`,
          meta: `${row.reference_name || "-"} · ${row.report_date || "-"}`,
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
        header: t("common.date"),
        hideBelow: "md",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{row.meta}</span>
        ),
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
              onClick={() => navigate(`/quality/inspection/${item.raw.name}`)}
            />
          ))}
        </div>
      }
      table={
        <DataTable
          columns={columns}
          data={listData}
          rowKey={(row) => row.raw?.name}
          onRowClick={(row) => navigate(`/quality/inspection/${row.raw.name}`)}
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
      emptyTitle={t("quality.emptyInspections")}
    />
  );
}
