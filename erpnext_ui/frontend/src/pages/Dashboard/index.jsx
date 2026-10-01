import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckSquare,
  Cog,
  Package,
  Inbox,
  ShieldCheck,
  Users,
  ShoppingCart,
  Truck,
  UserCheck,
  BarChart3,
  LayoutDashboard,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import StatRow from "../../components/dashboard/StatRow";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import StatCard from "../../components/StatCard";
import { get } from "../../services/api";
import { useRole } from "../../context/RoleContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const MODULE_DEFS = [
  {
    key: "approvals",
    icon: CheckSquare,
    route: "/approvals",
    highlight: true,
    moduleKey: "Approvals",
  },
  { key: "production", icon: Cog, route: "/production", moduleKey: "Production" },
  { key: "store", icon: Package, route: "/store", moduleKey: "Stock" },
  { key: "requests", icon: Inbox, route: "/requests", moduleKey: "ESS" },
  { key: "quality", icon: ShieldCheck, route: "/quality", moduleKey: "Quality" },
  { key: "hr", icon: Users, route: "/hr", moduleKey: "HR" },
  { key: "sales", icon: ShoppingCart, route: "/sales", moduleKey: "Sales" },
  { key: "purchase", icon: Truck, route: "/purchase", moduleKey: "Purchase" },
  { key: "ess", icon: UserCheck, route: "/ess", moduleKey: "ESS" },
  { key: "reports", icon: BarChart3, route: "/reports", moduleKey: "Reports" },
];

const STAT_DEFS = [
  { key: "openRequests", labelKey: "dashboard.openRequests", icon: Inbox },
  { key: "pendingApprovals", labelKey: "dashboard.pendingApprovals", icon: CheckSquare },
  { key: "activeJobs", labelKey: "dashboard.activeJobs", icon: Cog },
  { key: "qcPending", labelKey: "dashboard.qcPending", icon: ShieldCheck },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { hasModuleAccess } = useRole();
  const { t } = useTranslation();
  const [counts, setCounts] = useState({
    pendingApprovals: 0,
    openRequests: 0,
    activeJobs: 0,
    qcPending: 0,
  });

  const fetchCounts = async () => {
    try {
      const pendingApprovals = await get("method/frappe.client.get_count", {
        doctype: "Purchase Order",
        filters: JSON.stringify({ status: "Pending" }),
      });

      const openRequests = await get("method/frappe.client.get_count", {
        doctype: "Expense Claim",
        filters: JSON.stringify({ status: "Open" }),
      });

      const activeJobs = await get("method/frappe.client.get_count", {
        doctype: "Job Card",
        filters: JSON.stringify({ status: "Open" }),
      });

      const qcPending = await get("method/frappe.client.get_count", {
        doctype: "Quality Inspection",
        filters: JSON.stringify({ status: "Pending" }),
      });

      setCounts({
        pendingApprovals: pendingApprovals.message || 0,
        openRequests: openRequests.message || 0,
        activeJobs: activeJobs.message || 0,
        qcPending: qcPending.message || 0,
      });
    } catch (error) {
      console.error("Failed to fetch counts:", error);
    }
  };

  useEffect(() => {
    setHeader({
      title: t("dashboard.title"),
      subtitle: t("dashboard.subtitle"),
      breadcrumbs: [{ label: t("common.home"), path: "/" }],
    });

    // fetchCounts only setStates after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCounts();

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = MODULE_DEFS.filter((m) => hasModuleAccess(m.moduleKey)).map(
    (m) => ({
      ...m,
      titleKey: `modules.${m.key}.title`,
      descriptionKey: `modules.${m.key}.description`,
      badge: m.highlight ? counts.pendingApprovals : undefined,
    }),
  );

  const approvals = modules.find((m) => m.highlight);
  const others = modules.filter((m) => !m.highlight);

  return (
    <DashboardShell>
      <DashboardHero
        icon={LayoutDashboard}
        description={t("dashboard.subtitle")}
      />

      {/* Highlight Approvals */}
      {approvals && (
        <Card
          className="cursor-pointer rounded-none transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-primary/40"
          onClick={() => navigate(approvals.route)}
        >
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                <approvals.icon className="size-6" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">
                  {t(approvals.titleKey)}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {t(approvals.descriptionKey)}
                </div>
              </div>
            </div>

            {approvals.badge > 0 && (
              <Badge
                variant="outline"
                className="shrink-0 bg-destructive/15 px-2.5 py-1 text-sm text-destructive ring-destructive/30"
              >
                {approvals.badge}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      <StatRow>
        {STAT_DEFS.map((s) => (
          <StatCard
            key={s.key}
            value={counts[s.key]}
            label={t(s.labelKey)}
            icon={s.icon}
          />
        ))}
      </StatRow>

      <ModuleGrid items={others} onClick={(tile) => navigate(tile.route)} />
    </DashboardShell>
  );
}
