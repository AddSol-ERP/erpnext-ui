import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { get } from "../../services/api";
import "./AttendanceCalendar.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * ESS Attendance Calendar
 *
 * Shows a monthly calendar with attendance In/Out times.
 * Past days without attendance provide quick actions to create
 * a Leave Application or Attendance Request (auto-populated).
 */
export default function AttendanceCalendar() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [employee, setEmployee] = useState(null);   // employee name/id
  const [empName, setEmpName] = useState("");        // display name
  const [attendance, setAttendance] = useState({});  // { "YYYY-MM-DD": { in_time, out_time, status, ... } }
  const [loading, setLoading] = useState(true);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed

  /* ------------------------------------------------------------------
     HEADER
  ------------------------------------------------------------------ */
  useEffect(() => {
    setHeader({
      title: "Attendance Calendar",
      subtitle: empName ? `Employee: ${empName}` : "ESS",
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "ESS", path: "/ess" },
        { label: "Attendance" },
      ],
    });
    return () => setHeader({});
  }, [empName]);

  /* ------------------------------------------------------------------
     GET EMPLOYEE FOR CURRENT USER
  ------------------------------------------------------------------ */
  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        // Try to get user from frappe session first
        let userId = "";
        if (window.frappe?.session?.user) {
          userId = window.frappe.session.user;
        } else {
          // Fallback: call custom API
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
      }
    };
    fetchEmployee();
  }, []);

  /* ------------------------------------------------------------------
     FETCH ATTENDANCE FOR THE CURRENT MONTH
  ------------------------------------------------------------------ */
  const fetchAttendance = useCallback(async () => {
    if (!employee) return;
    setLoading(true);

    // First day of month
    const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    // Last day of month
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
    fetchAttendance();
  }, [fetchAttendance]);

  /* ------------------------------------------------------------------
     NAVIGATION HELPERS
  ------------------------------------------------------------------ */
  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  /* ------------------------------------------------------------------
     CALENDAR GRID CALCULATION
  ------------------------------------------------------------------ */
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun

  // Build calendar cells: array of { day, dateStr, isToday, isPast, att }
  const cells = [];
  // Fill leading blanks
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cellDate = new Date(year, month, d);
    const isToday =
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === d;
    const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const att = attendance[dateStr] || null;
    cells.push({ day: d, dateStr, isToday, isPast, att });
  }

  /* ------------------------------------------------------------------
     ACTIONS FOR MISSING ATTENDANCE
  ------------------------------------------------------------------ */
  const handleApplyLeave = (dateStr) => {
    navigate(`/requests/leave/new?from_date=${dateStr}`);
  };

  const handleRequestAttendance = (dateStr) => {
    navigate(`/requests/attendance/new?from_date=${dateStr}&to_date=${dateStr}`);
  };

  /* ------------------------------------------------------------------
     FORMAT TIME
  ------------------------------------------------------------------ */
  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    // timeStr is "HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
    const parts = timeStr.split(" ");
    const timePart = parts[parts.length - 1]; // "HH:MM:SS" or "HH:MM"
    const [h, m] = timePart.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  };

  /* ==================================================================
     RENDER
  ================================================================== */

  // Loading while employee is being resolved
  if (!employee && loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading employee...</span>
        </div>
        <span className="ms-2 text-muted">Loading employee data…</span>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="alert alert-warning m-4">
        <i className="bi bi-exclamation-triangle me-2"></i>
        No linked Employee record found for your user account.
      </div>
    );
  }

  return (
    <div className="attendance-calendar" style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
      {/* ── Month Navigation ── */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <button className="btn btn-outline-secondary btn-sm" onClick={prevMonth}>
          <i className="bi bi-chevron-left"></i>
        </button>
        <h5 className="mb-0">
          {MONTHS[month]} {year}
        </h5>
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={nextMonth}
          disabled={isCurrentMonth}
        >
          <i className="bi bi-chevron-right"></i>
        </button>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="text-center py-3">
          <div className="spinner-border spinner-border-sm" role="status">
            <span className="visually-hidden">Loading attendance...</span>
          </div>
          <span className="ms-2 text-muted small">Loading attendance records…</span>
        </div>
      )}

      {/* ── Calendar Grid ── */}
      {!loading && (
        <div className="calendar-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
          {/* Day headers */}
          {DAY_HEADERS.map((h) => (
            <div key={h} className="day-header">
              {h}
            </div>
          ))}

          {/* Cells */}
          {cells.map((cell, idx) =>
            cell === null ? (
              <div key={`blank-${idx}`} style={{ minHeight: "100px" }} />
            ) : (
              <DayCell
                key={cell.dateStr}
                cell={cell}
                formatTime={formatTime}
                onApplyLeave={handleApplyLeave}
                onRequestAttendance={handleRequestAttendance}
              />
            )
          )}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="d-flex gap-3 mt-3 small">
        <span className="d-flex align-items-center gap-1">
          <span className="legend-badge present">&check;</span> Present
        </span>
        <span className="d-flex align-items-center gap-1">
          <span className="legend-badge late">~</span> Late / Half Day
        </span>
        <span className="d-flex align-items-center gap-1">
          <span className="legend-badge absent">x</span> Absent
        </span>
        <span className="d-flex align-items-center gap-1">
          <span className="legend-badge missing">!</span> Missing (no record)
        </span>
        <span className="d-flex align-items-center gap-1">
          <span className="legend-badge future">&rarr;</span> Future
        </span>
      </div>
    </div>
  );
}

/* ==================================================================
   DAY CELL COMPONENT
================================================================== */
function DayCell({ cell, formatTime, onApplyLeave, onRequestAttendance }) {
  const { day, dateStr, isToday, isPast, att } = cell;

  // Determine cell background / styling
  let cellClass = "attendance-cell position-relative p-1";
  let statusClass = "future";

  if (isToday) {
    cellClass += " border border-primary border-2";
  }

  // Determine if this attendance record needs corrective action
  const attStatus = att?.status || "";
  const isProblematic =
    attStatus === "Absent" || attStatus === "Half Day" || attStatus === "Late";

  if (att) {
    // Attendance record exists
    if (attStatus === "Present") {
      cellClass += " bg-success-subtle";
      statusClass = "present";
    } else if (attStatus === "Half Day" || attStatus === "Late") {
      cellClass += " bg-warning-subtle";
      statusClass = "late";
    } else if (attStatus === "Absent" || attStatus === "On Leave") {
      cellClass += " bg-danger-subtle";
      statusClass = "absent";
    } else {
      cellClass += " bg-light";
      statusClass = "present";
    }
  } else if (isPast) {
    // Past day with NO attendance record → MISSING
    cellClass += " bg-danger bg-opacity-10";
    statusClass = "missing";
  }
  // Future days with no record stay default

  return (
    <div
      className={cellClass}
      data-status={statusClass}
      style={{
        minHeight: "110px",
        borderRadius: "6px",
        overflow: "visible",
      }}
    >
      {/* Day number */}
      <div className="d-flex justify-content-between align-items-start">
        <span
          className={`fw-bold small ${isToday ? "text-primary" : ""}`}
          style={{ fontSize: "0.85rem" }}
        >
          {day}
        </span>
        {isToday && (
          <span className="badge bg-primary" style={{ fontSize: "0.6rem" }}>
            Today
          </span>
        )}
      </div>

      {/* Attendance details */}
      <div className="mt-1" style={{ fontSize: "0.7rem", lineHeight: 1.3 }}>
        {att ? (
          <>
            {/* In / Out times */}
            {att.in_time && (
              <div className="d-flex align-items-center gap-1">
                <i className="bi bi-box-arrow-in-right text-success" style={{ fontSize: "0.6rem" }}></i>
                <span className="att-time-text">{formatTime(att.in_time)}</span>
              </div>
            )}
            {att.out_time && (
              <div className="d-flex align-items-center gap-1">
                <i className="bi bi-box-arrow-right text-danger" style={{ fontSize: "0.6rem" }}></i>
                <span className="att-time-text">{formatTime(att.out_time)}</span>
              </div>
            )}
            {att.in_time && att.out_time && (
              <div className="text-muted" style={{ fontSize: "0.6rem" }}>
                {att.shift ? att.shift : ""}
              </div>
            )}
            {/* Status if no times */}
            {!att.in_time && !att.out_time && (
              <span className="att-status-text">
                {att.status === "On Leave" ? "On Leave" : att.status}
              </span>
            )}
            {/* Action buttons for problematic past attendance (Absent, Half Day, Late) */}
            {isProblematic && (
              <div className="mt-1 action-buttons">
                <button
                  className="btn btn-sm btn-outline-danger py-0 px-1 mb-1 w-100"
                  style={{ fontSize: "0.6rem", lineHeight: 1.5 }}
                  onClick={() => onApplyLeave(dateStr)}
                  title="Create Leave Application"
                >
                  <i className="bi bi-calendar-plus me-1"></i>Leave
                </button>
                <button
                  className="btn btn-sm btn-outline-warning py-0 px-1 w-100"
                  style={{ fontSize: "0.6rem", lineHeight: 1.5 }}
                  onClick={() => onRequestAttendance(dateStr)}
                  title="Request Attendance Correction"
                >
                  <i className="bi bi-pencil-square me-1"></i>Attnd
                </button>
              </div>
            )}
          </>
        ) : isPast ? (
          /* Missing attendance — action buttons */
          <div className="mt-1 action-buttons">
            <div className="att-missing-label mb-1">
              Missing
            </div>
            <button
              className="btn btn-sm btn-outline-danger py-0 px-1 mb-1 w-100"
              style={{ fontSize: "0.6rem", lineHeight: 1.5 }}
              onClick={() => onApplyLeave(dateStr)}
              title="Create Leave Application"
            >
              <i className="bi bi-calendar-plus me-1"></i>Leave
            </button>
            <button
              className="btn btn-sm btn-outline-warning py-0 px-1 w-100"
              style={{ fontSize: "0.6rem", lineHeight: 1.5 }}
              onClick={() => onRequestAttendance(dateStr)}
              title="Request Attendance Correction"
            >
              <i className="bi bi-pencil-square me-1"></i>Attnd
            </button>
          </div>
        ) : (
          /* Future day — no record expected */
          <span className="text-muted" style={{ fontSize: "0.65rem" }}>
            &mdash;
          </span>
        )}
      </div>
    </div>
  );
}
