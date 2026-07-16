import { useEffect, useState } from "react";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Overtime Report Page
 *
 * Shows overtime data across all employees for a selected month.
 * Includes summary stats and a detailed table.
 */
export default function OvertimeReportPage() {
  const { setHeader } = useHeader();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDayDate = new Date(year, month + 1, 0);
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-${String(
    lastDayDate.getDate()
  ).padStart(2, "0")}`;

  /* ── Header ── */
  useEffect(() => {
    setHeader({
      title: "Overtime Report",
      subtitle: `${MONTHS[month]} ${year}`,
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Reports", path: "/reports" },
        { label: "Overtime Report" },
      ],
      actions: [
        {
          label: "Refresh",
          variant: "btn-outline-primary",
          icon: "bi bi-arrow-clockwise",
          onClick: fetchLogs,
        },
      ],
    });
    return () => setHeader({});
  }, [currentMonth]);

  /* ── Fetch OT logs for the month ── */
  useEffect(() => {
    fetchLogs();
  }, [currentMonth]);

  const fetchLogs = async () => {
    setLoading(true);
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
      return new Date(dt).toLocaleString("en-IN", {
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
        return "bg-success";
      case "Rejected":
        return "bg-danger";
      default:
        return "bg-warning text-dark";
    }
  };

  /* ── Summary Stats ── */
  const totalOT = logs.reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
  const uniqueEmployees = [...new Set(logs.map((l) => l.employee))].length;
  const approvedCount = logs.filter((l) => l.status === "Approved").length;
  const pendingCount = logs.filter((l) => l.status === "Draft").length;
  const approvedOT = logs
    .filter((l) => l.status === "Approved")
    .reduce((sum, l) => sum + (l.overtime_hours || 0), 0);

  /* ── Employee-wise summary ── */
  const employeeSummary = {};
  logs.forEach((l) => {
    const key = l.employee;
    if (!employeeSummary[key]) {
      employeeSummary[key] = {
        employee: l.employee,
        employee_name: l.employee_name,
        totalHours: 0,
        logCount: 0,
        approvedHours: 0,
      };
    }
    employeeSummary[key].totalHours += l.overtime_hours || 0;
    employeeSummary[key].logCount += 1;
    if (l.status === "Approved") {
      employeeSummary[key].approvedHours += l.overtime_hours || 0;
    }
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* ── Month Navigation ── */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <button className="btn btn-outline-primary" onClick={prevMonth}>
          <i className="bi bi-chevron-left"></i> Prev
        </button>
        <h5 className="mb-0">
          {MONTHS[month]} {year}
        </h5>
        <button className="btn btn-outline-primary" onClick={nextMonth}>
          Next <i className="bi bi-chevron-right"></i>
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="row g-2 mb-4">
        <div className="col-6 col-md-3">
          <div className="card text-center p-3">
            <div className="stat-value">{logs.length}</div>
            <div className="stat-label">Total Logs</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card text-center p-3">
            <div className="stat-value text-primary">
              {totalOT.toFixed(2)}
            </div>
            <div className="stat-label">Total OT Hours</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card text-center p-3">
            <div className="stat-value text-info">{uniqueEmployees}</div>
            <div className="stat-label">Employees</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card text-center p-3">
            <div className="stat-value text-success">
              {approvedOT.toFixed(2)}
            </div>
            <div className="stat-label">Approved OT Hrs</div>
          </div>
        </div>
      </div>

      {/* ── Employee-wise Summary ── */}
      {Object.keys(employeeSummary).length > 0 && (
        <div className="card mb-4">
          <div className="card-header fw-semibold">
            <i className="bi bi-people me-2"></i>
            Employee-wise Summary
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Name</th>
                  <th className="text-center">Logs</th>
                  <th className="text-end">Total OT (hrs)</th>
                  <th className="text-end">Approved OT (hrs)</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(employeeSummary)
                  .sort((a, b) => b.totalHours - a.totalHours)
                  .map((emp) => (
                    <tr key={emp.employee}>
                      <td>{emp.employee}</td>
                      <td>{emp.employee_name || "—"}</td>
                      <td className="text-center">{emp.logCount}</td>
                      <td className="text-end fw-semibold">
                        {emp.totalHours.toFixed(2)}
                      </td>
                      <td className="text-end text-success">
                        {emp.approvedHours.toFixed(2)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detailed Log Table ── */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-5 text-center">
          <i className="bi bi-hourglass text-muted" style={{ fontSize: 48 }} />
          <h5 className="mt-3">No Overtime Records</h5>
          <p className="text-muted">
            No overtime logs found for {MONTHS[month]} {year}.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="card-header fw-semibold">
            <i className="bi bi-list-ul me-2"></i>
            Detailed Logs ({logs.length})
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Name</th>
                  <th>Shift</th>
                  <th>In Time</th>
                  <th>Out Time</th>
                  <th className="text-end">OT Hours</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.name}>
                    <td>{log.attendance_date || "—"}</td>
                    <td>{log.employee}</td>
                    <td>{log.employee_name || "—"}</td>
                    <td>{log.shift || "—"}</td>
                    <td>{formatDateTime(log.in_time)}</td>
                    <td>{formatDateTime(log.out_time)}</td>
                    <td className="text-end fw-semibold">
                      {log.overtime_hours || 0}
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadge(log.status)}`}>
                        {log.status || "Draft"}
                      </span>
                    </td>
                    <td className="text-muted small">
                      {log.remarks || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
