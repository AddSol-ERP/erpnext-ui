import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import ActionTile from "../../components/ActionTile";

export default function SalesDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Sales",
      subtitle: "Customers, leads, opportunities & orders",
      breadcrumbs: [{ label: "Home", path: "/" }, { label: "Sales" }],
    });
    return () => setHeader({});
  }, []);

  const modules = [
    {
      title: "Customer",
      icon: "bi-people",
      route: "/sales/Customer",
      description: "Manage customer records",
      createRoute: "/sales/Customer/new",
      color: "#4f46e5",
    },
    {
      title: "Lead",
      icon: "bi-person-plus",
      route: "/sales/Lead",
      description: "Track sales leads",
      createRoute: "/sales/Lead/new",
      color: "#4f46e5",
    },
    {
      title: "Opportunity",
      icon: "bi-graph-up-arrow",
      route: "/sales/Opportunity",
      description: "Manage opportunities",
      createRoute: "/sales/Opportunity/new",
      color: "#4f46e5",
    },
    {
      title: "Quotation",
      icon: "bi-file-text",
      route: "/sales/Quotation",
      description: "Customer quotations",
      createRoute: "/sales/Quotation/new",
      color: "#4f46e5",
    },
    {
      title: "Sales Order",
      icon: "bi-cart-check",
      route: "/sales/Sales Order",
      description: "Manage sales orders",
      createRoute: "/sales/Sales Order/new",
      color: "#4f46e5",
    },
    {
      title: "Sales Invoice",
      icon: "bi-receipt-cutoff",
      route: "/sales/Sales Invoice",
      description: "Create sales invoices",
      createRoute: "/sales/Sales Invoice/new",
      color: "#4f46e5",
    },
    {
      title: "Item",
      icon: "bi-box",
      route: "/sales/Item",
      description: "Manage products & services",
      createRoute: "/sales/Item/new",
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
