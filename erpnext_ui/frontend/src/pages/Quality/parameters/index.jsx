import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import ListLayout from "../../../components/ListLayout";
import { ListRow } from "../../../components/List/ListRow";
import DataTable from "../../../components/List/DataTable";
import { get } from "../../../services/api";
import useListPagination from "../../../hooks/useListPagination";

export default function InspectionParameterList() {
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        fields: JSON.stringify([
          "name",
          "parameter",
          "parameter_group",
          "modified",
        ]),
        order_by: "modified desc",
        limit_start,
        limit_page_length,
      };

      if (debouncedSearch) {
        params.or_filters = JSON.stringify([
          ["name", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Quality Inspection Parameter", params),
        get("method/frappe.client.get_count", {
          doctype: "Quality Inspection Parameter",
          ...(debouncedSearch && {
            or_filters: JSON.stringify([
              ["name", "like", `%${debouncedSearch}%`],
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
  }, [debouncedSearch, limit_start, limit_page_length, setTotal]);

  useEffect(() => {
    setHeader({
      title: t("quality.inspectionParameters"),
      subtitle: t("quality.parametersSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.inspectionParameters") },
      ],
      actions: [
        {
          label: t("quality.create"),
          variant: "btn-primary",
          onClick: () => navigate("new"),
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
      data.map((row) => ({
        title: row.parameter,
        subtitle: row.parameter_group || t("quality.noGroup"),
        raw: row,
      })),
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
        />
      }
      cards={
        <div className="card-stack flex flex-col gap-2.5">
          {listData.map((item, i) => (
            <ListRow
              key={i}
              item={item}
              index={limit_start + i + 1}
              onClick={() => navigate(item.raw.name)}
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
      emptyTitle={t("quality.emptyParameters")}
    />
  );
}
