import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";

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
  const cards = [
    {
      title: "Attendance Report",
      desc: "View attendance calendar & team data",
      icon: "bi-calendar3",
      path: "/reports/attendance",
    },
  ];

  return (
    <div className="container-fluid px-2 px-md-3">
      <div className="row g-3">
        {cards.map((c, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4 col-xl-3 cursor-pointer">
            <div
              className="card h-100 shadow-sm border-0"
              style={{ cursor: "pointer" }}
              onClick={() => navigate(c.path)}
            >
              <div className="card-body d-flex align-items-center">
                <div
                  className="me-3 rounded-circle text-white d-flex align-items-center justify-content-center"
                  style={{ width: 50, height: 50, backgroundColor: "#4f46e5" }}
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

      {/* EMPTY STATE FOR FUTURE */}
      <div className="text-muted small mt-4">More reports coming soon...</div>
    </div>
  );
}
