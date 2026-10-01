import { useEffect, useMemo, useState } from "react";
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
  Line,
  LineChart,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  Hourglass,
  List,
  RefreshCw,
  Users,
} from "lucide-react";

const CHART_CONFIG = {
  total: { label: "Total", color: "var(--chart-1)" },
  approved: { label: "Approved", color: "var(--chart-2)" },
  other: { label: "Other", color: "var(--chart-4)" },
  hours: { label: "Hours", color: "var(--chart-1)" },
};

const PIE_COLORS = [
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--destructive)",
  "var(--chart-5)",
];

/**
 * Overtime Report Page
 *
 * Shows overtime data across all employees for a selected month.
 * Includes summary stats, charts, and detailed tables.
 */
export default function OvertimeReportPage() {
  const { setHeader } = useHeader();
  const { t, i18n } = useTranslation();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDayDate = new Date(year, month + 1, 0);
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-${String(
    lastDayDate.getDate()
  ).padStart(2, "0")}`;

  const monthLabel = new Date(year, month, 1).toLocaleString(i18n.language, {
    month: "long",
  });

  /* ── Fetch OT logs for the month ── */
  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await get("resource/Overtime Log", {
        fields: JSON.stringify([
          "name",
          "employee",
          "employee_name",
          "attendance_date",
          "shift",
          "in_time",
          "out_time",
          "overtime_hours",
          "status",
          "remarks",
          "approved_by",
        ]),
        filters: JSON.stringify([
          ["attendance_date", "between", [firstDay, lastDay]],
        ]),
        order_by: "attendance_date asc",
        limit_page_length: 500,
      });
      setLogs(res.data || []);
    } catch (e) {
      console.error("Failed to fetch overtime logs:", e);
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  /* ── Navigation ── */
  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  /* ── Helpers ── */
  const formatDateTime = (dt) => {
    if (!dt) return "—";
    try {
      return new Date(dt).toLocaleString(i18n.language, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dt;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Approved":
        return "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30";
      case "Rejected":
        return "bg-destructive/15 text-destructive ring-destructive/30";
      default:
        return "bg-amber-500/15 text-amber-600 ring-amber-500/30";
    }
  };

  const statusLabel = (status) => {
    if (status === "Approved") return t("reports.approved");
    if (status === "Rejected") return t("reports.rejected");
    if (status === "Draft" || !status) return t("reports.draft");
    return status;
  };

  /* ── Header ── */
  useEffect(() => {
    setHeader({
      title: t("reports.overtimeTitle"),
      subtitle: `${monthLabel} ${year}`,
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.reports"), path: "/reports" },
        { label: t("reports.overtimeTitle") },
      ],
      actions: [
        {
          label: t("common.refresh"),
          variant: "btn-outline-primary",
          icon: RefreshCw,
          onClick: fetchLogs,
        },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  /* ── Fetch effect ── */
  useEffect(() => {
    // fetchLogs only setStates after an awaited API response; the compiler
    // rule conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  /* ── Derived (memoized) ── */
  const summary = useMemo(() => {
    const totalOT = logs.reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
    const uniqueEmployees = new Set(logs.map((l) => l.employee)).size;
    const approvedOT = logs
      .filter((l) => l.status === "Approved")
      .reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
    return { totalOT, uniqueEmployees, approvedOT, logCount: logs.length };
  }, [logs]);

  const employeeSummary = useMemo(() => {
    const map = {};
    logs.forEach((l) => {
      const key = l.employee;
      if (!map[key]) {
        map[key] = {
          employee: l.employee,
          employee_name: l.employee_name,
          totalHours: 0,
          logCount: 0,
          approvedHours: 0,
        };
      }
      map[key].totalHours += l.overtime_hours || 0;
      map[key].logCount += 1;
      if (l.status === "Approved") {
        map[key].approvedHours += l.overtime_hours || 0;
      }
    });
    return map;
  }, [logs]);

  const trendSeries = useMemo(() => {
    const byDate = {};
    logs.forEach((l) => {
      const date = l.attendance_date;
      if (!date) return;
      if (!byDate[date]) byDate[date] = { date, approved: 0, other: 0 };
      const hours = l.overtime_hours || 0;
      if (l.status === "Approved") byDate[date].approved += hours;
      else byDate[date].other += hours;
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [logs]);

  const topEmployees = useMemo(() => {
    return Object.values(employeeSummary)
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, 8)
      .map((emp) => ({
        name: emp.employee_name || emp.employee,
        hours: Math.round(emp.totalHours * 100) / 100,
      }));
  }, [employeeSummary]);

  const statusSeries = useMemo(() => {
    const byStatus = {};
    logs.forEach((l) => {
      const key = l.status || "Draft";
      byStatus[key] = (byStatus[key] || 0) + (l.overtime_hours || 0);
    });
    return Object.entries(byStatus)
      .map(([status, hours], i) => ({
        status,
        name: statusLabel(status),
        hours: Math.round(hours * 100) / 100,
        fill: PIE_COLORS[i % PIE_COLORS.length],
      }))
      .filter((d) => d.hours > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, t]);

  const hasChartData =
    trendSeries.length > 0 || topEmployees.length > 0 || statusSeries.length > 0;

  return (
    <DashboardShell>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          {error}
        </div>
      )}

      {/* ── Month Navigation ── */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={prevMonth}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
          {t("common.previous")}
        </Button>
        <h5 className="mb-0 text-lg font-semibold">
          {monthLabel} {year}
        </h5>
        <Button variant="outline" onClick={nextMonth}>
          {t("common.next")}
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Button>
      </div>

      {/* ── Summary Cards ── */}
      <StatRow>
        <StatCard
          value={summary.logCount}
          label={t("reports.totalLogs")}
          icon={List}
        />
        <StatCard
          value={summary.totalOT.toFixed(2)}
          label={t("reports.totalOtHours")}
          icon={Hourglass}
        />
        <StatCard
          value={summary.uniqueEmployees}
          label={t("reports.employees")}
          icon={Users}
        />
        <StatCard
          value={summary.approvedOT.toFixed(2)}
          label={t("reports.approvedOtHrs")}
          icon={Hourglass}
          color="var(--chart-2)"
        />
      </StatRow>

      {/* ── Charts ── */}
      <ChartGrid>
        {/* Daily OT trend — line */}
        <ChartPanel title={t("reports.otByDay")}>
          {trendSeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("reports.chartNoData")}
            </p>
          ) : (
            <ChartContainer
              config={{
                approved: {
                  ...CHART_CONFIG.approved,
                  label: t("reports.approved"),
                },
                other: {
                  ...CHART_CONFIG.other,
                  label: t("reports.draft"),
                },
              }}
              className="aspect-auto h-[220px] w-full"
            >
              <LineChart
                data={trendSeries}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) => String(v).slice(5)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={32}
                />
                <ChartTooltipContent />
                <ChartLegend />
                <Line
                  dataKey="approved"
                  type="monotone"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  dataKey="other"
                  type="monotone"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </ChartPanel>

        {/* Top employees — horizontal bar */}
        <ChartPanel title={t("reports.topOtEmployees")}>
          {topEmployees.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("reports.chartNoData")}
            </p>
          ) : (
            <ChartContainer
              config={{
                hours: {
                  ...CHART_CONFIG.hours,
                  label: t("reports.chartHours"),
                },
              }}
              className="aspect-auto h-[220px] w-full"
            >
              <BarChart
                data={topEmployees}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
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
                  dataKey="hours"
                  fill="var(--chart-1)"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </ChartPanel>

        {/* Status split — donut */}
        <ChartPanel title={t("reports.otStatusSplit")}>
          {statusSeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("reports.chartNoData")}
            </p>
          ) : (
            <ChartContainer
              config={Object.fromEntries(
                statusSeries.map((d) => [
                  d.status,
                  { label: d.name, color: d.fill },
                ]),
              )}
              className="aspect-auto h-[220px] w-full"
            >
              <PieChart>
                <ChartTooltipContent />
                <Pie
                  data={statusSeries}
                  dataKey="hours"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {statusSeries.map((d, i) => (
                    <Cell
                      key={d.status}
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

        {/* Employee-wise summary table in a panel for visual balance */}
        {Object.keys(employeeSummary).length > 0 && (
          <ChartPanel title={t("reports.employeeWiseSummary")}>
            <div className="max-h-[220px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.employee")}</TableHead>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead className="text-center">
                      {t("reports.logs")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("reports.totalOt")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("reports.approvedOt")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.values(employeeSummary)
                    .sort((a, b) => b.totalHours - a.totalHours)
                    .map((emp) => (
                      <TableRow key={emp.employee}>
                        <TableCell>{emp.employee}</TableCell>
                        <TableCell>{emp.employee_name || "—"}</TableCell>
                        <TableCell className="text-center">
                          {emp.logCount}
                        </TableCell>
                        <TableCell className="text-end font-semibold">
                          {emp.totalHours.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-end text-emerald-600">
                          {emp.approvedHours.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </ChartPanel>
        )}
      </ChartGrid>

      {/* ── Detailed Log Table ── */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-5">
          <Spinner className="size-5 text-primary" />
          <span className="text-sm text-muted-foreground">
            {t("common.loading")}
          </span>
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-none bg-card p-5 text-center ring-1 ring-foreground/10">
          <Hourglass className="mx-auto size-12 text-muted-foreground" />
          <h5 className="mt-3 text-lg font-semibold">
            {t("reports.noOvertimeRecords")}
          </h5>
          <p className="text-muted-foreground">
            {t("reports.noOvertimeFound", { month: monthLabel, year })}
          </p>
        </div>
      ) : (
        <div className="rounded-none bg-card ring-1 ring-foreground/10">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
            <List className="size-4" />
            {t("reports.detailedLogs", { count: logs.length })}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("reports.employee")}</TableHead>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("reports.shift")}</TableHead>
                  <TableHead>{t("reports.inTime")}</TableHead>
                  <TableHead>{t("reports.outTime")}</TableHead>
                  <TableHead className="text-end">
                    {t("reports.otHours")}
                  </TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("reports.remarks")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.name}>
                    <TableCell>{log.attendance_date || "—"}</TableCell>
                    <TableCell>{log.employee}</TableCell>
                    <TableCell>{log.employee_name || "—"}</TableCell>
                    <TableCell>{log.shift || "—"}</TableCell>
                    <TableCell>{formatDateTime(log.in_time)}</TableCell>
                    <TableCell>{formatDateTime(log.out_time)}</TableCell>
                    <TableCell className="text-end font-semibold">
                      {log.overtime_hours || 0}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadge(log.status)}>
                        {statusLabel(log.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.remarks || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {!hasChartData && loading ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : null}
    </DashboardShell>
  );
}
