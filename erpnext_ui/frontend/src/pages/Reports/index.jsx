import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import ActionTile from "../../components/ActionTile";

export default function ReportDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Reports",
      subtitle: "View analytics, insights and operational reports",

      breadcrumbs: [{ label: "Home", path: "/" }, { label: "Reports" }],
    });

    return () => setHeader({});
  }, []);
  const modules = [
    {
      title: "Attendance Report",
      description: "View attendance calendar & team data",
      icon: "bi-calendar3",
      route: "/reports/attendance",
    },
    {
      title: "Overtime Report",
      description: "View overtime data across employees",
      icon: "bi-hourglass-split",
      route: "/reports/overtime",
    },
  ];

  return (
    <div className="pt-4" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4 mb-4 cursor-pointer">
            <ActionTile
              tile={{
                ...m,
                color: "#4f46e5",
                primary: true,
              }}
              onClick={() => navigate(m.route)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
