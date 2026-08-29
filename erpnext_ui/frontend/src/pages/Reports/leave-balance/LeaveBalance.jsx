import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";
import StatCard from "../../../components/StatCard";

/**
 * Leave Balance screen (shared by ESS and Reports).
 *
 * Regular employees see their own leave balance for the current fiscal year.
 * HODs / managers / HR see a department-level report (backend scopes access).
 *
 * Props:
 *   context: "ess" | "reports"  (controls breadcrumbs / back destination)
 */
export default function LeaveBalance({ context = "ess" }) {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fiscalYear, setFiscalYear] = useState(null);
  const [meta, setMeta] = useState({ can_view_others: false });
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [hasEmployee, setHasEmployee] = useState(false);

  const [selectedDept, setSelectedDept] = useState("");
  const [search, setSearch] = useState("");

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: "Leave Balance",
      subtitle:
        fiscalYear && fiscalYear.name
          ? `Fiscal Year ${fiscalYear.name}`
          : "Leave balance for the current fiscal year",

      breadcrumbs:
        context === "reports"
          ? [
              { label: "Home", path: "/" },
              { label: "Reports", path: "/reports" },
              { label: "Leave Balance" },
            ]
          : [
              { label: "Home", path: "/" },
              { label: "ESS", path: "/ess" },
              { label: "Leave Balance" },
            ],

      actions: [
        context === "ess" && {
          label: "Apply Leave",
          variant: "btn-primary",
          icon: "bi bi-calendar-plus",
          onClick: () => navigate("/requests/leave/new"),
        },
        {
          label: "Back",
          variant: "btn-outline-secondary",
          icon: "bi bi-arrow-left",
          onClick: () => navigate(context === "reports" ? "/reports" : "/ess"),
        },
      ].filter(Boolean),
    });

    return () => setHeader({});
  }, [fiscalYear, context]);

  /* ================= LOAD ================= */
  const load = async (department) => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (department) params.department = department;

      const res = await get(
        "method/erpnext_ui.api.leave_balance_report",
        params,
      );

      const msg = res.message || {};
      setFiscalYear(msg.fiscal_year || null);
      setMeta({
        is_hr: !!msg.is_hr,
        is_hod: !!msg.is_hod,
        can_view_others: !!msg.can_view_others,
      });
      setDepartments(msg.departments || []);
      setRows(msg.employees || []);
      setHasEmployee(!!msg.my_employee);
    } catch (e) {
      console.error("Failed to load leave balance:", e);
      setError("Failed to load leave balance. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(selectedDept);
  }, [selectedDept]);

  /* ================= DERIVE ================= */
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.employee_name || r.employee || "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const singleEmployee = visibleRows.length === 1;
  const focusRow = singleEmployee ? visibleRows[0] : null;

  const totals = useMemo(() => {
    let allocated = 0;
    let used = 0;
    let balance = 0;

    visibleRows.forEach((r) => {
      (r.leaves || []).forEach((l) => {
        allocated += l.allocated || 0;
        used += l.used || 0;
        balance += l.balance || 0;
      });
    });

    return {
      allocated: Math.round(allocated * 10) / 10,
      used: Math.round(used * 10) / 10,
      balance: Math.round(balance * 10) / 10,
    };
  }, [visibleRows]);

  /* ================= CSV ================= */
  const handleExport = () => {
    if (!visibleRows.length) return;

    const header = [
      "Employee ID",
      "Employee Name",
      "Department",
      "Leave Type",
      "Allocated",
      "Used",
      "Balance",
    ];
    const lines = [header.join(",")];

    visibleRows.forEach((r) => {
      const leaves = r.leaves?.length ? r.leaves : [{ leave_type: "-", allocated: 0, used: 0, balance: 0 }];
      leaves.forEach((l) => {
        lines.push(
          [
            `"${r.employee}"`,
            `"${r.employee_name}"`,
            `"${r.department}"`,
            `"${l.leave_type}"`,
            l.allocated,
            l.used,
            l.balance,
          ].join(","),
        );
      });
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leave-balance-${fiscalYear?.name || "current"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ================= UI ================= */
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && fiscalYear && (
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          <span className="badge bg-primary">
            <i className="bi bi-calendar3 me-1"></i>
            Fiscal Year: {fiscalYear.name}
          </span>
          <span className="badge bg-secondary">
            {fiscalYear.start_date} → {fiscalYear.end_date}
          </span>

          {(meta.is_hr || meta.is_hod) && (
            <span className="badge bg-info">
              {meta.is_hr ? "HR Access" : "HOD / Manager Access"}
            </span>
          )}
        </div>
      )}

      {/* FILTERS (HOD / HR only) */}
      {meta.can_view_others && (
        <div className="card p-3 mb-3">
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <label className="form-label small mb-1">Department</label>
              <select
                className="form-select"
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setSearch("");
                }}
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label small mb-1">Search Employee</label>
              <input
                type="text"
                className="form-control"
                placeholder="Type employee name / id…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="col-md-4 d-flex gap-2">
              <button className="btn btn-outline-secondary" onClick={handleExport}>
                <i className="bi bi-download me-2"></i>Export CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUMMARY */}
      {!loading && visibleRows.length > 0 && (
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <StatCard
              value={totals.allocated}
              label="Total Allocated"
              icon="bi-piggy-bank"
              color="#00d1ff"
            />
          </div>
          <div className="col-md-4">
            <StatCard
              value={totals.used}
              label="Total Used"
              icon="bi-calendar-x"
              color="#dc2626"
            />
          </div>
          <div className="col-md-4">
            <StatCard
              value={totals.balance}
              label="Balance (Unused)"
              icon="bi-calendar-check"
              color="#16a34a"
            />
          </div>
        </div>
      )}

      {/* CONTENT */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="card p-4 text-center text-muted">
          <i className="bi bi-inbox mb-2" style={{ fontSize: 40 }} />
          <div>
            {!meta.can_view_others && !hasEmployee
              ? "No Employee profile linked to your user account."
              : rows.length === 0
                ? "No leave data found for the current fiscal year."
                : "No employees match the current search."}
          </div>
        </div>
      ) : singleEmployee ? (
        <LeaveCards employee={focusRow} />
      ) : (
        <LeaveTable rows={visibleRows} />
      )}
    </div>
  );
}

/* ============================================================
   SINGLE EMPLOYEE VIEW — per leave type cards with progress
   ============================================================ */
function LeaveCards({ employee }) {
  const leaves = employee?.leaves || [];

  if (!leaves.length) {
    return (
      <div className="card p-4 text-center text-muted">
        No leave allocations found for this employee.
      </div>
    );
  }

  return (
    <div className="row g-3">
      {leaves.map((l) => {
        const pct =
          l.allocated > 0 ? Math.round((l.used / l.allocated) * 100) : 0;
        const remainingPct = l.allocated > 0 ? Math.round((l.balance / l.allocated) * 100) : 0;
        const barColor =
          remainingPct >= 50
            ? "bg-success"
            : remainingPct >= 25
              ? "bg-warning"
              : "bg-danger";

        return (
          <div key={l.leave_type} className="col-12 col-md-6 col-lg-4">
            <div className="card h-100 p-3">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div className="fw-semibold">{l.leave_type}</div>
                <span
                  className={`badge ${
                    l.balance <= 0 ? "bg-danger" : "bg-success"
                  }`}
                >
                  {l.balance} left
                </span>
              </div>

              <div className="d-flex justify-content-between small text-muted mb-1">
                <span>Used: {l.used}</span>
                <span>of {l.allocated}</span>
              </div>

              <div className="progress" style={{ height: 8 }}>
                <div
                  className={`progress-bar ${barColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>

              <div className="d-flex justify-content-between small mt-2">
                <span className="text-danger">
                  <i className="bi bi-calendar-x me-1"></i>Used {l.used}
                </span>
                <span className="text-success">
                  <i className="bi bi-calendar-check me-1"></i>Balance {l.balance}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   DEPARTMENT VIEW — employee × leave type table
   ============================================================ */
function LeaveTable({ rows }) {
  return (
    <div className="card p-2">
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
        <table className="table table-hover mb-0 align-middle">
          <thead className="small">
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Leave Type</th>
              <th className="text-center">Allocated</th>
              <th className="text-center">Used</th>
              <th className="text-center">Balance</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody className="small">
            {rows.map((r) =>
              (r.leaves?.length ? r.leaves : [null]).map((l, i) => {
                const balance = l ? l.balance : 0;
                const status =
                  l === null
                    ? { cls: "bg-secondary", label: "No Allocation" }
                    : balance <= 0
                      ? { cls: "bg-danger", label: "Exhausted" }
                      : balance < l.allocated * 0.25
                        ? { cls: "bg-warning", label: "Low" }
                        : { cls: "bg-success", label: "Okay" };

                return (
                  <tr key={`${r.employee}-${l ? l.leave_type : "none"}`}>
                    {i === 0 && (
                      <>
                        <td rowSpan={r.leaves?.length || 1}>
                          <div className="fw-semibold">{r.employee_name}</div>
                          <div className="text-muted">{r.employee}</div>
                        </td>
                        <td rowSpan={r.leaves?.length || 1}>
                          {r.department || "—"}
                        </td>
                      </>
                    )}

                    <td>{l ? l.leave_type : "—"}</td>
                    <td className="text-center">{l ? l.allocated : 0}</td>
                    <td className="text-center">{l ? l.used : 0}</td>
                    <td className="text-center">{l ? l.balance : 0}</td>
                    <td className="text-center">
                      <span className={`badge ${status.cls}`}>{status.label}</span>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}