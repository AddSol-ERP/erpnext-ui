import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import { fetchMonthlyAttendance } from "../../../utils/monthlyAttendance";

import AttendanceCalendar from "./AttendanceCalendar";
import AttendanceGrid from "./AttendanceGrid";
import AttendanceLegend from "./AttendanceLegend";

import FilterModal from "../../../components/FilterModal";
import AppModal from "../../../components/AppModal";
import CheckinLogs from "../../../components/CheckinLogs";
import AttendanceRequestForm from "../../requests/attendance/AttendanceRequestForm";
import LeaveApplicationForm from "../../requests/leave/LeaveApplicationForm";
import StatCard from "../../../components/StatCard";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import StatRow from "../../../components/dashboard/StatRow";
import ChartPanel from "../../../components/dashboard/ChartPanel";
import ChartGrid from "../../../components/dashboard/ChartGrid";
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

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  UserX,
  X,
} from "lucide-react";

const PIE_COLORS = [
  "var(--chart-2)",
  "var(--destructive)",
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function normalizeStatus(code) {
  if (code === "HD/A" || code === "HD/P") return "HD";
  return code || "";
}

export default function AttendancePage() {
  const { setHeader } = useHeader();
  const { t, i18n } = useTranslation();

  const [view, setView] = useState("calendar");
  const [month, setMonth] = useState(new Date());

  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({
    employee: "",
    department: "",
  });

  // Page-level matrix data for KPIs + charts view
  const [matrix, setMatrix] = useState({ rows: [], days: [], can_view_others: false });
  const [loadingMatrix, setLoadingMatrix] = useState(true);

  // Modal state for check-in logs / request creation
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [requestType, setRequestType] = useState("attendance"); // "attendance" or "leave"

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: t("reports.attendanceTitle"),
      subtitle: t("reports.attendanceSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.reports"), path: "/reports" },
        { label: t("reports.attendanceTitle") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= PAGE-LEVEL MATRIX (KPIs + charts) ================= */
  useEffect(() => {
    let cancelled = false;
    // loading flag is set before the awaited fetch; compiler rule flags any
    // setState reached from an effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMatrix(true);
    (async () => {
      try {
        const res = await fetchMonthlyAttendance({
          year: month.getFullYear(),
          month: month.getMonth() + 1,
          department: filters.department,
          employee: filters.employee,
        });
        if (cancelled) return;
        setMatrix({
          rows: res.rows || [],
          days: res.days || [],
          can_view_others: !!res.can_view_others,
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) setMatrix({ rows: [], days: [], can_view_others: false });
      } finally {
        if (!cancelled) setLoadingMatrix(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, filters.employee, filters.department]);

  /* ================= DERIVED (KPIs + charts) ================= */
  const statusLabel = (code) => {
    if (code === "P") return t("reports.present");
    if (code === "A") return t("reports.absent");
    if (code === "HD") return t("reports.halfDay");
    if (code === "L") return t("reports.onLeave");
    if (code === "WFH") return t("reports.wfh");
    if (code === "WO") return t("reports.weeklyOff");
    if (code === "H") return t("reports.holiday");
    return t("reports.noData");
  };

  const kpis = useMemo(() => {
    const counts = { P: 0, A: 0, HD: 0, L: 0, WFH: 0, "": 0 };
    matrix.rows.forEach((row) => {
      Object.values(row.statuses || {}).forEach((raw) => {
        const code = normalizeStatus(raw);
        // Treat WFH as present for KPI present count + keep separate
        if (code === "WFH") {
          counts.WFH += 1;
          counts.P += 1;
        } else if (code in counts) {
          counts[code] += 1;
        }
      });
    });
    return counts;
  }, [matrix.rows]);

  const statusSeries = useMemo(() => {
    const counts = { P: 0, A: 0, HD: 0, L: 0, WFH: 0, "": 0 };
    matrix.rows.forEach((row) => {
      Object.values(row.statuses || {}).forEach((raw) => {
        const code = normalizeStatus(raw);
        if (code in counts) counts[code] += 1;
      });
    });
    // Prefer distinct slices: Present (P only), Absent, Half Day, On Leave, WFH, No Data
    const series = [
      { key: "P", name: statusLabel("P"), value: counts.P - counts.WFH },
      { key: "A", name: statusLabel("A"), value: counts.A },
      { key: "HD", name: statusLabel("HD"), value: counts.HD },
      { key: "L", name: statusLabel("L"), value: counts.L },
      { key: "WFH", name: statusLabel("WFH"), value: counts.WFH },
      { key: "", name: statusLabel(""), value: counts[""] },
    ].filter((d) => d.value > 0);
    return series;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix.rows, t]);

  const dailySeries = useMemo(() => {
    const days = matrix.days || [];
    return days.map((date) => {
      const bucket = { date, present: 0, absent: 0, halfDay: 0, leave: 0 };
      matrix.rows.forEach((row) => {
        const raw = row.statuses?.[date];
        const code = normalizeStatus(raw);
        if (code === "P" || code === "WFH") bucket.present += 1;
        else if (code === "A") bucket.absent += 1;
        else if (code === "HD") bucket.halfDay += 1;
        else if (code === "L") bucket.leave += 1;
      });
      return bucket;
    });
  }, [matrix.rows, matrix.days]);

  const attendanceRateSeries = useMemo(() => {
    if (!matrix.can_view_others) return [];
    return matrix.rows
      .map((row) => {
        let present = 0;
        let working = 0;
        Object.values(row.statuses || {}).forEach((raw) => {
          const code = normalizeStatus(raw);
          if (code === "WO" || code === "H" || code === "") return;
          working += 1;
          if (code === "P" || code === "WFH") present += 1;
          else if (code === "HD") present += 0.5;
        });
        const rate = working > 0 ? Math.round((present / working) * 100) : 0;
        return {
          name: row.employee_name || row.employee,
          rate,
        };
      })
      .filter((d) => d.name)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8);
  }, [matrix.rows, matrix.can_view_others]);

  const hasChartData =
    statusSeries.length > 0 || dailySeries.some((d) => d.present + d.absent + d.halfDay + d.leave > 0);

  /* ================= FILTER CONFIG ================= */
  const filterConfig = {
    filters: [
      {
        label: t("reports.employee"),
        field: "employee",
        type: "link",
        doctype: "Employee",
      },
      {
        label: t("reports.department"),
        field: "department",
        type: "link",
        doctype: "Department",
      },
    ],
  };

  /* ================= HANDLERS ================= */
  const handleDateClick = (date, employee, status, isWeeklyOff = false) => {
    setSelectedDate(date);
    setSelectedEmployee(employee);
    setSelectedStatus(status);

    // Show check-in logs for present status
    if (status === "Present") {
      setShowCheckinModal(true);
    } else if (status === "Absent" || (!status && !isWeeklyOff)) {
      // Show request options for absent / no-data days (skip weekly offs)
      setShowRequestModal(true);
    }
  };

  const handleCreateRequest = (type) => {
    setRequestType(type);
    setShowRequestModal(true);
  };

  const statusChartConfig = Object.fromEntries(
    statusSeries.map((d, i) => [
      d.key || "none",
      { label: d.name, color: PIE_COLORS[i % PIE_COLORS.length] },
    ]),
  );

  /* ================= UI ================= */
  return (
    <DashboardShell>
      {/* FILTER MODAL */}
      <FilterModal
        show={showFilter}
        onClose={() => setShowFilter(false)}
        config={filterConfig}
        initialFilters={filters}
        onApply={(f) => setFilters(f)}
      />

      {/* KPIs */}
      <StatRow>
        <StatCard
          value={loadingMatrix ? "—" : kpis.P}
          label={t("reports.present")}
          icon={CalendarCheck}
          color="var(--chart-2)"
          loading={loadingMatrix}
        />
        <StatCard
          value={loadingMatrix ? "—" : kpis.A}
          label={t("reports.absent")}
          icon={UserX}
          color="var(--destructive)"
          loading={loadingMatrix}
        />
        <StatCard
          value={loadingMatrix ? "—" : kpis.HD}
          label={t("reports.halfDay")}
          icon={CalendarDays}
          color="var(--chart-3)"
          loading={loadingMatrix}
        />
        <StatCard
          value={loadingMatrix ? "—" : kpis.L}
          label={t("reports.onLeave")}
          icon={CalendarX}
          color="var(--chart-1)"
          loading={loadingMatrix}
        />
      </StatRow>

      {/* CONTROLS */}
      <div className="sticky z-10 pb-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {/* LEFT: views */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={view === "calendar" ? "default" : "outline"}
              onClick={() => setView("calendar")}
            >
              <CalendarDays className="size-4" />
              {t("reports.calendar")}
            </Button>

            <Button
              variant={view === "grid" ? "default" : "outline"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="size-4" />
              {t("reports.grid")}
            </Button>

            <Button
              variant={view === "charts" ? "default" : "outline"}
              onClick={() => setView("charts")}
            >
              <BarChart3 className="size-4" />
              {t("reports.charts")}
            </Button>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("common.previous")}
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Button>

            <strong>
              {month.toLocaleString(i18n.language, {
                month: "short",
                year: "numeric",
              })}
            </strong>

            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("common.next")}
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.filter")}
              onClick={() => setShowFilter(true)}
            >
              <Filter className="size-4" />
            </Button>
          </div>
        </div>

        {/* LEGEND */}
        {view !== "charts" && <AttendanceLegend />}
      </div>

      {(filters.employee || filters.department) && (
        <div className="flex flex-wrap gap-2">
          {filters.employee && (
            <Badge variant="secondary">
              {t("reports.empFilter", { value: filters.employee })}
              <button
                type="button"
                aria-label={t("common.clear")}
                className="ms-1 cursor-pointer"
                onClick={() => setFilters((f) => ({ ...f, employee: "" }))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}

          {filters.department && (
            <Badge
              variant="outline"
              className="bg-sky-500/15 text-sky-600 ring-sky-500/30"
            >
              {t("reports.deptFilter", { value: filters.department })}
              <button
                type="button"
                aria-label={t("common.clear")}
                className="ms-1 cursor-pointer"
                onClick={() => setFilters((f) => ({ ...f, department: "" }))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div>
        {/* VIEW */}
        {view === "calendar" ? (
          <AttendanceCalendar
            month={month}
            employee={filters.employee}
            department={filters.department}
            onDateClick={handleDateClick}
          />
        ) : view === "grid" ? (
          <AttendanceGrid
            month={month}
            employee={filters.employee}
            department={filters.department}
            onDateClick={handleDateClick}
          />
        ) : loadingMatrix ? (
          <div className="flex items-center justify-center gap-2 py-5">
            <Spinner className="size-5 text-primary" />
            <span className="text-sm text-muted-foreground">
              {t("common.loading")}
            </span>
          </div>
        ) : !hasChartData ? (
          <div className="rounded-none bg-card p-4 text-center text-muted-foreground ring-1 ring-foreground/10">
            {t("reports.chartNoData")}
          </div>
        ) : (
          <ChartGrid>
            <ChartPanel title={t("reports.attendanceDistribution")}>
              {statusSeries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("reports.chartNoData")}
                </p>
              ) : (
                <ChartContainer
                  config={statusChartConfig}
                  className="aspect-auto h-[220px] w-full"
                >
                  <PieChart>
                    <ChartTooltipContent />
                    <Pie
                      data={statusSeries}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {statusSeries.map((d, i) => (
                        <Cell
                          key={d.key || "none"}
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

            <ChartPanel title={t("reports.dailyAttendance")}>
              {dailySeries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("reports.chartNoData")}
                </p>
              ) : (
                <ChartContainer
                  config={{
                    present: {
                      label: t("reports.present"),
                      color: "var(--chart-2)",
                    },
                    absent: {
                      label: t("reports.absent"),
                      color: "var(--destructive)",
                    },
                    halfDay: {
                      label: t("reports.halfDay"),
                      color: "var(--chart-3)",
                    },
                    leave: {
                      label: t("reports.onLeave"),
                      color: "var(--chart-1)",
                    },
                  }}
                  className="aspect-auto h-[220px] w-full"
                >
                  <BarChart
                    data={dailySeries}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(v) => String(v).slice(8)}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      width={32}
                    />
                    <ChartTooltipContent />
                    <ChartLegend />
                    <Bar
                      dataKey="present"
                      stackId="a"
                      fill="var(--chart-2)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="halfDay"
                      stackId="a"
                      fill="var(--chart-3)"
                    />
                    <Bar dataKey="leave" stackId="a" fill="var(--chart-1)" />
                    <Bar
                      dataKey="absent"
                      stackId="a"
                      fill="var(--destructive)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </ChartPanel>

            {attendanceRateSeries.length > 0 && (
              <ChartPanel
                title={t("reports.attendanceRate")}
                className="md:col-span-2"
              >
                <ChartContainer
                  config={{
                    rate: {
                      label: t("reports.chartCount"),
                      color: "var(--chart-1)",
                    },
                  }}
                  className="aspect-auto h-[220px] w-full"
                >
                  <BarChart
                    data={attendanceRateSeries}
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
                      fill="var(--chart-1)"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>
            )}
          </ChartGrid>
        )}
      </div>

      {/* CHECK-IN LOGS MODAL */}
      <AppModal
        show={showCheckinModal}
        onClose={() => setShowCheckinModal(false)}
        title={t("reports.checkinLogs", { date: selectedDate })}
        width="lg"
      >
        <CheckinLogs date={selectedDate} employee={selectedEmployee} />
      </AppModal>

      {/* REQUEST MODAL */}
      <AppModal
        show={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        title={
          selectedStatus === "Absent"
            ? t("reports.createRequest")
            : t("reports.newRequest")
        }
        width="lg"
      >
        {selectedStatus === "Absent" || !selectedStatus ? (
          <div className="mb-4 flex gap-3">
            <Button
              variant="outline"
              className={`flex-1 ${
                requestType === "leave"
                  ? "border-primary bg-primary/10 text-primary"
                  : ""
              }`}
              onClick={() => handleCreateRequest("leave")}
            >
              {t("reports.createLeaveRequest")}
            </Button>
            <Button
              variant="outline"
              className={`flex-1 ${
                requestType === "attendance"
                  ? "border-primary bg-primary/10 text-primary"
                  : ""
              }`}
              onClick={() => handleCreateRequest("attendance")}
            >
              {t("reports.createAttendanceRequest")}
            </Button>
          </div>
        ) : null}

        {requestType === "leave" && <LeaveApplicationForm />}

        {requestType === "attendance" && <AttendanceRequestForm />}
      </AppModal>
    </DashboardShell>
  );
}
