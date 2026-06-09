import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import ActionTile from "../../components/ActionTile";

export default function RequestDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Requests",
      subtitle: "Create and manage employee requests",

      breadcrumbs: [{ label: "Home", path: "/" }, { label: "Requests" }],

      actions: [],
    });

    return () => setHeader({});
  }, []);

  const modules = [
    {
      title: "Attendance Request",
      description: "Fix attendance entries",
      icon: "bi-clock-history",
      route: "/requests/attendance",
    },
    {
      title: "Leave Request",
      description: "Apply for leave",
      icon: "bi-calendar-check",
      route: "/requests/leave",
    },
    {
      title: "Expense Request",
      description: "Submit expenses",
      icon: "bi-receipt",
      route: "/requests/expense",
    },
  ];

  return (
    <div className="pt-4" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4 col-xl-3 mb-4 cursor-pointer">
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
