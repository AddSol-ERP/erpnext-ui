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
    <div className="pt-4" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4 col-xl-3 mb-4 cursor-pointer">
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
                  color: "#4f46e5",
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
