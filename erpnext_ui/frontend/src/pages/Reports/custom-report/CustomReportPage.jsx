import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { get } from "../../../services/api";
import { useHeader } from "../../../context/HeaderContext";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import FormSelect from "../../../components/FormSelect";
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  formatCell,
  isNumericColumn,
  parseSelectOptions,
  seedDefault,
  visibleColumns as visibleColumnsOf,
} from "./format";

/**
 * A report defined in another app, rendered from the report's own metadata.
 *
 * Why this is generic rather than a hand-built page per report: the column set
 * is NOT knowable here. `Plate Stock Register`'s execute() appends a column at
 * runtime — a hidden "Offcuts" column whenever `include_offcuts` is falsy — so a
 * hardcoded field list would drop or misplace a column depending on a filter the
 * user just toggled. The server returns the report's own `columns`; we render
 * exactly those.
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
 * Per-report page chrome only — title, icon. The report name and its app stay
 * server-side: a caller who can edit this bundle must not be able to point the
 * key at a different report.
 */
const REPORT_PAGES = {
  "plate-stock-register": {
    titleKey: "reports.plateStockRegister",
    subtitleKey: "reports.plateStockRegisterDesc",
  },
};

function FilterControl({ filter, value, onChange }) {
  switch (filter.fieldtype) {
    case "Link":
      // LinkField fires onChange only on COMMIT (pick / clear / exact blur
      // match), never per keystroke — which matters here because each change
      // re-runs the report.
      return (
        <LinkField
          doctype={filter.options}
          value={value || ""}
          onChange={onChange}
          placeholder={filter.label}
        />
      );

    case "Check":
      return (
        <label className="flex h-8 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand-primary)]"
            checked={value === 1 || value === "1"}
            onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          />
          {filter.label}
        </label>
      );

    case "Select":
      return (
        <FormSelect
          value={value || ""}
          onChange={onChange}
          options={parseSelectOptions(filter.options)}
          placeholder={filter.label}
        />
      );

    case "Date":
      return (
        <Input
          type="date"
          className="h-8"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      // Data / Float / Int / Currency / anything Frappe adds later.
      return (
        <Input
          className="h-8"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onChange(e.currentTarget.value)}
          aria-label={filter.label}
        />
      );
  }
}

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
        // so e.g. `include_offcuts` starts checked as the report intends rather
        // than off. Only unseeded keys are filled — a filter the user already
        // cleared must not be re-defaulted on the next fetch.
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
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.reports"), path: "/reports" },
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
  // from the row dict — Plate Stock Register's Offcuts column does exactly this.
  const visibleColumns = useMemo(
    () => visibleColumnsOf(columns),
    [columns],
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
      {/* FILTER BAR — rendered from the report's declared Report Filter rows */}
      {declaredFilters.length ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {declaredFilters.map((f) => (
              <div key={f.fieldname} className="min-w-0">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {f.label}
                </label>
                <FilterControl
                  filter={f}
                  value={filters[f.fieldname]}
                  onChange={(v) => updateFilter(f.fieldname, v)}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={applyFilters} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t("reports.applyFilters")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetFilters}
              disabled={loading}
            >
              <RotateCcw className="size-4" />
              {t("reports.clearFilters")}
            </Button>
          </div>
        </div>
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
              ) : (
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
              )}
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
      )}
    </DashboardShell>
  );
}