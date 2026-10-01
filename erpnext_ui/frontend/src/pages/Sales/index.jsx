import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  UserPlus,
  TrendingUp,
  FileText,
  ShoppingCart,
  ReceiptText,
  Package,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import { createTileNav } from "../../lib/tileNav";

const MODULE_DEFS = [
  {
    key: "customer",
    icon: Users,
    route: "/sales/Customer",
    createRoute: "/sales/Customer/new",
  },
  {
    key: "lead",
    icon: UserPlus,
    route: "/sales/Lead",
    createRoute: "/sales/Lead/new",
  },
  {
    key: "opportunity",
    icon: TrendingUp,
    route: "/sales/Opportunity",
    createRoute: "/sales/Opportunity/new",
  },
  {
    key: "quotation",
    icon: FileText,
    route: "/sales/Quotation",
    createRoute: "/sales/Quotation/new",
  },
  {
    key: "salesOrder",
    icon: ShoppingCart,
    route: "/sales/Sales Order",
    createRoute: "/sales/Sales Order/new",
  },
  {
    key: "salesInvoice",
    icon: ReceiptText,
    route: "/sales/Sales Invoice",
    createRoute: "/sales/Sales Invoice/new",
  },
  {
    key: "item",
    icon: Package,
    route: "/sales/Item",
    createRoute: "/sales/Item/new",
  },
];

export default function SalesDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const handleTileClick = createTileNav(navigate);

  useEffect(() => {
    setHeader({
      title: t("sales.header.title"),
      subtitle: t("sales.header.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("sales.header.title") },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = MODULE_DEFS.map((m) => ({
    ...m,
    titleKey: `sales.tiles.${m.key}.title`,
    descriptionKey: `sales.tiles.${m.key}.description`,
  }));

  return (
    <DashboardShell>
      <DashboardHero
        icon={TrendingUp}
        description={t("sales.header.subtitle")}
      />
      <ModuleGrid items={modules} onClick={handleTileClick} />
    </DashboardShell>
  );
}
