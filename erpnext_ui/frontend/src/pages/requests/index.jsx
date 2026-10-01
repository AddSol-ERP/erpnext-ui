import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useTranslation } from "react-i18next";
import { Clock, CalendarCheck, Receipt, Inbox } from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";

const MODULE_DEFS = [
  {
    key: "attendance",
    icon: Clock,
    route: "/requests/attendance",
  },
  {
    key: "leave",
    icon: CalendarCheck,
    route: "/requests/leave",
  },
  {
    key: "expense",
    icon: Receipt,
    route: "/requests/expense",
  },
];

export default function RequestDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  useEffect(() => {
    setHeader({
      title: t("requests.header.title"),
      subtitle: t("requests.header.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("requests.header.title") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = MODULE_DEFS.map((m) => ({
    ...m,
    titleKey: `requests.tiles.${m.key}.title`,
    descriptionKey: `requests.tiles.${m.key}.description`,
  }));

  return (
    <DashboardShell>
      <DashboardHero
        icon={Inbox}
        description={t("requests.header.subtitle")}
      />
      <ModuleGrid items={modules} onClick={(tile) => navigate(tile.route)} />
    </DashboardShell>
  );
}
