import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ListLayout from "../../../components/ListLayout";
import DataTable, { StatusBadge } from "../../../components/List/DataTable";
import Pagination from "../../../components/Pagination";
import ActionBar from "../../../components/ActionBar";
import { listFilterHandlers } from "../../../lib/filterChips";
import { fetchAvailablePlates } from "./api";

const PAGE_SIZE = 10;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * 2500 x 1250 x 10 -- only the dimensions the Item actually carries.
 *
 * A plate is often a thickness-only master (`build_plate_item_name` allows it),
 * so the labels are printed by which dimensions are present rather than always
 * in three slots: a plate with no length must not read "— x — x 10".
 */
function sizeLabel(row) {
  const length = num(row.length_mm);
  const width = num(row.width_mm);
  const thickness = num(row.thickness_mm);
  if (length && width) return `${length} x ${width}${thickness ? ` x ${thickness}` : ""}`;
  if (thickness) return `${thickness} mm`;
  return "—";
}

/**
 * Plates waiting to be cut.
 *
 * A click opens the cutting form with this plate already chosen, which is the
 * whole point of the tab: the plate is the one thing an operator already knows,
 * so it should never have to be picked a second time.
 */
export default function AvailablePlates({ tabs }) {
  // The hub passes its scope strip down rather than wrapping these panels:
  // ListLayout draws `tabs` as a strip inside its OWN card, so a panel that
  // rendered its own without it would lose the strip, and a hub that wrapped
  // them would produce two nested elevated cards.
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAvailablePlates({
        search,
        warehouse: filters.warehouse || "",
        limitStart: (page - 1) * PAGE_SIZE,
        pageLength: PAGE_SIZE,
      });
      setRows(res.plates);
      setTotal(res.total);
    } catch (e) {
      setError(e.message || t("common.failedToLoad", { name: t("store.plateOffcut.title") }));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, filters.warehouse, page, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // A warehouse is the one axis that genuinely splits this list: a shop with
  // several plate stores cannot tell at a glance which pile is in front of them,
  // and the endpoint already takes it as a filter.
  const filterConfig = useMemo(
    () => ({
      filters: [
        {
          label: t("store.plateOffcut.warehouse"),
          field: "warehouse",
          type: "link",
          doctype: "Warehouse",
        },
      ],
    }),
    [t],
  );

  const resetPage = useCallback(() => setPage(1), []);
  const filterUi = useMemo(
    () => listFilterHandlers(setFilters, resetPage),
    [resetPage],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = useMemo(
    () => [
      {
        id: "serial",
        header: t("store.plateOffcut.serial"),
        cell: (row) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.serial}</span>
            {!row.can_cut && (
              <span className="text-xs text-muted-foreground">
                {row.blocked_reason}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "item_code",
        header: t("store.plateOffcut.sourceItem"),
        cell: (row) => (
          <span className="flex flex-col">
            <span className="truncate text-sm">{row.item_code}</span>
            {row.item_group && (
              <span className="truncate text-xs text-muted-foreground">
                {row.item_group}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "size",
        header: t("store.plateOffcut.plateSize"),
        hideBelow: "md",
        cell: (row) => <span className="text-sm tabular-nums">{sizeLabel(row)}</span>,
      },
      {
        id: "weight_kg",
        header: t("store.plateOffcut.sourceWeight"),
        cell: (row) => (
          <span className="text-end tabular-nums">
            {num(row.weight_kg) ? `${num(row.weight_kg).toFixed(3)} Kg` : "—"}
          </span>
        ),
      },
      {
        id: "heat_number",
        header: t("store.plateOffcut.heatNumber"),
        hideBelow: "lg",
        cell: (row) => (
          <span className="text-sm text-muted-foreground">{row.heat_number || "—"}</span>
        ),
      },
      {
        id: "warehouse",
        header: t("store.plateOffcut.warehouse"),
        hideBelow: "lg",
        cell: (row) => (
          <span className="truncate text-sm text-muted-foreground">
            {row.warehouse || "—"}
          </span>
        ),
      },
      {
        id: "action",
        header: t("common.status"),
        cell: (row) =>
          row.can_cut ? (
            <StatusBadge tone="open">{t("store.plateOffcut.canCut")}</StatusBadge>
          ) : (
            <StatusBadge tone="warning">
              {t("store.plateOffcut.cannotCut")}
            </StatusBadge>
          ),
      },
    ],
    [t],
  );

  return (
    <ListLayout
      tabs={tabs}
      loading={loading}
      error={error}
      onRetry={load}
      isEmpty={!loading && rows.length === 0}
      emptyTitle={t("store.plateOffcut.noAvailablePlates")}
      emptyDescription={t("store.plateOffcut.noAvailablePlatesHint")}
      actionBar={
        <ActionBar
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          resultCount={total}
          filterConfig={filterConfig}
          selectedFilters={filters}
          {...filterUi}
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
    >
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        onRowClick={(row) => {
          // A plate the server would refuse is not a link. Sending the operator
          // into a form that cannot save would be a dead end; the reason is
          // already printed under the serial, and repeating it in a toast here
          // would only re-announce what the row already says.
          if (!row.can_cut) return;
          navigate(`/store/plate-offcut/new?serial=${encodeURIComponent(row.serial)}`);
        }}
      />
    </ListLayout>
  );
}
