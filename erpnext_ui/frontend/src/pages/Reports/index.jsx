import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../context/HeaderContext";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import { CalendarCheck, CalendarX, PieChart, BarChart3 } from "lucide-react";

export default function ReportDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  useEffect(() => {
    setHeader({
      title: t("nav.reports"),
      subtitle: t("reports.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.reports") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = [
    {
      key: "attendance",
      title: t("reports.attendance"),
      description: t("reports.attendanceDesc"),
      icon: CalendarCheck,
      route: "/reports/attendance",
    },
    {
      key: "overtime",
      title: t("reports.overtime"),
      description: t("reports.overtimeDesc"),
      icon: CalendarX,
      route: "/reports/overtime",
    },
    {
      key: "leave-balance",
      title: t("reports.leaveBalance"),
      description: t("reports.leaveBalanceDesc"),
      icon: PieChart,
      route: "/reports/leave-balance",
    },
  ];

  return (
    <DashboardShell>
      <DashboardHero icon={BarChart3} description={t("reports.subtitle")} />
      <ModuleGrid items={modules} onClick={(tile) => navigate(tile.route)} />
    </DashboardShell>
  );
}
