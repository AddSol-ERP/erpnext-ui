import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  User,
  CalendarCheck,
  PieChart,
  Receipt,
  CalendarClock,
  CalendarDays,
  Hourglass,
  Wallet,
  CheckSquare,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import ModuleGrid from "../../components/dashboard/ModuleGrid";

/**
 * The merged Employee Self Service dashboard.
 *
 * This used to be two hubs for the same people: `/requests` (leave, attendance,
 * expense) and `/ess` (everything else). Both were gated by the same
 * `moduleKey: "ESS"` and both appeared on the Dashboard and in the sidebar as
 * separate tiles, so the only difference an employee could observe was which
 * of two similar names they had to remember. Everything now lives here, once.
 *
 * Tile titles are named for the TASK, not the doctype -- "Apply for Leave"
 * rather than "Leave Application". Nobody browsing this page knows that ERPNext
 * calls it a Leave Application, and several employees here have English as a
 * second language. That naming rule is why the `ess.tiles.*` keys below are
 * deliberately not 1:1 with the ERPNext doctypes they open.
 *
 * Order is by how often an employee reaches for it, not alphabetically.
 */
const MODULE_DEFS = [
  {
    key: "profile",
    icon: User,
    route: "/ess/profile",
  },
  {
    key: "leave",
    icon: CalendarCheck,
    route: "/ess/leave",
  },
  {
    key: "leaveBalance",
    icon: PieChart,
    route: "/ess/leave-balance",
  },
  {
    key: "attendanceRequest",
    icon: CalendarClock,
    route: "/ess/attendance-request",
  },
  {
    key: "attendance",
    icon: CalendarDays,
    route: "/ess/attendance",
  },
  {
    key: "overtime",
    icon: Hourglass,
    route: "/ess/overtime",
  },
  {
    key: "expenseClaim",
    icon: Receipt,
    route: "/ess/expense-claim",
  },
  {
    key: "salarySlip",
    icon: Wallet,
    route: "/ess/salary-slip",
  },
  {
    key: "tasks",
    icon: CheckSquare,
    route: "/ess/todo",
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
      {/* No DashboardHero: the tile grid is the whole page, and a hero here
          repeated the header text that is already on screen. */}
      <ModuleGrid items={modules} onClick={handleTileClick} />
    </DashboardShell>
  );
}