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
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [hasEmployee, setHasEmployee] = useState(false);

  const [selectedDept, setSelectedDept] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [employeeError, setEmployeeError] = useState("");

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
  const load = async (department, employee) => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (department) params.department = department;
      if (employee) params.employee = employee;

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
      setLeaveTypes(msg.leave_types || []);
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
    load(selectedDept, selectedEmployee);
  }, [selectedDept, selectedEmployee]);

  /* ================= EMPLOYEE OPTIONS ================= */
  // Fetch the permission-scoped employee list so the filter lets users pick
  // (ERPNext handles the permission scoping server-side).
  useEffect(() => {
    if (!meta.can_view_others || loadingEmployee) return;

    (async () => {
      setLoadingEmployee(true);
      setEmployeeError("");
      try {
        const params = {};
        if (selectedDept) params.department = selectedDept;

        const res = await get(
          "method/erpnext_ui.api.leave_balance_employees",
          params,
        );
        const list = (res.message && res.message.employees) || [];
        setEmployeeOptions(list);

        // If the current selection is outside the new list, clear it.
        if (selectedEmployee && !list.some((e) => e.name === selectedEmployee)) {
          setSelectedEmployee("");
        }
      } catch (e) {
        console.error("Failed to load employee list:", e);
        setEmployeeError("Could not load employee list.");
      } finally {
        setLoadingEmployee(false);
      }
    })();
  }, [meta.can_view_others, selectedDept]);

  /* ================= DERIVE ================= */
  const visibleRows = useMemo(() => rows, [rows]);

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
                onChange={(e) => setSelectedDept(e.target.value)}
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
              <label className="form-label small mb-1">Employee</label>
              <select
                className="form-select"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                disabled={!employeeOptions.length}
              >
                <option value="">
                  {loadingEmployee
                    ? "Loading employees…"
                    : employeeOptions.length
                      ? "All Employees"
                      : "No employees available"}
                </option>
                {employeeOptions.map((e) => (
                  <option key={e.name} value={e.name}>
                    {e.employee_name} ({e.name})
                  </option>
                ))}
              </select>
              {employeeError && (
                <div className="small text-danger mt-1">{employeeError}</div>
              )}
            </div>

            <div className="col-md-4 d-flex gap-2">
              {(selectedDept || selectedEmployee) && (
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setSelectedDept("");
                    setSelectedEmployee("");
                  }}
                >
                  <i className="bi bi-x-circle me-2"></i>Clear Filters
                </button>
              )}
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
              : "No leave data found for the current fiscal year."}
          </div>
        </div>
      ) : (
        <LeaveMatrix rows={visibleRows} leaveTypes={leaveTypes} />
      )}
    </div>
  );
}

/* ============================================================
   MATRIX VIEW — employees × leave types
   Each cell is the employee's balance for that leave type, with
   "used/allocated" underneath. A gray 0 means no allocation.
   ============================================================ */
const COL = 110; // each leave-type column
const EMP_COL = 220; // sticky employee column
const STICKY_BG = "rgb(21 29 47)"; // matches attendance grid theme

function LeaveMatrix({ rows, leaveTypes = [] }) {
  // Fallback: derive column set from data if the API didn't send it.
  const types = leaveTypes.length
    ? leaveTypes
    : Array.from(
        new Set(
          rows.flatMap((r) => (r.leaves || []).map((l) => l.leave_type || "")),
        ),
      ).filter(Boolean).sort();

  return (
    <div>
      <div className="small text-muted mb-2">
        Each cell shows the <b>balance</b> with used / allocated underneath.{" "}
        <span className="text-muted">Gray 0 = no allocation for this leave type.</span>
      </div>
      <div className="card p-2">
        <div
          style={{ overflow: "auto", maxHeight: "calc(100vh - 300px)" }}
        >
          {/* HEADER */}
          <div
            style={{
              display: "flex",
              minWidth: EMP_COL + types.length * COL,
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

            {types.map((t) => (
              <div
                key={t}
                title={t}
                style={{
                  width: COL,
                  minWidth: COL,
                  textAlign: "center",
                  fontSize: 11,
                  lineHeight: 1.2,
                  padding: "6px 2px",
                  borderBottom: "1px solid var(--bs-border-color)",
                  color: "var(--text-muted)",
                }}
              >
                {t}
              </div>
            ))}
          </div>

          {/* ROWS */}
          {rows.map((r) => {
            const byType = {};
            (r.leaves || []).forEach((l) => {
              byType[l.leave_type] = l;
            });

            return (
              <div
                key={r.employee}
                style={{
                  display: "flex",
                  minWidth: EMP_COL + types.length * COL,
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
                    padding: "6px 8px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {r.employee_name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.employee}
                    {r.department ? ` · ${r.department}` : ""}
                  </div>
                </div>

                {/* LEAVE TYPE CELLS */}
                {types.map((t) => {
                  const l = byType[t];
                  const allocated = l ? l.allocated : 0;
                  const used = l ? l.used : 0;
                  const balance = l ? l.balance : 0;

                  const tone =
                    allocated <= 0
                      ? "none" // no allocation -> muted 0
                      : balance <= 0
                        ? "danger"
                        : balance < allocated * 0.25
                          ? "warning"
                          : "ok";

                  const color =
                    tone === "danger"
                      ? "#f87171"
                      : tone === "warning"
                        ? "#fbbf24"
                        : tone === "none"
                          ? "var(--text-muted)"
                          : "inherit";

                  return (
                    <div
                      key={t}
                      title={`${t}: Allocated ${allocated} · Used ${used} · Balance ${balance}`}
                      style={{
                        width: COL,
                        minWidth: COL,
                        padding: "6px 2px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color,
                        }}
                      >
                        {balance}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {allocated}/{used}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}