import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect, useState } from "react";
import ActionTile from "../../components/ActionTile";
import { get } from "../../services/api";
import { useRole } from "../../context/RoleContext";
import { MODULE_ACCESS } from "../../config/moduleAccess";

export default function Dashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { hasModuleAccess, loading: roleLoading } = useRole();
  const [counts, setCounts] = useState({
    pendingApprovals: 0,
    openRequests: 0,
    activeJobs: 0,
    qcPending: 0,
  });

  useEffect(() => {
    setHeader({
      title: "ERP Dashboard",
      subtitle: "Quick access to all modules",
      breadcrumbs: [{ label: "Home" }],
    });

    fetchCounts();

    return () => setHeader({});
  }, []);

  const fetchCounts = async () => {
    try {
      // Get count of pending purchase orders
      const pendingApprovals = await get("method/frappe.client.get_count", {
        doctype: "Purchase Order",
        filters: JSON.stringify({ status: "Pending" }),
      });

      // Get open expense claims
      const openRequests = await get("method/frappe.client.get_count", {
        doctype: "Expense Claim",
        filters: JSON.stringify({ status: "Open" }),
      });

      // Get active jobs/work orders
      const activeJobs = await get("method/frappe.client.get_count", {
        doctype: "Job Card",
        filters: JSON.stringify({ status: "Open" }),
      });

      // Get pending quality inspections
      const qcPending = await get("method/frappe.client.get_count", {
        doctype: "Quality Inspection",
        filters: JSON.stringify({ status: "Pending" }),
      });

      setCounts({
        pendingApprovals: pendingApprovals.message || 0,
        openRequests: openRequests.message || 0,
        activeJobs: activeJobs.message || 0,
        qcPending: qcPending.message || 0,
      });
    } catch (error) {
      console.error("Failed to fetch counts:", error);
    }
  };

  const allModules = [
    {
      title: "Approvals",
      icon: "bi-check2-square",
      route: "/approvals",
      description: "Pending approvals",
      highlight: true,
      badge: counts.pendingApprovals,
      moduleKey: "Approvals",
    },
    {
      title: "Production",
      icon: "bi-gear",
      route: "/production",
      description: "Work orders & job cards",
      moduleKey: "Production",
    },
    {
      title: "Store",
      icon: "bi-box-seam",
      route: "/store",
      description: "Inventory & stock",
      moduleKey: "Stock",
    },
    {
      title: "Requests",
      icon: "bi-inbox",
      route: "/requests",
      description: "Employee requests",
      moduleKey: "ESS",
    },
    {
      title: "Quality",
      icon: "bi-shield-check",
      route: "/quality",
      description: "Inspection & QC",
      moduleKey: "Quality",
    },
    {
      title: "HR",
      icon: "bi-people",
      route: "/hr",
      description: "Employee master, attendance & payroll",
      moduleKey: "HR",
    },
    {
      title: "Sales",
      icon: "bi-cart",
      route: "/sales",
      description: "Customers, orders & invoices",
      moduleKey: "Sales",
    },
    {
      title: "Purchase",
      icon: "bi-truck",
      route: "/purchase",
      description: "Suppliers & purchase orders",
      moduleKey: "Purchase",
    },
    {
      title: "Employee Self Service",
      icon: "bi-person-badge",
      route: "/ess",
      description: "My profile, leave & salary",
      moduleKey: "ESS",
    },
    {
      title: "Reports",
      icon: "bi-bar-chart",
      route: "/reports",
      description: "Analytics & reports",
      moduleKey: "Reports",
    },
  ];

  // Filter by role access
  const modules = allModules.filter((m) => hasModuleAccess(m.moduleKey));

  const approvals = modules.find((m) => m.highlight);
  const others = modules.filter((m) => !m.highlight);

  return (
    <div className="pt-4" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* ================= 🔥 HIGHLIGHT CARD ================= */}
      {approvals && (
        <div className="card mb-4" onClick={() => navigate(approvals.route)}>
          <div className="card-body d-flex align-items-center justify-content-between cursor-pointer">
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded d-flex align-items-center justify-content-center"
                style={{
                  width: 52,
                  height: 52,
                  background: "rgba(245, 158, 11, 0.15)",
                  fontSize: 22,
                }}
              >
                <i className={`bi ${approvals.icon}`} />
              </div>

              <div>
                <div className="fw-bold" style={{ fontSize: 16 }}>
                  {approvals.title}
                </div>
                <div className="text-muted small">{approvals.description}</div>
              </div>
            </div>

            {approvals.badge && (
              <span className="badge bg-danger fs-6">{approvals.badge}</span>
            )}
          </div>
        </div>
      )}

      {/* ================= 📊 QUICK STATS ================= */}
      <div className="row g-2 mb-4">
        <div className="col-6 col-md-3">
          <div className="card text-center p-2">
            <div className="stat-value">{counts.openRequests}</div>
            <div className="stat-label">Open Requests</div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card text-center p-2">
            <div className="stat-value">{counts.pendingApprovals}</div>
            <div className="stat-label">Pending Approvals</div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card text-center p-2">
            <div className="stat-value">{counts.activeJobs}</div>
            <div className="stat-label">Active Jobs</div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card text-center p-2">
            <div className="stat-value">{counts.qcPending}</div>
            <div className="stat-label">QC Pending</div>
          </div>
        </div>
      </div>

      {/* ================= 📦 MODULE GRID ================= */}
      <div className="row">
        {others.map((m, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4 mb-4 cursor-pointer">
            <div className="position-relative">
              {m.badge && (
                <span
                  className="badge bg-danger position-absolute"
                  style={{ top: 10, right: 10, zIndex: 1 }}
                >
                  {m.badge}
                </span>
              )}

              <ActionTile
                tile={{
                  ...m,
                  primary: true,
                }}
                onClick={() => navigate(m.route)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
