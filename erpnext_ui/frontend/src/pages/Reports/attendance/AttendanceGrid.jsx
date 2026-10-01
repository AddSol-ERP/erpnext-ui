import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchMonthlyAttendance } from "../../../utils/monthlyAttendance";
import { Spinner } from "@/components/ui/spinner";

const CELL = 34;
const EMP_COL = 200;

const WEEKDAY_KEYS = [
  "reports.sun",
  "reports.mon",
  "reports.tue",
  "reports.wed",
  "reports.thu",
  "reports.fri",
  "reports.sat",
];

// Report status abbreviations -> display mapping.
// `color: ""` rows (WO/H) get their day-off chip classes at render time.
// `label` is a business-logic contract (AttendancePage clickStatus compares
// against "Present"/"Absent"/"No Data") — keep it English; `titleKey` is the
// translated tooltip.
const STATUS_MAP = {
  P: {
    short: "P",
    label: "Present",
    titleKey: "reports.present",
    color: "bg-emerald-500/15 text-emerald-600",
  },
  WFH: {
    short: "P",
    label: "Work From Home",
    titleKey: "reports.wfh",
    color: "bg-emerald-500/15 text-emerald-600",
  },
  A: {
    short: "A",
    label: "Absent",
    titleKey: "reports.absent",
    color: "bg-destructive/15 text-destructive",
  },
  "HD/A": {
    short: "H",
    label: "Half Day",
    titleKey: "reports.halfDay",
    color: "bg-amber-500/15 text-amber-600",
  },
  "HD/P": {
    short: "H",
    label: "Half Day",
    titleKey: "reports.halfDay",
    color: "bg-amber-500/15 text-amber-600",
  },
  L: {
    short: "L",
    label: "On Leave",
    titleKey: "reports.onLeave",
    color: "bg-primary/15 text-primary",
  },
  WO: {
    short: "W",
    label: "Weekly Off",
    titleKey: "reports.weeklyOff",
    color: "",
  },
  H: {
    short: "H",
    label: "Holiday",
    titleKey: "reports.holiday",
    color: "",
  },
  "": {
    short: "-",
    label: "No Data",
    titleKey: "reports.noData",
    color: "bg-muted text-muted-foreground",
  },
};

export default function AttendanceGrid({
  month,
  employee,
  department,
  onDateClick,
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ================= LOAD ================= */
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMonthlyAttendance({
        year: month.getFullYear(),
        month: month.getMonth() + 1,
        department,
        employee,
      });

      setRows(res.rows || []);
      setDays(res.days || []);
    } catch (e) {
      console.error(e);
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

  /* ================= STATES ================= */
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

  if (!rows.length) {
    return (
      <div className="rounded-none bg-card p-3 text-center text-muted-foreground ring-1 ring-foreground/10">
        {t("reports.noEmployees")}
      </div>
    );
  }

  const weekTitles = WEEKDAY_KEYS.map((key) => t(key));

  /* ================= UI ================= */
  return (
    <div className="rounded-none bg-card p-2 ring-1 ring-foreground/10">
      <div
        className="overflow-auto"
        style={{
          maxHeight: "calc(100vh - 200px)",
        }}
      >
        {/* HEADER */}
        <div
          className="sticky top-0 z-[3] flex bg-card"
          style={{
            minWidth: EMP_COL + days.length * CELL,
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

          {days.map((d) => {
            const dt = new Date(`${d}T00:00:00`);
            return (
              <div
                key={d}
                title={
                  Number.isNaN(dt.getTime()) ? "" : weekTitles[dt.getDay()]
                }
                className="border-b border-border py-1.5 text-center text-xs text-muted-foreground"
                style={{
                  width: CELL,
                  minWidth: CELL,
                }}
              >
                {Number.isNaN(dt.getTime()) ? d.slice(8) : dt.getDate()}
              </div>
            );
          })}
        </div>

        {/* ROWS */}
        {rows.map((row) => (
          <div
            key={row.employee}
            className="border-b border-border"
            style={{
              display: "flex",
              minWidth: EMP_COL + days.length * CELL,
            }}
          >
            {/* EMPLOYEE */}
            <div
              className="sticky start-0 z-[1] overflow-hidden text-ellipsis whitespace-nowrap bg-card p-2 text-[13px] font-medium"
              style={{
                width: EMP_COL,
                minWidth: EMP_COL,
              }}
              title={`${row.employee_name} (${row.employee})${
                row.department ? ` · ${row.department}` : ""
              }`}
            >
              {row.employee_name}
            </div>

            {/* DAYS */}
            {days.map((d) => {
              const status = row.statuses?.[d] || "";
              const meta = STATUS_MAP[status] || STATUS_MAP[""];
              const isDayOff = status === "WO" || status === "H";
              // Keep AttendancePage's contract: pass full labels, blank for no-data
              const clickStatus = meta.label === "No Data" ? "" : meta.label;

              return (
                <div
                  key={d}
                  className={`flex items-center justify-center ${
                    isDayOff
                      ? status === "WO"
                        ? "bg-slate-500/10"
                        : "bg-teal-500/10"
                      : "cursor-pointer"
                  }`}
                  style={{
                    width: CELL,
                    minWidth: CELL,
                    height: CELL,
                  }}
                  onClick={() =>
                    !isDayOff &&
                    onDateClick &&
                    onDateClick(d, row.employee, clickStatus)
                  }
                >
                  <span
                    className={`inline-flex size-[22px] items-center justify-center rounded-md text-[10px] font-medium ${meta.color} ${
                      status === "WO"
                        ? "bg-slate-500 text-white"
                        : status === "H"
                          ? "bg-teal-500 text-white"
                          : ""
                    }`}
                    title={t(meta.titleKey)}
                  >
                    {meta.short}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
