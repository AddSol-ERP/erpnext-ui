import { useEffect, useState } from "react";
import { fetchMonthlyAttendance } from "../../../utils/monthlyAttendance";

const WEEKLY_OFF_COLOR = "#64748b";
const HOLIDAY_COLOR = "#14b8a6";

const CELL = 34;
const EMP_COL = 200;
const STICKY_BG = "rgb(21 29 47)";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Report status abbreviations -> display mapping.
// `color: ""` rows (WO/H) are painted with their own inline background.
const STATUS_MAP = {
  P: { short: "P", label: "Present", color: "bg-success" },
  WFH: { short: "P", label: "Work From Home", color: "bg-success" },
  A: { short: "A", label: "Absent", color: "bg-danger" },
  "HD/A": { short: "H", label: "Half Day", color: "bg-warning" },
  "HD/P": { short: "H", label: "Half Day", color: "bg-warning" },
  L: { short: "L", label: "On Leave", color: "bg-primary" },
  WO: { short: "W", label: "Weekly Off", color: "" },
  H: { short: "H", label: "Holiday", color: "" },
  "": { short: "-", label: "No Data", color: "bg-secondary" },
};

export default function AttendanceGrid({
  month,
  employee,
  department,
  onDateClick,
}) {
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState([]);

  /* ================= LOAD ================= */
  const load = async () => {
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
    }
  };

  useEffect(() => {
    load();
  }, [month, employee, department]);

  /* ================= EMPTY ================= */
  if (!rows.length) {
    return (
      <div className="card p-3 text-center text-muted">No employees found</div>
    );
  }

  /* ================= UI ================= */
  return (
    <div className="card p-2">
      <div
        style={{
          overflow: "auto",
          maxHeight: "calc(100vh - 200px)", // adjust once
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            minWidth: EMP_COL + days.length * CELL,
            position: "sticky",
            top: 0,
            zIndex: 3,
            background: STICKY_BG,
          }}
        >
          <div
            style={{
              width: EMP_COL,
              minWidth: EMP_COL,
              position: "sticky",
              left: 0,
              background: STICKY_BG,
              zIndex: 2,
              padding: "8px",
              fontWeight: 600,
              borderBottom: "1px solid var(--bs-border-color)",
            }}
          >
            Employee
          </div>

          {days.map((d) => {
            const dt = new Date(`${d}T00:00:00`);
            return (
              <div
                key={d}
                title={
                  Number.isNaN(dt.getTime()) ? "" : WEEKDAYS[dt.getDay()]
                }
                style={{
                  width: CELL,
                  minWidth: CELL,
                  textAlign: "center",
                  fontSize: 12,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--bs-border-color)",
                  color: "var(--text-muted)",
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
            style={{
              display: "flex",
              minWidth: EMP_COL + days.length * CELL,
              borderBottom: "1px solid var(--bs-border-color)",
            }}
          >
            {/* EMPLOYEE */}
            <div
              style={{
                width: EMP_COL,
                minWidth: EMP_COL,
                position: "sticky",
                left: 0,
                background: STICKY_BG,
                zIndex: 1,
                padding: "8px",
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
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
                  style={{
                    width: CELL,
                    minWidth: CELL,
                    height: CELL,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    ...(isDayOff
                      ? {
                          background:
                            status === "WO"
                              ? "rgba(100, 116, 139, 0.1)"
                              : "rgba(20, 184, 166, 0.1)",
                        }
                      : {}),
                  }}
                  onClick={() =>
                    !isDayOff &&
                    onDateClick &&
                    onDateClick(d, row.employee, clickStatus)
                  }
                >
                  <span
                    className={`badge ${meta.color}`}
                    style={{
                      width: 22,
                      height: 22,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6,
                      fontSize: 10,
                      ...(status === "WO"
                        ? { background: WEEKLY_OFF_COLOR, color: "#fff" }
                        : {}),
                      ...(status === "H"
                        ? { background: HOLIDAY_COLOR, color: "#fff" }
                        : {}),
                    }}
                    title={meta.label}
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