import { useEffect, useState } from "react";
import { get } from "../../../services/api";
import { fetchEmployeeWeeklyOff } from "../../../utils/weeklyOff";

export default function AttendanceCalendar({
  month,
  employee,
  department,
  onDateClick,
}) {
  const [data, setData] = useState({});
  const [teamData, setTeamData] = useState({});
  const [weeklyOff, setWeeklyOff] = useState(new Set());

  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const load = async () => {
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

    // Weekly off dates for the selected employee (employee mode only)
    if (employee) {
      const off = await fetchEmployeeWeeklyOff(month, employee);
      setWeeklyOff(off);
    } else {
      setWeeklyOff(new Set());
    }
  };

  useEffect(() => {
    load();
  }, [month, employee, department]);

  /* ================= CALC ================= */
  const firstDayIndex = start.getDay();
  const totalDays = end.getDate();

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

    cells.push(
      <div
        key={i}
        className="border rounded p-2"
        onClick={() =>
          employee && onDateClick && onDateClick(date, employee, status, isWeeklyOff)
        }
        style={{
          minHeight: 90,
          background: isWeeklyOff && !status ? "rgba(100, 116, 139, 0.1)" : "var(--card-bg)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          cursor: employee ? "pointer" : "default",
          opacity: employee ? 1 : 0.7,
        }}
      >
        {/* DAY */}
        <div style={{ fontSize: 12, fontWeight: 500 }}>{i}</div>

        {/* ================= MODE SWITCH ================= */}

        {/* 🟢 EMPLOYEE MODE */}
        {employee ? (
          status ? (
            <div
              className={`badge ${
                status === "Present"
                  ? "bg-success"
                  : status === "Absent"
                    ? "bg-danger"
                    : status === "Half Day"
                      ? "bg-warning"
                      : "bg-primary"
              }`}
              style={{ fontSize: 11 }}
            >
              {status}
            </div>
          ) : isWeeklyOff ? (
            <div
              className="badge"
              style={{
                fontSize: 11,
                background: "#64748b",
                color: "#fff",
              }}
            >
              Weekly Off
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>-</div>
          )
        ) : (
          /* 🔵 TEAM MODE */
          <div style={{ fontSize: 10 }}>
            <div className="text-success">P: {team?.Present || 0}</div>
            <div className="text-danger">A: {team?.Absent || 0}</div>
            <div className="text-warning">H: {team?.["Half Day"] || 0}</div>
            <div className="text-primary">L: {team?.["On Leave"] || 0}</div>
          </div>
        )}
      </div>,
    );
  }

  return (
    <div className="card p-2">
      {/* WEEK HEADER */}
      <div
        className="mb-2"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
        }}
      >
        {cells}
      </div>
    </div>
  );
}
