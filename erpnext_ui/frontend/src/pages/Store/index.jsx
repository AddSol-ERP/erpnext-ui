import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Package,
  Inbox,
  Truck,
  BarChart3,
  Boxes,
  Warehouse,
  RefreshCcw,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import { createTileNav } from "../../lib/tileNav";

const MODULE_DEFS = [
  {
    key: "stock-entry",
    titleKey: "store.tiles.stockEntry",
    icon: Package,
    route: "/store/stock-entry",
  },
  {
    key: "material-request",
    titleKey: "store.tiles.materialRequest",
    icon: Inbox,
    route: "/store/material-request",
  },
  {
    key: "delivery",
    titleKey: "store.tiles.delivery",
    icon: Truck,
    route: "/store/delivery",
  },
  {
    key: "stock-balance",
    titleKey: "store.tiles.stockBalance",
    icon: BarChart3,
    route: "/store/stock-balance",
  },
  {
    key: "item-master",
    titleKey: "store.tiles.itemMaster",
    icon: Boxes,
    route: "/store/Item",
    createRoute: "/store/Item/new",
  },
  {
    key: "warehouse",
    titleKey: "store.tiles.warehouse",
    icon: Warehouse,
    route: "/store/Warehouse",
    createRoute: "/store/Warehouse/new",
  },
  {
    key: "stock-reconciliation",
    titleKey: "store.tiles.stockReconciliation",
    icon: RefreshCcw,
    route: "/store/Stock Reconciliation",
    createRoute: "/store/Stock Reconciliation/new",
  },
];

export default function StoreDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const handleTileClick = createTileNav(navigate);

  useEffect(() => {
    setHeader({
      title: t("nav.store"),
      subtitle: t("store.hub.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = MODULE_DEFS.map((m) => ({
    ...m,
    descriptionKey: `${m.titleKey}.description`,
    titleKey: `${m.titleKey}.title`,
  }));

  return (
    <DashboardShell>
      <DashboardHero icon={Package} description={t("store.hub.subtitle")} />
      <ModuleGrid items={modules} onClick={handleTileClick} />
    </DashboardShell>
  );
}
