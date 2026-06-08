import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import ActionTile from "../../components/ActionTile";
import { useRole } from "../../context/RoleContext";

export default function HRDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { hasModuleAccess } = useRole();

  useEffect(() => {
    setHeader({
      title: "HR",
      subtitle: "Employee master, attendance, payroll & recruitment",
      breadcrumbs: [{ label: "Home", path: "/" }, { label: "HR" }],
    });
    return () => setHeader({});
  }, []);

  const modules = [
    {
      title: "Employee",
      icon: "bi-person-badge",
      route: "/hr/Employee",
      description: "Manage employee records",
      createRoute: "/hr/Employee/new",
      color: "#4f46e5",
    },
    {
      title: "Department",
      icon: "bi-building",
      route: "/hr/Department",
      description: "Manage departments",
      createRoute: "/hr/Department/new",
      color: "#4f46e5",
    },
    {
      title: "Designation",
      icon: "bi-bookmark-star",
      route: "/hr/Designation",
      description: "Manage designations",
      createRoute: "/hr/Designation/new",
      color: "#4f46e5",
    },
    {
      title: "Leave Type",
      icon: "bi-calendar-check",
      route: "/hr/Leave Type",
      description: "Configure leave types",
      createRoute: "/hr/Leave Type/new",
      color: "#4f46e5",
    },
    {
      title: "Holiday List",
      icon: "bi-calendar-heart",
      route: "/hr/Holiday List",
      description: "Manage holiday calendars",
      createRoute: "/hr/Holiday List/new",
      color: "#4f46e5",
    },
    {
      title: "Attendance",
      icon: "bi-clock-history",
      route: "/hr/Attendance",
      description: "View attendance records",
      color: "#4f46e5",
    },
    {
      title: "Salary Structure",
      icon: "bi-cash-stack",
      route: "/hr/Salary Structure",
      description: "Define salary structures",
      createRoute: "/hr/Salary Structure/new",
      color: "#4f46e5",
    },
    {
      title: "Salary Slip",
      icon: "bi-receipt",
      route: "/hr/Salary Slip",
      description: "Generate salary slips",
      color: "#4f46e5",
    },
    {
      title: "Job Opening",
      icon: "bi-briefcase",
      route: "/hr/Job Opening",
      description: "Manage job openings",
      createRoute: "/hr/Job Opening/new",
      color: "#4f46e5",
    },
    {
      title: "Job Applicant",
      icon: "bi-person-lines-fill",
      route: "/hr/Job Applicant",
      description: "Track applicants",
      createRoute: "/hr/Job Applicant/new",
      color: "#4f46e5",
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
