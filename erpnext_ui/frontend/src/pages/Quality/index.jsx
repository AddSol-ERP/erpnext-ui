import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import ActionTile from "../../components/ActionTile";

export default function QualityDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Quality",
      subtitle: "Inspection, quality control and reports",

      breadcrumbs: [{ label: "Home", path: "/" }, { label: "Quality" }],
    });

    return () => setHeader({});
  }, []);

  const modules = [
    {
      title: "Inspection Parameters",
      icon: "bi-sliders",
      route: "parameters",
      description: "Define inspection standards",
      highlight: true, // 🔥 core master
    },
    {
      title: "Quality Templates",
      icon: "bi-check2-square",
      route: "templates",
      description: "Configure inspection templates",
    },
    {
      title: "Quality Inspection",
      icon: "bi-gear",
      route: "inspection",
      description: "Perform inspections",
    },
    {
      title: "Non-Conformance",
      icon: "bi-exclamation-triangle",
      route: "/quality/Non Conformance",
      description: "Track quality issues",
    },
    {
      title: "Corrective Action",
      icon: "bi-tools",
      route: "/quality/Corrective Action",
      description: "Manage CAPA",
    },
    {
      title: "Quality Procedure",
      icon: "bi-journal-text",
      route: "/quality/Quality Procedure",
      description: "Quality procedures & docs",
    },
    {
      title: "Reports",
      icon: "bi-bar-chart",
      route: "reports",
      description: "Analyze quality data",
    },
  ];

  return (
    <div className="pt-4" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4 mb-4 cursor-pointer">
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
                onClick={(tile, isCreate) => {
                  if (isCreate && tile.createRoute) {
                    navigate(tile.createRoute);
                  } else {
                    navigate(m.route);
                  }
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
