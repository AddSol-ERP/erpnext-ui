import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { get } from "../../../services/api";
import { useHeader } from "../../../context/HeaderContext";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "cn";
import FilterBar from "./FilterBar";
import { REPORT_PAGES } from "./reportPages";
import {
  formatCell,
  isNumericColumn,
  seedDefault,
  visibleColumns as visibleColumnsOf,
} from "./format";
import { groupRows, isBlankCell } from "./group";

/**
 * A report defined in another app, rendered from the report's own metadata.
 *
 * Why this is generic rather than a hand-built page per report: the column set
 * is NOT knowable here. A Script Report may append a column at runtime —
 * `Plate Stock Register`'s execute() used to add a hidden "Offcuts" column
 * whenever `include_offcuts` was falsy, before the offcuts moved to their own
 * report — so a hardcoded field list would drop or misplace a column depending
 * on a filter the user just toggled. The server returns the report's own
 * `columns`; we render exactly those.
 *
 * The same applies to the filter bar. `Report.filters` is a `Report Filter` CHILD
 * TABLE, so fieldname / fieldtype / options / default are read off the Report
 * record per call. Adding a filter in the owning app needs no change here.
 *
 * The report KEY is the only thing the client sends — never a report name. The
 * server resolves it against SPA_CUSTOM_REPORTS in erpnext_ui/api.py and
 * re-runs the permission probe on every call, so this page's visibility is UX
 * and the endpoint is the boundary.
 */

/**
 * Per-report page chrome plus each report's grouping contract live in
 * `./reportPages` -- a module of their own, because the contract is where a
 * wrong number reaches a storekeeper and the rules suite asserts it against
 * REAL rows.
 */

export default function CustomReportPage({ reportKey }) {
  const { t } = useTranslation();
  const { setHeader } = useHeader();

  const page = REPORT_PAGES[reportKey] || REPORT_PAGES["plate-stock-register"];

  const [filters, setFilters] = useState({});
  const [columns, setColumns] = useState([]);
  const [data, setData] = useState([]);
  const [totalRow, setTotalRow] = useState(null);
  const [declaredFilters, setDeclaredFilters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Expanded parent rows, as item codes. A Set rather than a single key because
  // a storekeeper comparing two items needs both open at once.
  const [expanded, setExpanded] = useState(() => new Set());

  const grouping = page.grouping || null;
  const primaryFilters = page.primaryFilters || [];

  const fetchReport = useCallback(
    async (activeFilters) => {
      setLoading(true);
      setError(null);
      try {
        const res = await get("method/erpnext_ui.api.get_custom_report_data", {
          report_key: reportKey,
          filters: JSON.stringify(activeFilters || {}),
        });
        const payload = res.message || {};

        setColumns(payload.columns || []);
        setData(payload.data || []);
        setTotalRow(payload.total_row || null);

        // Seed the bar from the report's declared defaults on the first load,
        // so e.g. `above_tolerance_only` starts unchecked as the report intends
        // rather than on. Only unseeded keys are filled — a filter the user
        // already cleared must not be re-defaulted on the next fetch.
        if (payload.filters?.length) {
          setDeclaredFilters(payload.filters);
          setFilters((prev) => {
            const seeded = { ...prev };
            let changed = false;
            for (const f of payload.filters) {
              if (seeded[f.fieldname] !== undefined) continue;
              const value = seedDefault(f);
              if (value === undefined) continue;
              seeded[f.fieldname] = value;
              changed = true;
            }
            return changed ? seeded : prev;
          });
        }
      } catch (e) {
        setError(e);
        setColumns([]);
        setData([]);
        setTotalRow(null);
      } finally {
        setLoading(false);
      }
    },
    [reportKey],
  );

  useEffect(() => {
    setHeader({
      title: t(page.titleKey),
      subtitle: t(page.subtitleKey),
      // These reports are a Store surface now, so the trail points at the
      // module that owns them. Keeping "Reports" here would send the user to a
      // hub that no longer lists the page they came from.
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t(page.titleKey) },
      ],
      actions: [
        {
          label: t("common.refresh"),
          variant: "btn-outline-primary",
          onClick: () => fetchReport(filters),
        },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.titleKey, page.subtitleKey, filters]);

  useEffect(() => {
    // fetchReport setStates only after an awaited API response; the rule
    // conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReport({});
  }, [fetchReport]);

  // `hidden` is how a report removes a column from display without removing it
  // from the row dict. A report that appends one at runtime must not shift
  // every later value one column to the left.
  const visibleColumns = useMemo(
    () => visibleColumnsOf(columns),
    [columns],
  );

  const groups = useMemo(() => groupRows(data, grouping), [data, grouping]);

  // An UNGROUPED report must render as a flat list, not as one parent row.
  // `groupRows` returns a single group containing everything when `groupBy` is
  // empty, and `isBlankCell(field, "parent", null)` answers `true` for EVERY
  // column when there is no config -- so routing an ungrouped report through the
  // parent/child markup rendered one completely blank row. No error, no empty
  // state, just an empty table. Flat rendering is the correct generic behaviour.
  const isGrouped = Boolean((grouping?.groupBy || []).length);

  const toggleGroup = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.key));

  const toggleAll = useCallback(() => {
    setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.key)));
  }, [allExpanded, groups]);

  // A single-child group has nothing to expand, so it gets no toggle and no
  // indentation -- otherwise every item with one batch would carry a dead
  // chevron implying there was more to see.
  const isExpandable = useCallback(
    (group) => grouping && (grouping.groupBy || []).length > 0 && group.children.length > 1,
    [grouping],
  );

  const updateFilter = useCallback((fieldname, value) => {
    setFilters((prev) => ({ ...prev, [fieldname]: value }));
  }, []);

  // Text filters need an explicit apply — otherwise every keystroke re-runs a
  // SQL report over the whole serial-number table.
  const applyFilters = useCallback(() => fetchReport(filters), [fetchReport, filters]);

  const resetFilters = useCallback(() => {
    const cleared = {};
    for (const f of declaredFilters) {
      cleared[f.fieldname] =
        f.fieldtype === "Check" ? (f.default === "1" ? 1 : 0) : "";
    }
    setFilters(cleared);
    fetchReport(cleared);
  }, [declaredFilters, fetchReport]);

  return (
    <DashboardShell>
      {/* FILTER BAR — metadata-driven, so a filter added in the owning app
          appears with no change here. Only the frequently used ones sit inline;
          the rest fold into a popover that counts what is set inside it. */}
      {declaredFilters.length ? (
        <FilterBar
          declared={declaredFilters}
          values={filters}
          onChange={updateFilter}
          primary={primaryFilters}
          loading={loading}
          onApply={applyFilters}
          onReset={resetFilters}
        />
      ) : null}

      {error ? (
        <Empty className="border">
          <EmptyHeader>
            <AlertTriangle className="size-6 text-destructive" />
            <EmptyTitle>{t("reports.loadFailedTitle")}</EmptyTitle>
            <EmptyDescription>
              {error.message || t("reports.loadFailedHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !visibleColumns.length && !loading ? (
        <Empty className="border">
          <EmptyHeader>
            <AlertTriangle className="size-6 text-muted-foreground" />
            <EmptyTitle>{t("reports.noColumnsTitle")}</EmptyTitle>
            <EmptyDescription>{t("reports.noColumnsHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {/* Group controls sit with the TABLE, not in the filter bar: they act
              on rows, not on the query. Hidden unless the report is grouped AND
              has more than one group, so an ungrouped report carries no dead
              control. */}
          {isGrouped && groups.length > 1 ? (
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleAll}
                disabled={loading}
              >
                <ChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    allExpanded && "rotate-90",
                  )}
                />
                {allExpanded ? t("reports.collapseAll") : t("reports.expandAll")}
              </Button>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((col) => (
                  <TableHead
                    key={col.fieldname}
                    className={cn(isNumericColumn(col) && "text-end")}
                    style={col.width ? { minWidth: col.width } : undefined}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {data.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length || 1}>
                    <div className="py-6 text-center text-muted-foreground">
                      {t("reports.noRows")}
                    </div>
                  </TableCell>
                </TableRow>
              ) : !isGrouped ? (
                // FLAT -- the report declares no grouping, so every row is its
                // own row and every column is its own value. See isGrouped.
                data.map((row, i) => (
                  <TableRow key={row.name || i}>
                    {visibleColumns.map((col) => (
                      <TableCell
                        key={col.fieldname}
                        className={cn(
                          isNumericColumn(col)
                            ? "text-end tabular-nums"
                            : col.fieldtype === "Link" && "text-primary",
                        )}
                      >
                        {formatCell(row[col.fieldname], col)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : groups.map((group) => {
                const open = expanded.has(group.key);
                const expandable = isExpandable(group);
                return (
                  <Fragment key={group.key}>
                    {/* PARENT — one per group. aria-expanded feeds the
                        `has-aria-expanded:bg-muted/50` rule already in
                        ui/table.jsx, so the open row is visibly distinct. */}
                    <TableRow
                      aria-expanded={expandable ? open : undefined}
                      className={cn(
                        "bg-muted/30 hover:bg-muted/50",
                        expandable && "cursor-pointer",
                      )}
                      onClick={expandable ? () => toggleGroup(group.key) : undefined}
                    >
                      {visibleColumns.map((col) => {
                        const isGroupLabel =
                          (grouping?.groupBy || []).includes(col.fieldname);
                        const mixedHere = group.mixedFlags?.[col.fieldname];

                        if (isGroupLabel) {
                          return (
                            <TableCell key={col.fieldname}>
                              <div className="flex items-start gap-1.5">
                                {/* A real <button>, not just a clickable row:
                                    store-balance puts onClick on the <tr> alone,
                                    which no keyboard user can reach. It coexists
                                    with the row's own onClick via
                                    stopPropagation so a click on it does not
                                    toggle twice. */}
                                {expandable ? (
                                  <button
                                    type="button"
                                    aria-expanded={open}
                                    aria-label={`${group.label}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleGroup(group.key);
                                    }}
                                    className="-ms-1 mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                                  >
                                    <ChevronRight
                                      className={cn(
                                        "size-4 transition-transform",
                                        open && "rotate-90",
                                      )}
                                    />
                                  </button>
                                ) : (
                                  <span className="w-1 shrink-0" />
                                )}

                                <div className="min-w-0">
                                  <div className="truncate font-semibold">
                                    {group.label || formatCell(
                                      group.aggregate[col.fieldname],
                                      col,
                                    )}
                                  </div>
                                  {/* Distinct batch / warehouse counts, so an
                                      item holding 24 plates across 3 batches
                                      reads differently from one holding 3. */}
                                  {expandable &&
                                  (grouping?.countFields || []).length ? (
                                    <div className="truncate text-xs text-muted-foreground">
                                      {(grouping.countFields || [])
                                        .map(({ field, labelKey }) =>
                                          t(labelKey, {
                                            count: group.counts[field] ?? 0,
                                          }),
                                        )
                                        .join(" • ")}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                          );
                        }

                        if (mixedHere) {
                          return (
                            <TableCell
                              key={col.fieldname}
                              className="italic text-muted-foreground"
                            >
                              {t("reports.mixed")}
                            </TableCell>
                          );
                        }

                        if (isBlankCell(col.fieldname, "parent", grouping)) {
                          return (
                            <TableCell key={col.fieldname}>
                              <span className="text-muted-foreground/40">—</span>
                            </TableCell>
                          );
                        }

                        return (
                          <TableCell
                            key={col.fieldname}
                            className={cn(
                              isNumericColumn(col)
                                ? "text-end font-medium tabular-nums"
                                : col.fieldtype === "Link" && "text-primary",
                            )}
                          >
                            {formatCell(group.aggregate[col.fieldname], col)}
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {/* CHILDREN — one per (warehouse, batch) in the report's own
                        order. `warehouse`/`batch` are deliberately repeated even
                        though isBlankCell blanks the item columns: the
                        describing columns are the reason to expand. */}
                    {open
                      ? group.children.map((child) => (
                          <TableRow
                            key={child.key}
                            className="border-b border-border/40 bg-background hover:bg-accent/40"
                          >
                            {visibleColumns.map((col) => {
                              if (
                                isBlankCell(col.fieldname, "child", grouping)
                              ) {
                                return (
                                  <TableCell
                                    key={col.fieldname}
                                    className="ps-8 text-muted-foreground/40"
                                  >
                                    <span aria-hidden="true">·</span>
                                  </TableCell>
                                );
                              }
                              return (
                                <TableCell
                                  key={col.fieldname}
                                  className={cn(
                                    isNumericColumn(col)
                                      ? "text-end tabular-nums text-muted-foreground"
                                      : col.fieldtype === "Link" && "text-primary",
                                  )}
                                >
                                  {formatCell(child.row[col.fieldname], col)}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </TableBody>

            {/* The total row is the report's OWN fourth return value. It is NOT
                computed here and NOT Frappe's `add_total_row`: this report sets
                `add_total_row: 0` and returns its own totals from execute(), so
                a total row appears only because the report asked for one. */}
            {totalRow ? (
              <TableFooter>
                <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.fieldname}
                      className={cn(isNumericColumn(col) && "text-end tabular-nums")}
                    >
                      {formatCell(totalRow[col.fieldname], col)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}