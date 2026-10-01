import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import { useTranslation } from "react-i18next";
import {
  ShoppingCart,
  ArrowLeftRight,
  PackageOpen,
  PackageCheck,
  Inbox,
  UserCheck,
} from "lucide-react";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import DashboardHero from "../../../components/dashboard/DashboardHero";
import ModuleGrid from "../../../components/dashboard/ModuleGrid";

const MODULE_DEFS = [
  {
    key: "purchase",
    titleKey: "store.mr.tiles.purchase",
    type: "Purchase",
    icon: ShoppingCart,
  },
  {
    key: "transfer",
    titleKey: "store.mr.tiles.transfer",
    type: "Transfer",
    icon: ArrowLeftRight,
  },
  {
    key: "issue",
    titleKey: "store.mr.tiles.issue",
    type: "Material Issue",
    icon: PackageOpen,
  },
  {
    key: "receipt",
    titleKey: "store.mr.tiles.receipt",
    type: "Material Receipt",
    icon: PackageCheck,
  },
  {
    key: "customerProvided",
    titleKey: "store.mr.tiles.customerProvided",
    type: "Customer Provided",
    icon: UserCheck,
  },
];

export default function MaterialRequestDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  useEffect(() => {
    setHeader({
      title: t("store.mr.title"),
      subtitle: t("store.mr.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.mr.title") },
      ],
      actions: [
        {
          label: t("common.new"),
          onClick: () => navigate("/store/material-request/type/Purchase/new"),
        },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = MODULE_DEFS.map((m) => ({
    ...m,
    titleKey: `${m.titleKey}.title`,
    descriptionKey: `${m.titleKey}.description`,
  }));

  return (
    <DashboardShell>
      <DashboardHero icon={Inbox} description={t("store.mr.subtitle")} />
      <ModuleGrid
        items={modules}
        onClick={(tile) => navigate(`/store/material-request/type/${tile.type}`)}
      />
    </DashboardShell>
  );
}
