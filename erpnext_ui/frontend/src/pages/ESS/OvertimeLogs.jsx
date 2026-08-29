import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { get } from "../../services/api";

/**
 * ESS Overtime Logs
 *
 * Read-only table showing the current employee's overtime records.
 * OT logs are system-generated; employees can only view them.
 */
export default function OvertimeLogs() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const [employee, setEmployee] = useState(null);
  const [empName, setEmpName] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ── Header ── */
  useEffect(() => {
    setHeader({
      title: "Overtime Logs",
      subtitle: empName ? `Employee: ${empName}` : "Your overtime records",
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "ESS", path: "/ess" },
        { label: "Overtime Logs" },
      ],
      actions: [
        {
          label: "Back",
          variant: "btn-outline-secondary",
          icon: "bi bi-arrow-left",
          onClick: () => navigate("/ess"),
        },
      ],
    });
    return () => setHeader({});
  }, [empName]);

  /* ── Fetch employee for current user ── */
  useEffect(() => {
    fetchEmployee();
  }, []);

  const fetchEmployee = async () => {
    try {
      let userId = "";
      if (window.frappe?.session?.user) {
        userId = window.frappe.session.user;
      } else {
        const userRes = await get("method/erpnext_ui.api.get_current_user");
        userId = userRes?.message?.user || "";
      }
      if (!userId) {
        setLoading(false);
        return;
      }

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
      // Always stop loading so users without a linked Employee
      // reach the empty state instead of an infinite spinner.
      setLoading(false);
    }
  };

  /* ── Fetch OT logs once employee is resolved ── */
  useEffect(() => {
    if (employee) fetchLogs();
  }, [employee]);

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
          "approval_date",
        ]),
        filters: JSON.stringify([["employee", "=", employee]]),
        order_by: "attendance_date desc",
        limit_page_length: 200,
      });
      setLogs(res.data || []);
    } catch (e) {
      console.error("Failed to fetch overtime logs:", e);
    } finally {
      setLoading(false);
    }
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

  /* ── Render ── */
  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-5">
        <div className="mb-3">
          <i className="bi bi-person-exclamation" style={{ fontSize: 48 }} />
        </div>
        <h5>No Employee Found</h5>
        <p className="text-muted">
          Your user account is not linked to an Employee record.
          Please contact HR.
        </p>
        <button className="btn btn-primary" onClick={() => navigate("/ess")}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  /* ── Summary Stats ── */
  const totalOT = logs.reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
  const approvedCount = logs.filter((l) => l.status === "Approved").length;
  const pendingCount = logs.filter((l) => l.status === "Draft").length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
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
            <div className="stat-value text-success">{approvedCount}</div>
            <div className="stat-label">Approved</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card text-center p-3">
            <div className="stat-value text-warning">{pendingCount}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>
      </div>

      {/* ── Logs Table ── */}
      {logs.length === 0 ? (
        <div className="card p-5 text-center">
          <i className="bi bi-hourglass text-muted" style={{ fontSize: 48 }} />
          <h5 className="mt-3">No Overtime Records</h5>
          <p className="text-muted">
            You don't have any overtime logs yet.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>In Time</th>
                  <th>Out Time</th>
                  <th>OT Hours</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.name}>
                    <td>{log.attendance_date || "—"}</td>
                    <td>{log.shift || "—"}</td>
                    <td>{formatDateTime(log.in_time)}</td>
                    <td>{formatDateTime(log.out_time)}</td>
                    <td>
                      <strong>{log.overtime_hours || 0}</strong> hrs
                    </td>
                    <td>
                      <span
                        className={`badge ${getStatusBadge(log.status)}`}
                      >
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
