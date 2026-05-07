import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";

export default function MaterialRequestDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Material Requests",
      subtitle: "Track and manage all material requests",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Store", path: "/store" },
        { label: "Material Requests" },
      ],

      actions: [
        {
          label: "+ New",
          onClick: () => navigate("/store/material-request/type/Purchase/new"),
        },
      ],
    });

    return () => setHeader({});
  }, []);

  const tiles = [
    {
      title: "Purchase Request",
      type: "Purchase",
      icon: "bi-cart",
      color: "primary",
      desc: "Request items for purchase",
    },
    {
      title: "Material Transfer",
      type: "Transfer",
      icon: "bi-arrow-left-right",
      color: "info",
      desc: "Move stock between warehouses",
    },
    {
      title: "Material Issue",
      type: "Material Issue",
      icon: "bi-box-arrow-up",
      color: "warning",
      desc: "Issue material for usage",
    },
    {
      title: "Material Receipt",
      type: "Material Receipt",
      icon: "bi-box-arrow-in-down",
      color: "success",
      desc: "Receive materials",
    },
    {
      title: "Customer Provided",
      type: "Customer Provided",
      icon: "bi-person-check",
      color: "secondary",
      desc: "Customer supplied materials",
    },
  ];

  return (
    <div className="container-fluid px-2 px-md-3">
      <div className="row g-3">
        {tiles.map((t, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4">
            <div
              className="card h-100 border-0 shadow-sm"
              style={{ cursor: "pointer" }}
              onClick={() => navigate(`type/${t.type}`)}
            >
              <div className="card-body d-flex align-items-center">
                <div
                  className={`me-3 rounded-circle bg-${t.color} text-white d-flex align-items-center justify-content-center`}
                  style={{ width: 50, height: 50 }}
                >
                  <i className={`bi ${t.icon}`} />
                </div>

                <div>
                  <div className="fw-bold">{t.title}</div>
                  <div className="text-muted small">{t.desc}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
