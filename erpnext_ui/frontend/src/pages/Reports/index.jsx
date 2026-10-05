import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../context/HeaderContext";
import { useRole } from "../../context/RoleContext";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  BarChart3,
  CalendarCheck,
  CalendarX,
  Lock,
  PieChart,
} from "lucide-react";

export default function ReportDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  // Each report is gated on read permission for the doctype it is built from,
  // resolved server-side in erpnext_ui.api.get_ui_access via
  // frappe.has_permission(doctype, "read"). The `key` here must match the keys
  // in SPA_REPORT_DOCTYPES on the Python side.
  const { canReadReport, loading: rolesLoading } = useRole();

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

  const allModules = [
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

  // Visibility reflects permission only. A readable report is listed even when
  // it currently has no rows, so entries do not appear and disappear as data
  // changes.
  const modules = allModules.filter((item) => canReadReport(item.key));

  return (
    <DashboardShell>
      <DashboardHero icon={BarChart3} description={t("reports.subtitle")} />

      {/* Hold the grid back until permissions resolve, otherwise the page would
          flash empty for users who do have access. */}
      {rolesLoading ? null : !modules.length ? (
        <Empty className="border">
          <EmptyHeader>
            <Lock className="size-6 text-muted-foreground" />
            <EmptyTitle>{t("reports.noAccessTitle")}</EmptyTitle>
            <EmptyDescription>{t("reports.noAccessHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ModuleGrid items={modules} onClick={(tile) => navigate(tile.route)} />
      )}
    </DashboardShell>
  );
}
