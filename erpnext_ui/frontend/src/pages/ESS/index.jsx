import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import ActionTile from "../../components/ActionTile";

export default function ESSDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Employee Self Service",
      subtitle: "My profile, attendance, leave & salary",
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Employee Self Service" },
      ],
    });
    return () => setHeader({});
  }, []);

  const modules = [
    {
      title: "My Profile",
      icon: "bi-person-circle",
      route: "/ess/profile",
      description: "View and manage your profile",
      color: "#dc2626",
    },
    {
      title: "My Leave",
      icon: "bi-calendar-check",
      route: "/requests/leave",
      description: "Apply for leave & view balance",
      color: "#dc2626",
    },
    {
      title: "My Expenses",
      icon: "bi-receipt",
      route: "/requests/expense",
      description: "Submit expense claims",
      color: "#dc2626",
    },
    {
      title: "My Attendance",
      icon: "bi-clock-history",
      route: "/requests/attendance",
      description: "Request attendance fixes",
      color: "#dc2626",
    },
    {
      title: "Attendance Logs",
      icon: "bi-calendar-month",
      route: "/ess/attendance",
      description: "Monthly calendar view with In/Out times",
      color: "#dc2626",
    },
    {
      title: "My Salary Slips",
      icon: "bi-wallet2",
      route: "/ess/Salary Slip",
      description: "View payslips",
      color: "#dc2626",
    },
    {
      title: "My Tasks",
      icon: "bi-check2-square",
      route: "/ess/ToDo",
      description: "View assigned tasks",
      color: "#dc2626",
    },
  ];

  return (
    <div className="pt-4">
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-lg-4 col-md-6 mb-4 cursor-pointer">
            <ActionTile
              tile={{
                ...m,
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
        ))}
      </div>
    </div>
  );
}
