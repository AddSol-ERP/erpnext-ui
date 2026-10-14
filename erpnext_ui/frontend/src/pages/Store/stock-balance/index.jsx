import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ChevronRight, Info, TriangleAlert, Undo2 } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";

import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import ListLayout from "../../../components/ListLayout";
import useListPagination from "../../../hooks/useListPagination";
import { listFilterHandlers } from "../../../lib/filterChips";
import { isValuationAccurate } from "../../../lib/stockBalance";
import { deskDocUrl } from "../../../lib/deskUrl";
import { localDateISO } from "../../../utils/localDateTime";
import BalanceTrail from "./BalanceTrail";
import ReturnToStock from "./ReturnToStock";

/**
 * Stock balance, with the provenance to answer "where did this come from".
 *
 * The page this replaces queried `Bin` for four fields and rendered item code,
 * warehouse, quantity and a value. `Bin` is a current snapshot per
 * item+warehouse, so that view could not say where stock came from or what it
 * cost -- and for stock bought across more than one receipt the single rate it
 * shows is a blend matching nothing anyone purchased.
 *
 * Three layers, deliberately:
 *
 *   1. A PERIOD, not a snapshot. opening -> in -> out -> closing. Defaults to
 *      the current month, which is a cost decision: an opening balance is
 *      everything posted before the window, so "forever" is the most expensive
 *      default available.
 *   2. VALUE, but only when the rate actually describes the period.
 *      `Bin.valuation_rate` is today's moving average, so for a period ending
 *      in the past the value columns stay blank with a note rather than showing
 *      a number that did not apply then.
 *   3. THE LEDGER, per row, loaded only on expand. See BalanceTrail.
 *
 * `stock_uom` comes straight from `Bin` -- the previous version made an extra
 * `Item` request on every page load to look it up, which was pure overhead.
 */

const fmt = (v, digits = 2) =>
  v === null || v === undefined || v === ""
    ? "—"
    : Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      });

/**
 * The summary grid, given rows.
 *
 * Split from the fetching page for the same reason as `TrailTable`: under SSR a
 * component that fetches on mount can only ever render its loading state, so
 * its columns cannot be asserted.
 */
/**
 * Must equal the number of <th> below. The expanded row spans all of them, and
 * a mismatch shows up as a trail squeezed into the first column -- an ugly
 * failure for a purely cosmetic mistake, so the count lives in one place and
 * storecheck compares it against the rendered header.
 */
const COLUMN_COUNT = 11;

export function BalanceTable({ rows = [], expanded, onToggle, onReturn, navigate }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="w-8 py-2 pr-1" />
            <th className="w-10 py-2" />
            <th className="py-2 pr-3 font-medium">{t("common.name")}</th>
            <th className="py-2 pr-3 text-end font-medium">{t("store.balance.opening")}</th>
            <th className="py-2 pr-3 text-end font-medium">{t("store.balance.inQty")}</th>
            <th className="py-2 pr-3 text-end font-medium">{t("store.balance.outQty")}</th>
            <th className="py-2 pr-3 text-end font-medium">{t("store.balance.closing")}</th>
            <th className="py-2 pr-3 text-end font-medium">{t("store.balance.free")}</th>
            <th className="py-2 pr-3 text-end font-medium">{t("store.balance.reserved")}</th>
            <th className="py-2 pr-3 text-end font-medium">{t("store.balance.value")}</th>
            <th className="py-2 text-end font-medium">{t("store.balance.rate")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = `${row.item_code}|${row.warehouse}`;
            const open = expanded === key;
            const closed = (row.closing_qty || 0) <= 0;
            return (
              <Fragment key={key}>
              <tr
                className="cursor-pointer border-b border-border/40 hover:bg-accent/40"
                onClick={() => onToggle(row)}
              >
                <td className="py-2 pr-1">
                  <ChevronRight
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.item_code}</div>
                    <div className="truncate text-xs text-muted-foreground">{row.warehouse}</div>
                  </div>
                </td>
                <td className="py-2 pr-3 text-end tabular-nums text-muted-foreground">
                  {fmt(row.opening_qty)}
                </td>
                <td className="py-2 pr-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400">
                  {row.in_qty ? fmt(row.in_qty) : "\u2014"}
                </td>
                <td className="py-2 pr-3 text-end tabular-nums text-orange-600 dark:text-orange-400">
                  {row.out_qty ? fmt(row.out_qty) : "\u2014"}
                </td>
                <td
                  className={`py-2 pr-3 text-end font-semibold tabular-nums ${closed ? "text-destructive" : ""}`}
                >
                  {fmt(row.closing_qty)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {row.stock_uom}
                  </span>
                </td>
                <td className="py-2 pr-3 text-end tabular-nums">{fmt(row.free_qty)}</td>
                <td className="py-2 pr-3 text-end tabular-nums text-muted-foreground">
                  {row.reserved_qty ? fmt(row.reserved_qty) : "\u2014"}
                </td>
                <td className="py-2 pr-3 text-end tabular-nums">
                  {row.stock_value === null || row.stock_value === undefined
                    ? "\u2014"
                    : `\u20b9 ${fmt(row.stock_value)}`}
                </td>
                <td className="py-2 pr-3 text-end tabular-nums text-muted-foreground">
                  {fmt(row.valuation_rate, 2)}
                </td>
                <td className="py-2">
                  {/* Return-to-stock sits on the row because the context it
                      needs -- which item, which warehouse, how much -- is
                      already in view. */}
                  <button
                    type="button"
                    title={t("store.returnStock.action")}
                    aria-label={t("store.returnStock.action")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReturn?.(row);
                    }}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                  >
                    <Undo2 className="size-4" />
                  </button>
                </td>
              </tr>

              {/* The trail belongs directly under the row it explains. It used
                  to render after the closing </tbody>, so expanding row 3 of
                  20 dropped the history below row 20 -- you had to scroll past
                  everything else to see what you had just opened. */}
              {open ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="bg-muted/20 p-0">
                    <BalanceTrail row={row} onNavigate={navigate} />
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StockBalance() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [returning, setReturning] = useState(null);
  const [lastReturn, setLastReturn] = useState(null);

  const {
    page,
    setPage,
    totalItems,
    setTotal,
    totalPages,
    resetPage,
    limit_start,
    limit_page_length,
  } = useListPagination({ pageSize: 20 });

  const [filters, setFilters] = useState({});

  const filterUi = useMemo(() => listFilterHandlers(setFilters, resetPage), [resetPage]);

  const filterConfig = {
    filters: [
      {
        label: t("store.filters.item"),
        field: "item_code",
        type: "link",
        doctype: "Item",
      },
      {
        label: t("store.filters.warehouse"),
        field: "warehouse",
        type: "link",
        doctype: "Warehouse",
      },
      {
        label: t("store.filters.company"),
        field: "company",
        type: "link",
        doctype: "Company",
      },
      { label: t("store.balance.fromDate"), field: "from_date", type: "date" },
      { label: t("store.balance.toDate"), field: "to_date", type: "date" },
    ],
  };

  useEffect(() => {
    setHeader({
      title: t("store.balance.title"),
      subtitle: t("store.balance.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.balance.title") },
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await get("method/erpnext_ui.api.get_stock_balance_summary", {
        from_date: filters.from_date || "",
        to_date: filters.to_date || "",
        item_code: debouncedSearch || filters.item_code || "",
        warehouse: filters.warehouse || "",
        company: filters.company || "",
        start: limit_start,
        limit: limit_page_length,
      });

      const payload = res.message || {};
      setRows(payload.rows || []);
      setTotal(payload.total || 0);
      setMeta(payload);
      // A row that has just scrolled away must not stay open with stale data.
      setExpanded(null);
    } catch (e) {
      setError(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters, limit_start, limit_page_length, setTotal]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const valuationAccurate = isValuationAccurate(meta.to_date, meta.today || localDateISO());

  const toggle = (row) => {
    const key = `${row.item_code}|${row.warehouse}`;
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <ListLayout
      contentMode="children"
      loading={loading}
      error={error}
      onRetry={loadData}
      actionBar={
        <ActionBar
          onSearch={handleSearch}
          // No resultCount: the card footer already renders "Showing 1-20 of 47"
          // through Pagination. With a single page Pagination still shows it
          // (`singlePageWithMeta`, Pagination:77-78), so nothing is lost -- the
          // toolbar pill was a second, weaker copy of a number the user could
          // already read one line below.
          filterConfig={filterConfig}
          selectedFilters={filters}
          // Five filters on a report is exactly the case where hiding them
          // behind one button costs a click on every use. Inline when they fit,
          // dropdown when they do not.
          inlineFilters
          {...filterUi}
        />
      }
      isEmpty={!loading && rows.length === 0}
      emptyTitle={t("store.balance.empty")}
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
    >
      <div className="flex flex-col gap-3 px-3 py-3">
        {lastReturn ? (
          <p className="flex flex-wrap items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5 shrink-0" />
            {t("store.returnStock.done", { item: lastReturn.item_code, qty: lastReturn.qty })}
            {lastReturn.stock_entry ? (
              <button
                type="button"
                onClick={() => window.open(deskDocUrl("Stock Entry", lastReturn.stock_entry), "_blank")}
                className="underline underline-offset-2"
              >
                {lastReturn.stock_entry}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setLastReturn(null)}
              className="ml-auto underline underline-offset-2"
            >
              {t("common.close")}
            </button>
          </p>
        ) : null}

        {meta.performance_warning ? (
          <p className="flex items-center gap-2 rounded border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-700 dark:text-orange-400">
            <TriangleAlert className="size-3.5 shrink-0" />
            {t("store.balance.performanceWarning")}
          </p>
        ) : null}

        {!valuationAccurate && rows.length > 0 ? (
          <p className="flex items-center gap-2 rounded border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            {t("store.balance.valuationAsOf")}
          </p>
        ) : null}

        <BalanceTable
          rows={rows}
          expanded={expanded}
          onToggle={toggle}
          navigate={navigate}
          onReturn={(r) => {
            setLastReturn(null);
            setReturning(r);
          }}
        />

        <ReturnToStock
          show={!!returning}
          onClose={() => setReturning(null)}
          row={returning}
          onDone={async (result) => {
            setReturning(null);
            // Refresh so the row's balance visibly changes -- that change IS
            // the proof the movement happened.
            setLastReturn({
              item_code: result?.item_code || returning?.item_code,
              qty: returning?.qty,
              stock_entry: result?.stock_entry,
            });
            await loadData();
          }}
        />
      </div>
    </ListLayout>
  );
}