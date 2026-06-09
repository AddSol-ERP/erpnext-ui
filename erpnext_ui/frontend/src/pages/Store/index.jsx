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
      highlight: true,
    },
    {
      title: "Material Request",
      icon: "bi-inbox",
      route: "material-request",
      description: "Request raw materials",
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
      route: "/store/Item",
      description: "Manage items & variants",
      createRoute: "/store/Item/new",
    },
    {
      title: "Warehouse",
      icon: "bi-building",
      route: "/store/Warehouse",
      description: "Manage warehouses",
      createRoute: "/store/Warehouse/new",
    },
    {
      title: "Stock Reconciliation",
      icon: "bi-arrow-repeat",
      route: "/store/Stock Reconciliation",
      description: "Reconcile stock quantities",
      createRoute: "/store/Stock Reconciliation/new",
    },
  ];

  return (
    <div className="pt-4" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      <div className="row">
        {modules.map((m, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4 col-xl-3 mb-4 cursor-pointer">
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
