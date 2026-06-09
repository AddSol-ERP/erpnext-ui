import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import ActionTile from "../../components/ActionTile";

export default function PurchaseDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Purchase",
      subtitle: "Suppliers, purchase orders & invoices",
      breadcrumbs: [{ label: "Home", path: "/" }, { label: "Purchase" }],
    });
    return () => setHeader({});
  }, []);

  const modules = [
    {
      title: "Supplier",
      icon: "bi-truck",
      route: "/purchase/Supplier",
      description: "Manage supplier records",
      createRoute: "/purchase/Supplier/new",
      color: "#4f46e5",
    },
    {
      title: "Purchase Order",
      icon: "bi-cart4",
      route: "/purchase/Purchase Order",
      description: "Create purchase orders",
      createRoute: "/purchase/Purchase Order/new",
      color: "#4f46e5",
    },
    {
      title: "Purchase Receipt",
      icon: "bi-box-seam",
      route: "/purchase/Purchase Receipt",
      description: "Record goods receipt",
      createRoute: "/purchase/Purchase Receipt/new",
      color: "#4f46e5",
    },
    {
      title: "Purchase Invoice",
      icon: "bi-receipt",
      route: "/purchase/Purchase Invoice",
      description: "Supplier invoices",
      createRoute: "/purchase/Purchase Invoice/new",
      color: "#4f46e5",
    },
    {
      title: "Supplier Quotation",
      icon: "bi-file-earmark-text",
      route: "/purchase/Supplier Quotation",
      description: "Supplier quotations",
      createRoute: "/purchase/Supplier Quotation/new",
      color: "#4f46e5",
    },
    {
      title: "Request for Quotation",
      icon: "bi-question-circle",
      route: "/purchase/Request for Quotation",
      description: "Request supplier quotes",
      createRoute: "/purchase/Request for Quotation/new",
      color: "#4f46e5",
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
