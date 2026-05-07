import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import ActionTile from "../../components/ActionTile";

export default function ProductionDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Production",
      subtitle: "Work orders, job cards & manufacturing",

      breadcrumbs: [{ label: "Home", path: "/" }, { label: "Production" }],

      actions: [], // keep empty unless real actions needed
    });

    return () => setHeader({});
  }, []);

  const modules = [
    {
      title: "Work Order",
      icon: "bi-check2-square",
      route: "work-order",
      description: "Manage Work Orders",
      highlight: true, // 🔥 important module
      badge: 3, // optional (dynamic later)
    },
    {
      title: "Job Cards",
      icon: "bi-gear",
      route: "job-cards",
      description: "Manage work orders & job cards",
    },
  ];

  return (
    <div className="pt-4">
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-lg-4 col-md-6 mb-4 cursor-pointer">
            <div className="position-relative">
              {/* 🔥 Badge (optional) */}
              {m.badge ? (
                <span
                  className="badge bg-danger position-absolute"
                  style={{ top: "10px", right: "10px", zIndex: 1 }}
                >
                  {m.badge}
                </span>
              ) : null}

              <ActionTile
                tile={{
                  ...m,
                  color: m.highlight
                    ? "var(--color-warning)" // 🔥 highlight approvals
                    : "var(--brand-primary)",
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
