import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { get } from "../../../services/api";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchMonthlyAttendance,
  daySetForRow,
} from "../../../utils/monthlyAttendance";

const DAY_KEYS = [
  "reports.sun",
  "reports.mon",
  "reports.tue",
  "reports.wed",
  "reports.thu",
  "reports.fri",
  "reports.sat",
];

export default function AttendanceCalendar({
  month,
  employee,
  department,
  onDateClick,
}) {
  const { t } = useTranslation();
  const [data, setData] = useState({});
  const [teamData, setTeamData] = useState({});
  const [weeklyOff, setWeeklyOff] = useState(new Set());
  const [holidays, setHolidays] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const filters = [["attendance_date", "between", [start, end]]];

      if (employee) {
        filters.push(["employee", "=", employee]);
      }

      if (department) {
        filters.push(["department", "=", department]);
      }

      const res = await get("resource/Attendance", {
        fields: JSON.stringify(["attendance_date", "status", "employee"]),
        filters: JSON.stringify(filters),
        limit_page_length: 2000,
      });

      const list = res.data || [];

      // SINGLE EMPLOYEE MODE
      const map = {};

      // TEAM MODE
      const teamMap = {};

      list.forEach((d) => {
        const date = d.attendance_date;

        // single
        map[date] = d.status;

        // team
        if (!teamMap[date]) {
          teamMap[date] = {
            Present: 0,
            Absent: 0,
            "Half Day": 0,
            "On Leave": 0,
          };
        }

        if (teamMap[date][d.status] !== undefined) {
          teamMap[date][d.status]++;
        }
      });

      setData(map);
      setTeamData(teamMap);

      // Weekly off + holiday dates for the selected employee (employee mode only)
      if (employee) {
        try {
          const res = await fetchMonthlyAttendance({
            year: month.getFullYear(),
            month: month.getMonth() + 1,
            employee,
          });
          const myRow = (res.rows || [])[0];
          setWeeklyOff(daySetForRow(myRow, "WO"));
          setHolidays(daySetForRow(myRow, "H"));
        } catch (e) {
          console.error("Failed to load weekly off / holidays:", e);
          setWeeklyOff(new Set());
          setHolidays(new Set());
        }
      } else {
        setWeeklyOff(new Set());
        setHolidays(new Set());
      }
    } catch (e) {
      console.error("Failed to load attendance:", e);
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // load only setStates after awaited API responses; the compiler rule
    // conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, employee, department]);

  /* ================= LOADING / ERROR ================= */
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-5">
        <Spinner className="size-5 text-primary" />
        <span className="text-sm text-muted-foreground">
          {t("common.loading")}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
        {error}
      </div>
    );
  }

  /* ================= CALC ================= */
  const firstDayIndex = start.getDay();
  const totalDays = end.getDate();

  const statusLabel = (status) => {
    if (status === "Present") return t("reports.present");
    if (status === "Absent") return t("reports.absent");
    if (status === "Half Day") return t("reports.halfDay");
    return status;
  };

  const statusClass = (status) => {
    if (status === "Present")
      return "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30";
    if (status === "Absent")
      return "bg-destructive/15 text-destructive ring-destructive/30";
    if (status === "Half Day")
      return "bg-amber-500/15 text-amber-600 ring-amber-500/30";
    return "bg-primary/15 text-primary ring-primary/30";
  };

  const cells = [];

  // Empty cells
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push(<div key={`empty-${i}`} />);
  }

  for (let i = 1; i <= totalDays; i++) {
    const date = `${month.getFullYear()}-${String(
      month.getMonth() + 1,
    ).padStart(2, "0")}-${String(i).padStart(2, "0")}`;

    const status = data[date];
    const team = teamData[date];
    const isWeeklyOff = weeklyOff.has(date);
    const isHoliday = holidays.has(date);
    const isDayOff = isWeeklyOff || isHoliday;

    cells.push(
      <div
        key={i}
        className={`flex min-h-[90px] flex-col justify-between rounded-lg border border-border p-2 ${
          isWeeklyOff
            ? "bg-slate-500/10"
            : isHoliday
              ? "bg-teal-500/10"
              : "bg-card"
        } ${employee ? "cursor-pointer opacity-100" : "cursor-default opacity-70"}`}
        onClick={() =>
          employee &&
          onDateClick &&
          onDateClick(date, employee, status, isDayOff)
        }
      >
        {/* DAY */}
        <div className="text-xs font-medium">{i}</div>

        {/* ================= MODE SWITCH ================= */}

        {/* EMPLOYEE MODE */}
        {employee ? (
          status ? (
            <div
              className={`inline-flex w-fit items-center justify-center rounded-4xl px-2 py-0.5 text-[11px] font-medium ${statusClass(status)}`}
            >
              {statusLabel(status)}
            </div>
          ) : isWeeklyOff ? (
            <div className="inline-flex w-fit items-center justify-center rounded-4xl bg-slate-500 px-2 py-0.5 text-[11px] font-medium text-white">
              {t("reports.weeklyOff")}
            </div>
          ) : isHoliday ? (
            <div className="inline-flex w-fit items-center justify-center rounded-4xl bg-teal-500 px-2 py-0.5 text-[11px] font-medium text-white">
              {t("reports.holiday")}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">-</div>
          )
        ) : (
          /* TEAM MODE */
          <div className="text-[10px]">
            <div className="text-emerald-600">P: {team?.Present || 0}</div>
            <div className="text-destructive">A: {team?.Absent || 0}</div>
            <div className="text-amber-600">
              H: {team?.["Half Day"] || 0}
            </div>
            <div className="text-primary">L: {team?.["On Leave"] || 0}</div>
          </div>
        )}
      </div>,
    );
  }

  return (
    <div className="rounded-none bg-card p-2 ring-1 ring-foreground/10">
      {/* WEEK HEADER */}
      <div className="mb-2 grid grid-cols-7 text-center text-xs text-muted-foreground">
        {DAY_KEYS.map((key) => (
          <div key={key}>{t(key)}</div>
        ))}
      </div>

      {/* GRID */}
      <div className="grid grid-cols-7 gap-1.5">{cells}</div>
    </div>
  );
}
