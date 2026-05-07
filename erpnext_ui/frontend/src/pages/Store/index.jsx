import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import ActionTile from "../../components/ActionTile";

export default function StoreDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Store",
      subtitle: "Inventory, material requests & stock flow",

      breadcrumbs: [{ label: "Home", path: "/" }, { label: "Store" }],

      actions: [], // add only real actions if needed
    });

    return () => setHeader({});
  }, []);

  const modules = [
    {
      title: "Stock Entry",
      icon: "bi-box-seam",
      route: "stock-entry",
      description: "Material Issue, Receipt, Transfer",
      highlight: true, // 🔥 most used
    },
    {
      title: "Material Request",
      icon: "bi-inbox",
      route: "material-request",
      description: "Request raw materials",
      badge: 5, // 🔥 pending requests (dynamic later)
    },
    {
      title: "Delivery / Dispatch",
      icon: "bi-truck",
      route: "delivery",
      description: "Manage outgoing materials",
    },
    {
      title: "Stock Balance",
      icon: "bi-bar-chart",
      route: "stock-balance",
      description: "View stock availability",
    },
    {
      title: "Item Master",
      icon: "bi-box",
      route: "items",
      description: "Manage items & variants",
    },
  ];

  return (
    <div className="pt-4">
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-lg-4 col-md-6 mb-4 cursor-pointer">
            <div className="position-relative">
              {/* 🔥 Badge */}
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
                  color: m.highlight
                    ? "var(--color-warning)"
                    : "var(--brand-primary)",
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
