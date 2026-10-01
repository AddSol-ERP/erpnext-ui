import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  User,
  Building2,
  Bookmark,
  CalendarCheck,
  CalendarHeart,
  Clock,
  Banknote,
  Receipt,
  Briefcase,
  Contact,
  Users,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import { createTileNav } from "../../lib/tileNav";

const MODULE_DEFS = [
  {
    key: "employee",
    icon: User,
    route: "/hr/Employee",
    createRoute: "/hr/Employee/new",
  },
  {
    key: "department",
    icon: Building2,
    route: "/hr/Department",
    createRoute: "/hr/Department/new",
  },
  {
    key: "designation",
    icon: Bookmark,
    route: "/hr/Designation",
    createRoute: "/hr/Designation/new",
  },
  {
    key: "leaveType",
    icon: CalendarCheck,
    route: "/hr/Leave Type",
    createRoute: "/hr/Leave Type/new",
  },
  {
    key: "holidayList",
    icon: CalendarHeart,
    route: "/hr/Holiday List",
    createRoute: "/hr/Holiday List/new",
  },
  {
    key: "attendance",
    icon: Clock,
    route: "/hr/Attendance",
  },
  {
    key: "salaryStructure",
    icon: Banknote,
    route: "/hr/Salary Structure",
    createRoute: "/hr/Salary Structure/new",
  },
  {
    key: "salarySlip",
    icon: Receipt,
    route: "/hr/Salary Slip",
  },
  {
    key: "jobOpening",
    icon: Briefcase,
    route: "/hr/Job Opening",
    createRoute: "/hr/Job Opening/new",
  },
  {
    key: "jobApplicant",
    icon: Contact,
    route: "/hr/Job Applicant",
    createRoute: "/hr/Job Applicant/new",
  },
];

export default function HRDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const handleTileClick = createTileNav(navigate);

  useEffect(() => {
    setHeader({
      title: t("hr.header.title"),
      subtitle: t("hr.header.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("hr.header.title") },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = MODULE_DEFS.map((m) => ({
    ...m,
    titleKey: `hr.tiles.${m.key}.title`,
    descriptionKey: `hr.tiles.${m.key}.description`,
  }));

  return (
    <DashboardShell>
      <DashboardHero icon={Users} description={t("hr.header.subtitle")} />
      <ModuleGrid items={modules} onClick={handleTileClick} />
    </DashboardShell>
  );
}
