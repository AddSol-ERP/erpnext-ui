import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Truck,
  ShoppingCart,
  Package,
  Receipt,
  FileText,
  HelpCircle,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import { createTileNav } from "../../lib/tileNav";

const MODULE_DEFS = [
  {
    key: "supplier",
    icon: Truck,
    route: "/purchase/Supplier",
    createRoute: "/purchase/Supplier/new",
  },
  {
    key: "purchaseOrder",
    icon: ShoppingCart,
    route: "/purchase/Purchase Order",
    createRoute: "/purchase/Purchase Order/new",
  },
  {
    key: "purchaseReceipt",
    icon: Package,
    route: "/purchase/Purchase Receipt",
    createRoute: "/purchase/Purchase Receipt/new",
  },
  {
    key: "purchaseInvoice",
    icon: Receipt,
    route: "/purchase/Purchase Invoice",
    createRoute: "/purchase/Purchase Invoice/new",
  },
  {
    key: "supplierQuotation",
    icon: FileText,
    route: "/purchase/Supplier Quotation",
    createRoute: "/purchase/Supplier Quotation/new",
  },
  {
    key: "requestForQuotation",
    icon: HelpCircle,
    route: "/purchase/Request for Quotation",
    createRoute: "/purchase/Request for Quotation/new",
  },
];

export default function PurchaseDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const handleTileClick = createTileNav(navigate);

  useEffect(() => {
    setHeader({
      title: t("purchase.header.title"),
      subtitle: t("purchase.header.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("purchase.header.title") },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = MODULE_DEFS.map((m) => ({
    ...m,
    titleKey: `purchase.tiles.${m.key}.title`,
    descriptionKey: `purchase.tiles.${m.key}.description`,
  }));

  return (
    <DashboardShell>
      <DashboardHero
        icon={Truck}
        description={t("purchase.header.subtitle")}
      />
      <ModuleGrid items={modules} onClick={handleTileClick} />
    </DashboardShell>
  );
}
