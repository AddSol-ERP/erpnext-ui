import { useEffect, useState } from "react";
import { get } from "../../../services/api";
import { fetchWeeklyOffMap } from "../../../utils/weeklyOff";

const WEEKLY_OFF_COLOR = "#64748b";

const CELL = 34;

export default function AttendanceGrid({
  month,
  employee,
  department,
  onDateClick,
}) {
  const [employees, setEmployees] = useState([]);
  const [data, setData] = useState({});
  const [weeklyOff, setWeeklyOff] = useState({});

  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  /* ================= LOAD ================= */
  const load = async () => {
    try {
      const attFilters = [["attendance_date", "between", [start, end]]];

      if (employee) attFilters.push(["employee", "=", employee]);
      if (department) attFilters.push(["department", "=", department]);

      const empFilters = [];
      if (employee) empFilters.push(["name", "=", employee]);
      if (department) empFilters.push(["department", "=", department]);

      const [empRes, attRes] = await Promise.all([
        get("resource/Employee", {
          fields: JSON.stringify(["name", "employee_name", "holiday_list"]),
          filters: JSON.stringify(empFilters),
          limit_page_length: 200,
        }),
        get("resource/Attendance", {
          fields: JSON.stringify(["employee", "attendance_date", "status"]),
          filters: JSON.stringify(attFilters),
          limit_page_length: 2000,
        }),
      ]);

      const empList = empRes.data || [];
      setEmployees(empList);

      const map = {};
      (attRes.data || []).forEach((d) => {
        if (!map[d.employee]) map[d.employee] = {};
        map[d.employee][d.attendance_date] = d.status;
      });

      setData(map);

      // Weekly off days from each employee's holiday list
      const wMap = await fetchWeeklyOffMap(month, empList);
      setWeeklyOff(wMap);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, [month, employee, department]);

  /* ================= HELPERS ================= */
  const days = Array.from({ length: end.getDate() }, (_, i) => i + 1);

  const getShort = (status) => {
    if (status === "Present") return "P";
    if (status === "Absent") return "A";
    if (status === "Half Day") return "H";
    if (status === "On Leave") return "L";
    return "-";
  };

  const getColor = (status) => {
    if (status === "Present") return "bg-success";
    if (status === "Absent") return "bg-danger";
    if (status === "Half Day") return "bg-warning";
    if (status === "On Leave") return "bg-primary";
    return "bg-secondary";
  };

  /* ================= EMPTY ================= */
  if (!employees.length) {
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
            minWidth: 200 + days.length * CELL,
            position: "sticky",
            top: 0,
            zIndex: 3,
            background: "rgb(21 29 47)",
          }}
        >
          <div
            style={{
              width: 200,
              minWidth: 200,
              position: "sticky",
              left: 0,
              background: "rgb(21 29 47)",
              zIndex: 2,
              padding: "8px",
              fontWeight: 600,
              borderBottom: "1px solid var(--bs-border-color)",
            }}
          >
            Employee
          </div>

          {days.map((d) => (
            <div
              key={d}
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
              {d}
            </div>
          ))}
        </div>

        {/* ROWS */}
        {employees.map((emp) => (
          <div
            key={emp.name}
            style={{
              display: "flex",
              minWidth: 200 + days.length * CELL,
              borderBottom: "1px solid var(--bs-border-color)",
            }}
          >
            {/* EMPLOYEE */}
            <div
              style={{
                width: 200,
                minWidth: 200,
                position: "sticky",
                left: 0,
                background: "rgb(21 29 47)",
                zIndex: 1,
                padding: "8px",
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={emp.employee_name}
            >
              {emp.employee_name}
            </div>

            {/* DAYS */}
            {days.map((d) => {
              const date = `${month.getFullYear()}-${String(
                month.getMonth() + 1,
              ).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

              const status = data[emp.name]?.[date];
              const isWeeklyOff = weeklyOff[emp.name]?.has(date);
              const showWeeklyOff = !status && isWeeklyOff;

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
                    ...(isWeeklyOff && !status
                      ? { background: "rgba(100, 116, 139, 0.1)" }
                      : {}),
                  }}
                  onClick={() =>
                    onDateClick &&
                    onDateClick(date, emp.name, status, showWeeklyOff)
                  }
                >
                  <span
                    className={`badge ${getColor(status)}`}
                    style={
                      showWeeklyOff
                        ? {
                            width: 22,
                            height: 22,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 6,
                            fontSize: 10,
                            background: WEEKLY_OFF_COLOR,
                            color: "#fff",
                          }
                        : {
                            width: 22,
                            height: 22,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 6,
                            fontSize: 10,
                          }
                    }
                    title={showWeeklyOff ? "Weekly Off" : status || "No Data"}
                  >
                    {showWeeklyOff ? "W" : getShort(status)}
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
