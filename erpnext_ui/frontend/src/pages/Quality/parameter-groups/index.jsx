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
import {
  PARAMETER_GROUP_DOCTYPE,
  groupNameOf,
} from "../../../lib/qualityParameterGroup";

/**
 * `Quality Inspection Parameter Group` — the master behind
 * `Quality Inspection Parameter.parameter_group`.
 *
 * The SPA could only PICK a group before this screen existed: the parameter
 * form's `LinkField` searched the doctype, but there was nowhere to create,
 * rename or delete one. A group is therefore something a user could reference
 * but never own, and a typo in a group name was unfixable without leaving the
 * SPA for the ERPNext desk.
 *
 * The doctype has exactly one field, `group_name`, and it is the autoname
 * field -- so `name === group_name`. See `lib/qualityParameterGroup.js` for
 * why that makes the name un-editable but renameable.
 */

/** Frappe hands back "2026-10-21 19:45:12.345678"; show it as a local date. */
function formatModified(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ParameterGroupList() {
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
        fields: JSON.stringify(["name", "group_name", "modified"]),
        order_by: "modified desc",
        limit_start,
        limit_page_length,
      };

      // `name` and `group_name` are the same string, but a record created
      // before the name was synced could differ, so both are searched.
      const orFilters = debouncedSearch
        ? [
            ["group_name", "like", `%${debouncedSearch}%`],
            ["name", "like", `%${debouncedSearch}%`],
          ]
        : [];
      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get(`resource/${PARAMETER_GROUP_DOCTYPE}`, params),
        get("method/frappe.client.get_count", {
          doctype: PARAMETER_GROUP_DOCTYPE,
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
  }, [debouncedSearch, limit_start, limit_page_length, setTotal]);

  useEffect(() => {
    setHeader({
      title: t("quality.parameterGroups"),
      subtitle: t("quality.parameterGroupsSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.parameterGroups") },
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
        title: groupNameOf(row),
        subtitle: formatModified(row.modified),
        raw: row,
      })),
    [data],
  );

  const columns = useMemo(
    () => [
      {
        id: "title",
        header: t("common.name"),
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.title}</div>
            {row.subtitle ? (
              <div className="truncate text-xs text-muted-foreground">
                {row.subtitle}
              </div>
            ) : null}
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
        <ActionBar onSearch={handleSearch} resultCount={totalItems} />
      }
      cards={
        <div className="card-stack flex flex-col gap-2.5">
          {listData.map((item, i) => (
            <ListRow
              key={i}
              item={item}
              index={limit_start + i + 1}
              onClick={() => navigate(encodeURIComponent(item.raw.name))}
            />
          ))}
        </div>
      }
      table={
        <DataTable
          columns={columns}
          data={listData}
          rowKey={(row) => row.raw?.name}
          onRowClick={(row) => navigate(encodeURIComponent(row.raw.name))}
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
      emptyTitle={t("quality.emptyParameterGroups")}
    />
  );
}
