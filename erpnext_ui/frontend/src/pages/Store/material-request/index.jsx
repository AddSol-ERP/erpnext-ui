import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import ActionTile from "../../../components/ActionTile";

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

  const modules = [
    {
      title: "Purchase Request",
      type: "Purchase",
      icon: "bi-cart",
      description: "Request items for purchase",
    },
    {
      title: "Material Transfer",
      type: "Transfer",
      icon: "bi-arrow-left-right",
      description: "Move stock between warehouses",
    },
    {
      title: "Material Issue",
      type: "Material Issue",
      icon: "bi-box-arrow-up",
      description: "Issue material for usage",
    },
    {
      title: "Material Receipt",
      type: "Material Receipt",
      icon: "bi-box-arrow-in-down",
      description: "Receive materials",
    },
    {
      title: "Customer Provided",
      type: "Customer Provided",
      icon: "bi-person-check",
      description: "Customer supplied materials",
    },
  ];

  return (
    <div className="pt-4" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4 col-xl-3 mb-4 cursor-pointer">
            <div className="position-relative">
              <ActionTile
                tile={{
                  ...m,
                  color: "#4f46e5",
                  primary: true,
                }}
                onClick={() => navigate(`type/${m.type}`)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
