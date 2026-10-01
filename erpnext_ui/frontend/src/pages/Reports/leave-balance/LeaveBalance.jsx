import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";
import StatCard from "../../../components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import StatRow from "../../../components/dashboard/StatRow";
import ChartPanel from "../../../components/dashboard/ChartPanel";
import ChartGrid from "../../../components/dashboard/ChartGrid";
import {
  CalendarCheck,
  CalendarX,
  Download,
  Inbox,
  PiggyBank,
  XCircle,
} from "lucide-react";

const PIE_COLORS = ["var(--chart-1)", "var(--chart-5)", "var(--chart-2)"];

const CHART_CONFIG = {
  allocated: { label: "Allocated", color: "var(--chart-1)" },
  used: { label: "Used", color: "var(--chart-5)" },
  balance: { label: "Balance", color: "var(--chart-2)" },
};

/**
 * Leave Balance screen (shared by ESS and Reports).
 *
 * Regular employees see their own leave balance for the current fiscal year.
 * HODs / managers / HR see a department-level report (backend scopes access).
 *
 * Props:
 *   context: "ess" | "reports"  (controls breadcrumbs / back destination)
 */
export default function LeaveBalance({ context = "ess" }) {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fiscalYear, setFiscalYear] = useState(null);
  const [meta, setMeta] = useState({ can_view_others: false });
  const [departments, setDepartments] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [hasEmployee, setHasEmployee] = useState(false);

  const [selectedDept, setSelectedDept] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [employeeError, setEmployeeError] = useState("");

  /* ================= LOAD ================= */
  const load = async (department, employee) => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (department) params.department = department;
      if (employee) params.employee = employee;

      const res = await get(
        "method/erpnext_ui.api.leave_balance_report",
        params,
      );

      const msg = res.message || {};
      setFiscalYear(msg.fiscal_year || null);
      setMeta({
        is_hr: !!msg.is_hr,
        is_hod: !!msg.is_hod,
        can_view_others: !!msg.can_view_others,
      });
      setDepartments(msg.departments || []);
      setLeaveTypes(msg.leave_types || []);
      setRows(msg.employees || []);
      setHasEmployee(!!msg.my_employee);
    } catch (e) {
      console.error("Failed to load leave balance:", e);
      setError(t("reports.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: t("reports.leaveBalanceTitle"),
      subtitle:
        fiscalYear && fiscalYear.name
          ? t("reports.fiscalYear", { year: fiscalYear.name })
          : t("reports.leaveBalanceSubtitle"),

      breadcrumbs:
        context === "reports"
          ? [
              { label: t("common.home"), path: "/" },
              { label: t("nav.reports"), path: "/reports" },
              { label: t("reports.leaveBalanceTitle") },
            ]
          : [
              { label: t("common.home"), path: "/" },
              { label: t("nav.ess"), path: "/ess" },
              { label: t("reports.leaveBalanceTitle") },
            ],

      actions: [
        context === "ess" && {
          label: t("reports.applyLeave"),
          variant: "btn-primary",
          onClick: () => navigate("/requests/leave/new"),
        },
        {
          label: t("common.back"),
          variant: "btn-outline-secondary",
          onClick: () => navigate(context === "reports" ? "/reports" : "/ess"),
        },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear, context]);

  /* ================= LOAD EFFECT ================= */
  useEffect(() => {
    // load only setStates after an awaited API response; the compiler rule
    // conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(selectedDept, selectedEmployee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDept, selectedEmployee]);

  /* ================= EMPLOYEE OPTIONS ================= */
  // Fetch the permission-scoped employee list so the filter lets users pick
  // (ERPNext handles the permission scoping server-side).
  useEffect(() => {
    if (!meta.can_view_others || loadingEmployee) return;

    (async () => {
      setLoadingEmployee(true);
      setEmployeeError("");
      try {
        const params = {};
        if (selectedDept) params.department = selectedDept;

        const res = await get(
          "method/erpnext_ui.api.leave_balance_employees",
          params,
        );
        const list = (res.message && res.message.employees) || [];
        setEmployeeOptions(list);

        // If the current selection is outside the new list, clear it.
        if (selectedEmployee && !list.some((e) => e.name === selectedEmployee)) {
          setSelectedEmployee("");
        }
      } catch (e) {
        console.error("Failed to load employee list:", e);
        setEmployeeError(t("reports.employeeListFailed"));
      } finally {
        setLoadingEmployee(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.can_view_others, selectedDept]);

  /* ================= DERIVE ================= */
  const visibleRows = useMemo(() => rows, [rows]);

  const totals = useMemo(() => {
    let allocated = 0;
    let used = 0;
    let balance = 0;

    visibleRows.forEach((r) => {
      (r.leaves || []).forEach((l) => {
        allocated += l.allocated || 0;
        used += l.used || 0;
        balance += l.balance || 0;
      });
    });

    return {
      allocated: Math.round(allocated * 10) / 10,
      used: Math.round(used * 10) / 10,
      balance: Math.round(balance * 10) / 10,
    };
  }, [visibleRows]);

  const allocationSeries = useMemo(() => {
    if (totals.allocated <= 0 && totals.used <= 0 && totals.balance <= 0) {
      return [];
    }
    return [
      { key: "allocated", name: t("reports.allocated"), value: totals.allocated },
      { key: "used", name: t("reports.used"), value: totals.used },
      { key: "balance", name: t("reports.balance"), value: totals.balance },
    ].filter((d) => d.value > 0);
  }, [totals, t]);

  const typeSeries = useMemo(() => {
    const byType = {};
    visibleRows.forEach((r) => {
      (r.leaves || []).forEach((l) => {
        const type = l.leave_type || "—";
        if (!byType[type]) byType[type] = { type, allocated: 0, used: 0 };
        byType[type].allocated += l.allocated || 0;
        byType[type].used += l.used || 0;
      });
    });
    return Object.values(byType)
      .filter((d) => d.allocated > 0 || d.used > 0)
      .sort((a, b) => b.allocated - a.allocated);
  }, [visibleRows]);

  const topUsage = useMemo(() => {
    if (!meta.can_view_others) return [];
    return visibleRows
      .map((r) => {
        let allocated = 0;
        let used = 0;
        (r.leaves || []).forEach((l) => {
          allocated += l.allocated || 0;
          used += l.used || 0;
        });
        const rate = allocated > 0 ? Math.round((used / allocated) * 100) : 0;
        return {
          name: r.employee_name || r.employee,
          rate,
        };
      })
      .filter((d) => d.rate > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8);
  }, [visibleRows, meta.can_view_others]);

  /* ================= CSV ================= */
  const handleExport = () => {
    if (!visibleRows.length) return;

    const header = [
      t("reports.csvEmployeeId"),
      t("reports.csvEmployeeName"),
      t("reports.department"),
      t("reports.csvLeaveType"),
      t("reports.allocated"),
      t("reports.used"),
      t("reports.balance"),
    ];
    const lines = [header.join(",")];

    visibleRows.forEach((r) => {
      const leaves = r.leaves?.length ? r.leaves : [{ leave_type: "-", allocated: 0, used: 0, balance: 0 }];
      leaves.forEach((l) => {
        lines.push(
          [
            `"${r.employee}"`,
            `"${r.employee_name}"`,
            `"${r.department}"`,
            `"${l.leave_type}"`,
            l.allocated,
            l.used,
            l.balance,
          ].join(","),
        );
      });
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leave-balance-${fiscalYear?.name || "current"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ================= UI ================= */
  return (
    <DashboardShell>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          {error}
        </div>
      )}

      {!loading && fiscalYear && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {t("reports.fiscalYearLabel", { year: fiscalYear.name })}
          </Badge>
          <Badge variant="secondary">
            {fiscalYear.start_date} → {fiscalYear.end_date}
          </Badge>

          {(meta.is_hr || meta.is_hod) && (
            <Badge
              variant="outline"
              className="bg-sky-500/15 text-sky-600 ring-sky-500/30"
            >
              {meta.is_hr ? t("reports.hrAccess") : t("reports.hodAccess")}
            </Badge>
          )}
        </div>
      )}

      {/* FILTERS (HOD / HR only) */}
      {meta.can_view_others && (
        <div className="rounded-none bg-card p-3 ring-1 ring-foreground/10">
          <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("reports.department")}
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
              >
                <option value="">{t("reports.allDepartments")}</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("reports.employee")}
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                disabled={!employeeOptions.length}
              >
                <option value="">
                  {loadingEmployee
                    ? t("reports.loadingEmployees")
                    : employeeOptions.length
                      ? t("reports.allEmployees")
                      : t("reports.noEmployeesAvailable")}
                </option>
                {employeeOptions.map((e) => (
                  <option key={e.name} value={e.name}>
                    {e.employee_name} ({e.name})
                  </option>
                ))}
              </select>
              {employeeError && (
                <div className="mt-1 text-xs text-destructive">
                  {employeeError}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {(selectedDept || selectedEmployee) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedDept("");
                    setSelectedEmployee("");
                  }}
                >
                  <XCircle className="size-4" />
                  {t("reports.clearFilters")}
                </Button>
              )}
              <Button variant="outline" onClick={handleExport}>
                <Download className="size-4" />
                {t("reports.exportCsv")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SUMMARY */}
      {!loading && visibleRows.length > 0 && (
        <StatRow>
          <StatCard
            value={totals.allocated}
            label={t("reports.totalAllocated")}
            icon={PiggyBank}
          />
          <StatCard
            value={totals.used}
            label={t("reports.totalUsed")}
            icon={CalendarX}
            color="var(--chart-5)"
          />
          <StatCard
            value={totals.balance}
            label={t("reports.balanceUnused")}
            icon={CalendarCheck}
            color="var(--chart-2)"
          />
        </StatRow>
      )}

      {/* CHARTS */}
      {!loading && visibleRows.length > 0 && (
        <ChartGrid>
          <ChartPanel title={t("reports.leaveAllocationSplit")}>
            {allocationSeries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("reports.chartNoData")}
              </p>
            ) : (
              <ChartContainer
                config={Object.fromEntries(
                  allocationSeries.map((d, i) => [
                    d.key,
                    {
                      label: d.name,
                      color: PIE_COLORS[i % PIE_COLORS.length],
                    },
                  ]),
                )}
                className="aspect-auto h-[220px] w-full"
              >
                <PieChart>
                  <ChartTooltipContent />
                  <Pie
                    data={allocationSeries}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {allocationSeries.map((d, i) => (
                      <Cell
                        key={d.key}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </ChartPanel>

          <ChartPanel title={t("reports.leaveTypeUsage")}>
            {typeSeries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("reports.chartNoData")}
              </p>
            ) : (
              <ChartContainer
                config={{
                  allocated: {
                    ...CHART_CONFIG.allocated,
                    label: t("reports.allocated"),
                  },
                  used: { ...CHART_CONFIG.used, label: t("reports.used") },
                }}
                className="aspect-auto h-[220px] w-full"
              >
                <BarChart
                  data={typeSeries}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="type"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tickLine={false} axisLine={false} width={32} />
                  <ChartTooltipContent />
                  <ChartLegend />
                  <Bar
                    dataKey="allocated"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="used"
                    fill="var(--chart-5)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </ChartPanel>

          {topUsage.length > 0 && (
            <ChartPanel
              title={t("reports.topLeaveUsage")}
              className="md:col-span-2"
            >
              <ChartContainer
                config={{
                  rate: {
                    label: t("reports.used"),
                    color: "var(--chart-5)",
                  },
                }}
                className="aspect-auto h-[220px] w-full"
              >
                <BarChart
                  data={topUsage}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={100}
                    tick={{ fontSize: 11 }}
                  />
                  <ChartTooltipContent />
                  <Bar
                    dataKey="rate"
                    fill="var(--chart-5)"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </ChartPanel>
          )}
        </ChartGrid>
      )}

      {/* CONTENT */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-5">
          <Spinner className="size-5 text-primary" />
          <span className="text-sm text-muted-foreground">
            {t("common.loading")}
          </span>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-none bg-card p-4 text-center text-muted-foreground ring-1 ring-foreground/10">
          <Inbox className="mx-auto mb-2 size-10" />
          <div>
            {!meta.can_view_others && !hasEmployee
              ? t("reports.noEmployeeProfile")
              : t("reports.noLeaveData")}
          </div>
        </div>
      ) : (
        <LeaveMatrix rows={visibleRows} leaveTypes={leaveTypes} />
      )}
    </DashboardShell>
  );
}

/* ============================================================
   MATRIX VIEW — employees × leave types
   Each cell is the employee's balance for that leave type, with
   "used/allocated" underneath. A gray 0 means no allocation.
   ============================================================ */
const COL = 110; // each leave-type column
const EMP_COL = 220; // sticky employee column

function LeaveMatrix({ rows, leaveTypes = [] }) {
  const { t } = useTranslation();

  // Fallback: derive column set from data if the API didn't send it.
  const types = leaveTypes.length
    ? leaveTypes
    : Array.from(
        new Set(
          rows.flatMap((r) => (r.leaves || []).map((l) => l.leave_type || "")),
        ),
      ).filter(Boolean).sort();

  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">
        {t("reports.matrixHint")}{" "}
        <span className="text-muted-foreground">
          {t("reports.matrixHintGray")}
        </span>
      </div>
      <div className="rounded-none bg-card p-2 ring-1 ring-foreground/10">
        <div
          style={{ overflow: "auto", maxHeight: "calc(100vh - 300px)" }}
        >
          {/* HEADER */}
          <div
            className="sticky top-0 z-[3] flex bg-card"
            style={{
              minWidth: EMP_COL + types.length * COL,
            }}
          >
            <div
              className="sticky start-0 z-[2] border-b border-border bg-card p-2 font-semibold"
              style={{
                width: EMP_COL,
                minWidth: EMP_COL,
              }}
            >
              {t("reports.employee")}
            </div>

            {types.map((type) => (
              <div
                key={type}
                title={type}
                className="border-b border-border py-1.5 text-center text-[11px] leading-tight text-muted-foreground"
                style={{
                  width: COL,
                  minWidth: COL,
                }}
              >
                {type}
              </div>
            ))}
          </div>

          {/* ROWS */}
          {rows.map((r) => {
            const byType = {};
            (r.leaves || []).forEach((l) => {
              byType[l.leave_type] = l;
            });

            return (
              <div
                key={r.employee}
                className="border-b border-border"
                style={{
                  display: "flex",
                  minWidth: EMP_COL + types.length * COL,
                }}
              >
                {/* EMPLOYEE */}
                <div
                  className="sticky start-0 z-[1] overflow-hidden text-ellipsis whitespace-nowrap bg-card px-2 py-1.5"
                  style={{
                    width: EMP_COL,
                    minWidth: EMP_COL,
                  }}
                >
                  <div className="text-[13px] font-medium">
                    {r.employee_name}
                  </div>
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted-foreground">
                    {r.employee}
                    {r.department ? ` · ${r.department}` : ""}
                  </div>
                </div>

                {/* LEAVE TYPE CELLS */}
                {types.map((type) => {
                  const l = byType[type];
                  const allocated = l ? l.allocated : 0;
                  const used = l ? l.used : 0;
                  const balance = l ? l.balance : 0;

                  const tone =
                    allocated <= 0
                      ? "none" // no allocation -> muted 0
                      : balance <= 0
                        ? "danger"
                        : balance < allocated * 0.25
                          ? "warning"
                          : "ok";

                  const color =
                    tone === "danger"
                      ? "var(--destructive)"
                      : tone === "warning"
                        ? "var(--chart-3)"
                        : tone === "none"
                          ? "var(--muted-foreground)"
                          : "inherit";

                  return (
                    <div
                      key={type}
                      title={t("reports.cellTitle", {
                        type,
                        allocated,
                        used,
                        balance,
                      })}
                      className="flex flex-col items-center justify-center gap-0.5 py-1.5"
                      style={{
                        width: COL,
                        minWidth: COL,
                      }}
                    >
                      <span
                        className="text-[15px] font-semibold"
                        style={{ color }}
                      >
                        {balance}
                      </span>
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                        {allocated}/{used}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
