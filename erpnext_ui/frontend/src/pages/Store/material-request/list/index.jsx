import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";

import ActionBar from "../../../../components/ActionBar";
import Pagination from "../../../../components/Pagination";
import ListLayout from "../../../../components/ListLayout";
import { ListRow } from "../../../../components/List/ListRow";
import DataTable from "../../../../components/List/DataTable";
import { StatusBadge } from "../../../../components/List/StatusBadge";
import { getMethod } from "../../../../services/api";

/**
 * The single browse surface for requests — every purpose, split by whether the
 * request carries a project.
 *
 * There is one of these on purpose. Purpose cards on the Store dashboard open
 * the form directly, so a per-purpose list would have had no way in; the
 * endpoint still accepts a `purpose` argument for when a scoped view is wanted.
 *
 * The Project / General split is computed server-side by
 * `erpnext_ui.api.get_indent_list`, not here. That is not a stylistic choice:
 * Frappe's `get_filter` resolves `items.project` against the *parent* meta and
 * then appends the child table with no join, producing a cross join. An indent
 * with three items on one project comes back three times and paginates wrongly.
 */

const PAGE_SIZE = 10;

const SCOPES = ["all", "project", "general"];

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

export default function MaterialRequestList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [counts, setCounts] = useState({ project: 0, general: 0 });
  const [total, setTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const scope = SCOPES.includes(searchParams.get("scope")) ? searchParams.get("scope") : "all";

  const setScope = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams);
      params.set("scope", next);
      setSearchParams(params, { replace: true });
      setPage(1);
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    setHeader({
      title: t("store.mr.allTitle"),
      subtitle: t("store.mr.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.mr.allTitle") },
      ],
      // No "New" here. This list spans every purpose, so it has no single type
      // to create; raising a request is an action on the Store dashboard, which
      // is where the purpose is already chosen.
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback((q) => setDebouncedSearch(q), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const message = await getMethod("method/erpnext_ui.api.get_indent_list", {
        scope,
        search: debouncedSearch || undefined,
        start: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });

      setData(message.rows || []);
      setTotal(message.total || 0);
      setCounts(message.counts || { project: 0, general: 0 });
    } catch (e) {
      setError(e);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [scope, debouncedSearch, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const listData = useMemo(
    () =>
      data.map((row) => {
        const status = getStatus(row);
        const statusKey = STATUS_LABEL_KEYS[status.label];
        const projects = row.projects || [];
        return {
          title: row.name,
          subtitle: [
            row.company,
            // ERPNext labels this field "Required By". The old list showed only
            // transaction_date, so the one date a requester actually cares about
            // was not on screen at all.
            row.schedule_date || row.transaction_date,
            // Project names rather than a count: the full names are already
            // useful in the Projects column, and a pluralised count would need
            // _one/_other keys per language -- and Arabic has five plural
            // categories where English has two.
            projects.length ? projects.slice(0, 2).join(", ") : null,
          ]
            .filter(Boolean)
            .join(" • "),
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
        id: "projects",
        header: t("store.labels.project"),
        hideBelow: "lg",
        cell: (row) => {
          const projects = row.raw.projects || [];
          if (!projects.length) {
            return (
              <span className="text-xs text-muted-foreground">
                {t("store.scopes.general")}
              </span>
            );
          }
          return (
            <span className="truncate text-xs">{projects.join(", ")}</span>
          );
        },
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

  const openRequest = useCallback(
    (doc) => navigate(`/store/material-request/${doc.name}`),
    [navigate],
  );

  const scopeTabs = useMemo(() => {
    const items = [
      { id: "all", label: t("store.scopes.all"), count: null },
      { id: "project", label: t("store.scopes.project"), count: counts.project },
      { id: "general", label: t("store.scopes.general"), count: counts.general },
    ];

    // Matches PageToolbar's status-pill treatment so the strip does not read as
    // a different control from the status filters elsewhere in the app.
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 pb-2">
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScope(s.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              scope === s.id
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : "text-chrome-muted hover:bg-muted hover:text-chrome-foreground"
            }`}
          >
            {s.label}
            {s.count != null ? ` (${s.count})` : ""}
          </button>
        ))}
      </div>
    );
  }, [scope, counts, setScope, t]);

  return (
    <ListLayout
      contentMode="auto"
      loading={loading}
      error={error}
      onRetry={loadData}
      tabs={scopeTabs}
      actionBar={
        <ActionBar onSearch={handleSearch} resultCount={total} />
      }
      cards={
        <div className="card-stack flex flex-col gap-2">
          {listData.map((item, i) => (
            <ListRow
              key={item.raw.name}
              item={item}
              index={(page - 1) * PAGE_SIZE + i + 1}
              onClick={(doc) => openRequest(doc)}
            />
          ))}
        </div>
      }
      table={
        <DataTable
          columns={columns}
          data={listData}
          rowKey={(row) => row.raw?.name}
          onRowClick={(row) => openRequest(row.raw)}
          loading={loading}
          rowOffset={(page - 1) * PAGE_SIZE}
        />
      }
      pagination={
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={total}
          pageSize={PAGE_SIZE}
          disabled={loading}
        />
      }
      isEmpty={!loading && listData.length === 0}
      emptyTitle={t("store.mr.empty")}
    />
  );
}
