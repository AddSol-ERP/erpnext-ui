import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  User,
  CalendarCheck,
  PieChart,
  Receipt,
  Clock,
  CalendarDays,
  Hourglass,
  Wallet,
  CheckSquare,
  UserCheck,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";

const MODULE_DEFS = [
  {
    key: "profile",
    icon: User,
    route: "/ess/profile",
  },
  {
    key: "leave",
    icon: CalendarCheck,
    route: "/requests/leave",
  },
  {
    key: "leaveBalance",
    icon: PieChart,
    route: "/ess/leave-balance",
  },
  {
    key: "expenses",
    icon: Receipt,
    route: "/requests/expense",
  },
  {
    key: "attendanceRequests",
    icon: Clock,
    route: "/requests/attendance",
  },
  {
    key: "attendanceLogs",
    icon: CalendarDays,
    route: "/ess/attendance",
  },
  {
    key: "overtime",
    icon: Hourglass,
    route: "/ess/overtime",
  },
  {
    key: "salarySlips",
    icon: Wallet,
    route: "/ess/Salary Slip",
  },
  {
    key: "tasks",
    icon: CheckSquare,
    route: "/ess/ToDo",
  },
];

export default function ESSDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  useEffect(() => {
    setHeader({
      title: t("ess.header.title"),
      subtitle: t("ess.header.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("ess.header.title") },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTileClick = (tile) => navigate(tile.route);

  const modules = MODULE_DEFS.map((m) => ({
    ...m,
    titleKey: `ess.tiles.${m.key}.title`,
    descriptionKey: `ess.tiles.${m.key}.description`,
  }));

  return (
    <DashboardShell>
      <DashboardHero
        icon={UserCheck}
        description={t("ess.header.subtitle")}
      />
      <ModuleGrid items={modules} onClick={handleTileClick} />
    </DashboardShell>
  );
}
