import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Cog } from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import ModuleGrid from "../../components/dashboard/ModuleGrid";

export default function ProductionDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  useEffect(() => {
    setHeader({
      title: t("nav.production"),
      subtitle: t("production.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.production") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = [
    {
      key: "work-order",
      title: t("production.workOrder"),
      icon: ClipboardList,
      route: "/production/work-order",
      description: t("production.workOrderDesc"),
    },
    {
      key: "job-cards",
      title: t("production.jobCards"),
      icon: Cog,
      route: "/production/job-cards",
      description: t("production.jobCardsDesc"),
    },
  ];

  return (
    <DashboardShell>
      <ModuleGrid items={modules} onClick={(tile) => navigate(tile.route)} />
    </DashboardShell>
  );
}
