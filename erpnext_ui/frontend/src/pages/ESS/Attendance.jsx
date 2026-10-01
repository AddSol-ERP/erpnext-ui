import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../context/HeaderContext";
import { get } from "../../services/api";
import {
  fetchMonthlyAttendance,
  daySetForRow,
} from "../../utils/monthlyAttendance";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  LogIn,
  LogOut,
  CalendarPlus,
  CalendarX,
  Pencil,
  Check,
  UserX,
  Clock,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import DashboardShell from "../../components/dashboard/DashboardShell";
import AppModal from "../../components/AppModal";
import CheckinLogs from "../../components/CheckinLogs";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const LEGEND = [
  {
    key: "present",
    mark: "✓",
    className: "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30",
  },
  {
    key: "lateHalfDay",
    mark: "~",
    className: "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30",
  },
  {
    key: "absent",
    mark: "×",
    className: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
  },
  {
    key: "missing",
    mark: "!",
    className: "bg-destructive/10 text-destructive ring-1 ring-destructive/25",
  },
  {
    key: "weeklyOff",
    mark: "W",
    className: "bg-muted text-muted-foreground ring-1 ring-border",
  },
  {
    key: "holiday",
    mark: "H",
    className: "bg-sky-500/15 text-sky-600 ring-1 ring-sky-500/30",
  },
  {
    key: "future",
    mark: "→",
    className: "bg-primary/10 text-primary ring-1 ring-primary/25",
  },
];

function formatTime(timeStr) {
  if (!timeStr) return "";
  const parts = timeStr.split(" ");
  const timePart = parts[parts.length - 1];
  const [h, m] = timePart.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function formatDayTitle(dateStr, locale) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * ESS Attendance — no-scroll desktop layout: toolbar + fill-height calendar.
 * Mobile: horizontal scroll for readable cells; compact cell content; tap
 * opens day detail/actions modal.
 */
export default function AttendanceCalendar() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t, i18n } = useTranslation();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [employee, setEmployee] = useState(null);
  const [empName, setEmpName] = useState("");
  const [attendance, setAttendance] = useState({});
  const [weeklyOff, setWeeklyOff] = useState(new Set());
  const [holidays, setHolidays] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [checkinDate, setCheckinDate] = useState(null);
  const [activeDay, setActiveDay] = useState(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  useEffect(() => {
    setHeader({
      title: t("ess.header.attendanceTitle"),
      subtitle: empName
        ? t("ess.header.attendanceSubtitleEmployee", { name: empName })
        : t("ess.header.attendanceSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.ess"), path: "/ess" },
        { label: t("ess.header.attendanceCrumb") },
      ],
      actions: [
        {
          label: t("common.back"),
          variant: "btn-outline-secondary",
          onClick: () => navigate("/ess"),
        },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empName]);

  // fetchEmployee setStates only after awaited API responses.
  async function fetchEmployee() {
    try {
      let userId = "";
      if (window.frappe?.session?.user) {
        userId = window.frappe.session.user;
      } else {
        const userRes = await get("method/erpnext_ui.api.get_current_user");
        userId = userRes?.message?.user || "";
      }
      if (!userId) return;

      const res = await get("method/frappe.client.get_list", {
        doctype: "Employee",
        fields: JSON.stringify(["name", "employee_name"]),
        filters: JSON.stringify([["user_id", "=", userId]]),
        limit_page_length: 1,
      });
      const list = res.message || [];
      if (list.length > 0) {
        setEmployee(list[0].name);
        setEmpName(list[0].employee_name || list[0].name);
      }
    } catch (e) {
      console.error("Failed to fetch employee:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // fetchEmployee setStates only after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEmployee();
  }, []);

  // fetchAttendance setStates only after awaited API responses.
  const fetchAttendance = useCallback(async () => {
    if (!employee) return;
    setLoading(true);

    const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0);
    const lastDayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

    try {
      const res = await get("resource/Attendance", {
        fields: JSON.stringify([
          "name", "attendance_date", "status", "in_time", "out_time",
          "shift", "employee_name",
        ]),
        filters: JSON.stringify([
          ["employee", "=", employee],
          ["attendance_date", "Between", [firstDay, lastDayStr]],
        ]),
        order_by: "attendance_date asc",
        limit_page_length: 100,
      });

      const data = res.data || [];
      const map = {};
      data.forEach((a) => {
        map[a.attendance_date] = {
          status: a.status,
          in_time: a.in_time,
          out_time: a.out_time,
          shift: a.shift,
          employee_name: a.employee_name,
        };
      });
      setAttendance(map);
    } catch (e) {
      console.error("Failed to fetch attendance:", e);
    } finally {
      setLoading(false);
    }
  }, [employee, year, month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    if (!employee) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchMonthlyAttendance({
          year: currentMonth.getFullYear(),
          month: currentMonth.getMonth() + 1,
          employee,
        });
        const row = (res.rows || [])[0];
        if (!cancelled) {
          setWeeklyOff(daySetForRow(row, "WO"));
          setHolidays(daySetForRow(row, "H"));
        }
      } catch (e) {
        console.error("Failed to load weekly off / holidays:", e);
        if (!cancelled) {
          setWeeklyOff(new Set());
          setHolidays(new Set());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [employee, currentMonth]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  const monthLabel = currentMonth.toLocaleString(i18n.language, {
    month: "long",
    year: "numeric",
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cellDate = new Date(year, month, d);
    const isToday =
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === d;
    const isPast =
      cellDate <
      new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const att = attendance[dateStr] || null;
    const isWeeklyOff = !att && weeklyOff.has(dateStr);
    const isHoliday = !att && holidays.has(dateStr);
    cells.push({ day: d, dateStr, isToday, isPast, att, isWeeklyOff, isHoliday });
  }

  // Always 6 rows so calendar height is stable (5- and 6-week months).
  while (cells.length < 42) cells.push(null);

  const handleApplyLeave = (dateStr) => {
    navigate(`/requests/leave/new?from_date=${dateStr}`);
  };

  const handleRequestAttendance = (dateStr) => {
    navigate(`/requests/attendance/new?from_date=${dateStr}&to_date=${dateStr}`);
  };

  const handleDayClick = (cell) => {
    if (!cell) return;
    if (cell.att?.status === "Present") {
      setCheckinDate(cell.dateStr);
      return;
    }
    // Absent / Half Day / Late / Missing / Leave — detail + actions on any size
    const status = cell.att?.status || "";
    const isProblematic =
      status === "Absent" || status === "Half Day" || status === "Late";
    const isMissing = !cell.att && cell.isPast && !cell.isWeeklyOff && !cell.isHoliday;
    if (isProblematic || isMissing || status === "On Leave") {
      setActiveDay(cell);
    }
  };

  const kpis = useMemo(() => {
    const values = Object.values(attendance);
    return {
      present: values.filter((a) => a.status === "Present").length,
      absent: values.filter((a) => a.status === "Absent").length,
      leave: values.filter((a) => a.status === "On Leave").length,
      halfDay: values.filter(
        (a) => a.status === "Half Day" || a.status === "Late",
      ).length,
    };
  }, [attendance]);

  const kpiChips = [
    {
      key: "present",
      label: t("ess.attendance.present"),
      value: kpis.present,
      icon: Check,
      dot: "bg-emerald-500",
    },
    {
      key: "absent",
      label: t("ess.attendance.absent"),
      value: kpis.absent,
      icon: UserX,
      dot: "bg-destructive",
    },
    {
      key: "leave",
      label: t("ess.attendance.leave"),
      value: kpis.leave,
      icon: CalendarX,
      dot: "bg-[var(--chart-1)]",
    },
    {
      key: "halfDay",
      label: t("ess.attendance.halfDay"),
      value: kpis.halfDay,
      icon: Clock,
      dot: "bg-amber-500",
    },
  ];

  const activeDayStatus = activeDay
    ? activeDay.att?.status ||
      (activeDay.isWeeklyOff
        ? t("ess.attendance.weeklyOff")
        : activeDay.isHoliday
          ? t("ess.attendance.holiday")
          : activeDay.isPast
            ? t("ess.attendance.missing")
            : t("ess.attendance.future"))
    : "";
  const activeDayNeedsActions =
    activeDay &&
    (activeDay.att?.status === "Absent" ||
      activeDay.att?.status === "Half Day" ||
      activeDay.att?.status === "Late" ||
      (!activeDay.att &&
        activeDay.isPast &&
        !activeDay.isWeeklyOff &&
        !activeDay.isHoliday));

  if (!employee && loading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center gap-3 rounded-none bg-card py-16 text-muted-foreground ring-1 ring-foreground/10">
          <Spinner className="size-6 text-primary" />
          <span className="text-sm">{t("ess.attendance.loadingEmployee")}</span>
        </div>
      </DashboardShell>
    );
  }

  if (!employee) {
    return (
      <DashboardShell>
        <div className="flex items-start gap-2 rounded-none border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("ess.attendance.noEmployee")}
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="flex w-full flex-col gap-3 md:flex-row md:items-stretch">
      {/* Calendar: mobile last (BL+BR); desktop left column (TL+BL) */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-card p-2 ring-1 ring-foreground/10 md:p-3">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-none bg-card/70 text-sm text-muted-foreground backdrop-blur-sm">
            <Spinner className="size-4 text-primary" />
            {t("ess.attendance.loadingRecords")}
          </div>
        )}

        <div className="overflow-x-auto overscroll-x-contain">
          <div className="min-w-[440px] sm:min-w-0">
            <div className="grid shrink-0 grid-cols-7 gap-1.5 pb-1.5">
              {DAY_KEYS.map((k) => (
                <div
                  key={k}
                  className="rounded-lg bg-muted/60 py-1 text-center text-[11px] font-semibold text-muted-foreground"
                >
                  {t(`ess.attendance.days.${k}`)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 grid-rows-6 gap-1.5">
              {cells.map((cell, idx) =>
                cell === null ? (
                  <div key={`blank-${idx}`} className="h-full min-h-[72px]" />
                ) : (
                  <DayCell
                    key={cell.dateStr}
                    cell={cell}
                    onApplyLeave={handleApplyLeave}
                    onRequestAttendance={handleRequestAttendance}
                    onDayClick={handleDayClick}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right rail: mobile first (TL+TR); desktop right column (TR+BR) */}
      <aside className="max-md:order-first flex w-full shrink-0 flex-col md:w-[240px] lg:w-[260px]">
        <div className="flex flex-col gap-4 rounded-none bg-card px-3 py-3 ring-1 ring-foreground/10 md:gap-5">
          {/* Month nav */}
          <div className="flex shrink-0 items-center justify-between gap-1.5 md:justify-center">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={prevMonth}
              aria-label={t("ess.attendance.prevMonth")}
            >
              <ChevronLeft className="rtl:-rotate-180" />
            </Button>
            <h2 className="text-sm font-semibold leading-none md:min-w-[7.5rem] md:text-center">
              {monthLabel}
            </h2>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={nextMonth}
              disabled={isCurrentMonth}
              aria-label={t("ess.attendance.nextMonth")}
            >
              <ChevronRight className="rtl:-rotate-180" />
            </Button>
          </div>

          {/* KPI chips — horizontal wrap on mobile, vertical stack on rail */}
          <div className="flex flex-wrap items-center gap-1.5 md:flex-col md:items-stretch md:gap-2">
            {kpiChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground md:justify-start md:rounded-lg md:px-2.5 md:py-2"
                title={chip.label}
              >
                <span
                  className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full ${chip.dot} text-[8px] font-bold text-white`}
                  aria-hidden="true"
                />
                <span className="font-semibold tabular-nums text-foreground">
                  {loading ? "—" : chip.value}
                </span>
                <span className="hidden sm:inline md:inline">{chip.label}</span>
              </span>
            ))}
          </div>

          {/* Legend — hidden on phone; full labels on rail */}
          <div className="hidden shrink-0 flex-col gap-1.5 sm:flex md:border-t md:border-border md:pt-4">
            {LEGEND.map((item) => {
              const label = t(`ess.attendance.legend.${item.key}`);
              return (
                <span
                  key={item.key}
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground"
                  title={label}
                >
                  <span
                    className={`inline-flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${item.className}`}
                    aria-hidden="true"
                  >
                    {item.mark}
                  </span>
                  <span className="md:inline">{label}</span>
                  <span className="sr-only">{label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Day detail + actions (absent / missing / leave / half day) */}
      <AppModal
        show={!!activeDay}
        onClose={() => setActiveDay(null)}
        title={
          activeDay
            ? formatDayTitle(activeDay.dateStr, i18n.language)
            : ""
        }
        width="sm"
      >
        {activeDay ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{activeDayStatus}</span>
              {activeDay.isToday && (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary">
                  {t("ess.attendance.today")}
                </span>
              )}
            </div>

            {activeDay.att?.in_time && (
              <div className="flex items-center gap-2 text-sm">
                <LogIn className="size-4 text-emerald-600" />
                <span className="text-muted-foreground">
                  {t("ess.overtime.columns.inTime")}
                </span>
                <span className="font-medium">
                  {formatTime(activeDay.att.in_time)}
                </span>
              </div>
            )}
            {activeDay.att?.out_time && (
              <div className="flex items-center gap-2 text-sm">
                <LogOut className="size-4 text-destructive" />
                <span className="text-muted-foreground">
                  {t("ess.overtime.columns.outTime")}
                </span>
                <span className="font-medium">
                  {formatTime(activeDay.att.out_time)}
                </span>
              </div>
            )}
            {activeDay.att?.shift && (
              <div className="text-sm text-muted-foreground">
                {activeDay.att.shift}
              </div>
            )}

            {activeDayNeedsActions && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    const dateStr = activeDay.dateStr;
                    setActiveDay(null);
                    handleApplyLeave(dateStr);
                  }}
                >
                  <CalendarPlus className="size-4" />
                  {t("ess.attendance.leaveAction")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                  onClick={() => {
                    const dateStr = activeDay.dateStr;
                    setActiveDay(null);
                    handleRequestAttendance(dateStr);
                  }}
                >
                  <Pencil className="size-4" />
                  {t("ess.attendance.attendanceAction")}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </AppModal>

      {/* Check-in logs for Present days */}
      <AppModal
        show={!!checkinDate}
        onClose={() => setCheckinDate(null)}
        title={t("ess.attendance.checkinLogs", { date: checkinDate || "" })}
        width="lg"
      >
        {checkinDate ? (
          <CheckinLogs date={checkinDate} employee={employee} />
        ) : null}
      </AppModal>
    </DashboardShell>
  );
}

function DayCell({
  cell,
  onApplyLeave,
  onRequestAttendance,
  onDayClick,
}) {
  const { t } = useTranslation();
  const { day, dateStr, isToday, isPast, att, isWeeklyOff, isHoliday } = cell;

  let cellClass =
    "relative flex h-full min-h-[72px] flex-col overflow-hidden rounded-xl p-1 text-[11px] transition-all";
  let statusClass = "future";
  let bg = "bg-background/40";

  if (isToday) {
    cellClass += " ring-2 ring-primary";
  }

  const attStatus = att?.status || "";
  const isProblematic =
    attStatus === "Absent" || attStatus === "Half Day" || attStatus === "Late";
  const isPresent = attStatus === "Present";
  const isMissing =
    !att && isPast && !isWeeklyOff && !isHoliday;
  const isOpenable = isPresent || isProblematic || isMissing || attStatus === "On Leave";

  if (att) {
    if (isPresent) {
      bg = "bg-emerald-500/15 hover:bg-emerald-500/20";
      statusClass = "present";
    } else if (attStatus === "Half Day" || attStatus === "Late") {
      bg = "bg-amber-500/15";
      statusClass = "late";
    } else if (attStatus === "On Leave") {
      bg = "bg-primary/12";
      statusClass = "leave";
    } else if (attStatus === "Absent") {
      bg = "bg-destructive/12";
      statusClass = "absent";
    } else {
      bg = "bg-muted/50";
      statusClass = "present";
    }
  } else if (isWeeklyOff) {
    bg = "bg-muted/60";
    statusClass = "weeklyoff";
  } else if (isHoliday) {
    bg = "bg-sky-500/12";
    statusClass = "holiday";
  } else if (isPast) {
    bg = "bg-destructive/8";
    statusClass = "missing";
  } else {
    bg = "bg-background/40";
  }

  if (isOpenable) {
    cellClass += " cursor-pointer hover:shadow-sm hover:ring-1";
    if (isPresent) cellClass += " hover:ring-emerald-500/40";
  }

  const mobileMark = isPresent
    ? "✓"
    : attStatus === "Absent"
      ? "×"
      : attStatus === "Half Day" || attStatus === "Late"
        ? "~"
        : attStatus === "On Leave"
          ? t("ess.attendance.leave")
          : isMissing
            ? "!"
            : isWeeklyOff
              ? t("ess.attendance.weeklyOffShort")
              : isHoliday
                ? t("ess.attendance.holidayShort")
                : "—";

  const clickableProps = isOpenable
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": `${day} — ${attStatus || (isMissing ? t("ess.attendance.missing") : "")}`,
        onClick: () => onDayClick(cell),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDayClick(cell);
          }
        },
      }
    : {};

  return (
    <div
      className={`${cellClass} ${bg}`}
      data-status={statusClass}
      {...clickableProps}
    >
      <div className="flex shrink-0 items-center justify-between gap-1">
        <span
          className={`text-[0.8rem] font-bold leading-none ${isToday ? "text-primary" : ""}`}
        >
          {day}
        </span>
        {isToday && (
          <span className="hidden rounded bg-primary/15 px-1 py-px text-[0.55rem] font-semibold leading-tight text-primary sm:inline">
            {t("ess.attendance.today")}
          </span>
        )}
      </div>

      {/* Mobile compact mark — prevents overflow */}
      <div className="mt-1 flex flex-1 items-center justify-center sm:hidden">
        <span
          className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded px-1 text-[0.7rem] font-bold ${
            isPresent
              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : isProblematic || isMissing
                ? "bg-destructive/15 text-destructive"
                : attStatus === "On Leave"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground"
          }`}
        >
          {mobileMark}
        </span>
      </div>

      {/* Desktop / sm+ detailed content */}
      <div className="mt-0.5 hidden min-h-0 flex-1 flex-col justify-start leading-snug sm:flex">
        {att ? (
          <>
            {att.in_time && (
              <div className="flex items-center gap-1">
                <LogIn className="size-3 shrink-0 text-emerald-600" />
                <span className="font-medium">{formatTime(att.in_time)}</span>
              </div>
            )}
            {att.out_time && (
              <div className="flex items-center gap-1">
                <LogOut className="size-3 shrink-0 text-destructive" />
                <span className="font-medium">{formatTime(att.out_time)}</span>
              </div>
            )}
            {att.in_time && att.out_time && att.shift && (
              <div className="truncate text-[0.6rem] text-muted-foreground">
                {att.shift}
              </div>
            )}
            {!att.in_time && !att.out_time && (
              <span className="font-semibold">
                {att.status === "On Leave"
                  ? t("ess.attendance.onLeave")
                  : att.status}
              </span>
            )}
            {isProblematic && (
              <div className="mt-auto grid grid-cols-2 gap-1 pt-1">
                <Button
                  variant="outline"
                  size="xs"
                  className="border-destructive/40 px-1 text-[0.6rem] leading-tight text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApplyLeave(dateStr);
                  }}
                  title={t("ess.attendance.createLeave")}
                >
                  <CalendarPlus className="size-3" />
                  {t("ess.attendance.leaveAction")}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  className="border-amber-500/40 px-1 text-[0.6rem] leading-tight text-amber-600 hover:bg-amber-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestAttendance(dateStr);
                  }}
                  title={t("ess.attendance.requestCorrection")}
                >
                  <Pencil className="size-3" />
                  {t("ess.attendance.attendanceAction")}
                </Button>
              </div>
            )}
          </>
        ) : isWeeklyOff ? (
          <div className="flex flex-1 items-center justify-center">
            <span
              className="inline-flex size-5 items-center justify-center rounded bg-muted text-[0.7rem] font-bold text-muted-foreground ring-1 ring-border"
              title={t("ess.attendance.weeklyOff")}
            >
              {t("ess.attendance.weeklyOffShort")}
            </span>
          </div>
        ) : isHoliday ? (
          <div className="flex flex-1 items-center justify-center">
            <span
              className="inline-flex size-5 items-center justify-center rounded bg-sky-500/20 text-[0.7rem] font-bold text-sky-600 ring-1 ring-sky-500/30"
              title={t("ess.attendance.holiday")}
            >
              {t("ess.attendance.holidayShort")}
            </span>
          </div>
        ) : isPast ? (
          <div className="mt-0.5 flex flex-1 flex-col gap-1">
            <div className="text-[0.7rem] font-semibold text-destructive">
              {t("ess.attendance.missing")}
            </div>
            <div className="mt-auto grid grid-cols-2 gap-1">
              <Button
                variant="outline"
                size="xs"
                className="border-destructive/40 px-1 text-[0.6rem] leading-tight text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyLeave(dateStr);
                }}
                title={t("ess.attendance.createLeave")}
              >
                <CalendarPlus className="size-3" />
                {t("ess.attendance.leaveAction")}
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="border-amber-500/40 px-1 text-[0.6rem] leading-tight text-amber-600 hover:bg-amber-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestAttendance(dateStr);
                }}
                title={t("ess.attendance.requestCorrection")}
              >
                <Pencil className="size-3" />
                {t("ess.attendance.attendanceAction")}
              </Button>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
