import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";

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

  const cards = [
    {
      title: "Attendance Request",
      desc: "Fix attendance entries",
      icon: "bi-clock-history",
      path: "/requests/attendance",
      color: "primary",
    },
    {
      title: "Leave Request",
      desc: "Apply for leave",
      icon: "bi-calendar-check",
      path: "/requests/leave",
      color: "success",
    },
    {
      title: "Expense Request",
      desc: "Submit expenses",
      icon: "bi-receipt",
      path: "/requests/expense",
      color: "warning",
    },
  ];

  return (
    <div className="container-fluid px-2 px-md-3">
      <div className="row g-3">
        {cards.map((c, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4">
            <div
              className={`card h-100 shadow-sm border-0 cursor-pointer`}
              style={{ cursor: "pointer" }}
              onClick={() => navigate(c.path)}
            >
              <div className="card-body d-flex align-items-center">
                <div
                  className={`me-3 rounded-circle bg-${c.color} text-white d-flex align-items-center justify-content-center`}
                  style={{ width: 50, height: 50 }}
                >
                  <i className={`bi ${c.icon}`} />
                </div>

                <div>
                  <div className="fw-bold">{c.title}</div>
                  <div className="text-muted small">{c.desc}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
