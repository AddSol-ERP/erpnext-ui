import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  House,
  CheckSquare,
  Package,
  ShieldCheck,
  Cog,
  Inbox,
  BarChart3,
  Users,
  ShoppingCart,
  Truck,
  UserCheck,
  ClipboardList,
  TruckIcon,
  Boxes,
  FileText,
  CalendarDays,
  Timer,
  Wallet,
  FileSignature,
  UserCog,
  History,
  Gauge,
  ClipboardCheck,
  FileSearch,
  ChartNoAxesCombined,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useRole } from "../context/RoleContext";
import { useHeader } from "../context/HeaderContext";
import { TopBarNav, TitleBlock, GlobalTools } from "../components/PageHeader";
import PageToolbar from "../components/PageToolbar";
import { TOP_BAR } from "../config/topBar";

/**
 * Navigation model for the app shell sidebar.
 * `moduleKey` gates visibility via RoleContext.hasModuleAccess.
 * `children` render as expandable sub-routes when present.
 */
const NAV_SECTIONS = [
  {
    id: "main",
    items: [
      { key: "dashboard", labelKey: "common.home", to: "/", icon: House },
      {
        key: "approvals",
        labelKey: "nav.approvals",
        to: "/approvals",
        icon: CheckSquare,
        moduleKey: "Approvals",
      },
    ],
  },
  {
    id: "operations",
    items: [
      {
        key: "store",
        labelKey: "nav.store",
        to: "/store",
        icon: Package,
        moduleKey: "Stock",
        children: [
          {
            key: "stock-entry",
            labelKey: "nav.stockEntry",
            to: "/store/stock-entry",
            icon: Boxes,
          },
          {
            key: "material-request",
            labelKey: "nav.materialRequest",
            to: "/store/material-request",
            icon: ClipboardList,
          },
          {
            key: "delivery",
            labelKey: "nav.deliveryNote",
            to: "/store/delivery",
            icon: TruckIcon,
          },
          {
            key: "stock-balance",
            labelKey: "nav.stockBalance",
            to: "/store/stock-balance",
            icon: FileText,
          },
        ],
      },
      {
        key: "quality",
        labelKey: "nav.quality",
        to: "/quality",
        icon: ShieldCheck,
        moduleKey: "Quality",
        children: [
          {
            key: "quality-templates",
            labelKey: "nav.qualityTemplates",
            to: "/quality/templates",
            icon: FileSignature,
          },
          {
            key: "quality-parameters",
            labelKey: "nav.qualityParameters",
            to: "/quality/parameters",
            icon: ClipboardCheck,
          },
          {
            key: "quality-inspection",
            labelKey: "nav.qualityInspection",
            to: "/quality/inspection",
            icon: FileSearch,
          },
          {
            key: "quality-reports",
            labelKey: "nav.qualityReports",
            to: "/quality/reports",
            icon: ChartNoAxesCombined,
          },
        ],
      },
      {
        key: "production",
        labelKey: "nav.production",
        to: "/production",
        icon: Cog,
        children: [
          {
            key: "job-cards",
            labelKey: "nav.jobCards",
            to: "/production/job-cards",
            icon: ClipboardList,
          },
          {
            key: "work-orders",
            labelKey: "nav.workOrders",
            to: "/production/work-order",
            icon: Gauge,
          },
        ],
      },
    ],
  },
  {
    id: "people",
    items: [
      {
        key: "requests",
        labelKey: "nav.requests",
        to: "/requests",
        icon: Inbox,
        moduleKey: "ESS",
        children: [
          {
            key: "attendance-requests",
            labelKey: "nav.attendanceRequests",
            to: "/requests/attendance",
            icon: CalendarDays,
          },
          {
            key: "leave-applications",
            labelKey: "nav.leaveApplications",
            to: "/requests/leave",
            icon: FileSignature,
          },
          {
            key: "expense-claims",
            labelKey: "nav.expenseClaims",
            to: "/requests/expense",
            icon: Wallet,
          },
        ],
      },
      {
        key: "ess",
        labelKey: "nav.ess",
        to: "/ess",
        icon: UserCheck,
        moduleKey: "ESS",
        children: [
          {
            key: "ess-profile",
            labelKey: "nav.essProfile",
            to: "/ess/profile",
            icon: UserCog,
          },
          {
            key: "ess-attendance",
            labelKey: "nav.essAttendance",
            to: "/ess/attendance",
            icon: CalendarDays,
          },
          {
            key: "ess-overtime",
            labelKey: "nav.essOvertime",
            to: "/ess/overtime",
            icon: History,
          },
          {
            key: "ess-leave-balance",
            labelKey: "nav.leaveBalance",
            to: "/ess/leave-balance",
            icon: Timer,
          },
        ],
      },
      {
        key: "hr",
        labelKey: "nav.hr",
        to: "/hr",
        icon: Users,
        moduleKey: "HR",
      },
      {
        key: "sales",
        labelKey: "nav.sales",
        to: "/sales",
        icon: ShoppingCart,
        moduleKey: "Sales",
      },
      {
        key: "purchase",
        labelKey: "nav.purchase",
        to: "/purchase",
        icon: Truck,
        moduleKey: "Purchase",
      },
    ],
  },
  {
    id: "insights",
    items: [
      {
        key: "reports",
        labelKey: "nav.reports",
        to: "/reports",
        icon: BarChart3,
        moduleKey: "Reports",
        children: [
          {
            key: "report-attendance",
            labelKey: "nav.reportAttendance",
            to: "/reports/attendance",
            icon: CalendarDays,
          },
          {
            key: "report-overtime",
            labelKey: "nav.reportOvertime",
            to: "/reports/overtime",
            icon: Timer,
          },
          {
            key: "report-leave-balance",
            labelKey: "nav.leaveBalance",
            to: "/reports/leave-balance",
            icon: FileText,
          },
        ],
      },
    ],
  },
];

function isPathActive(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavItem({ item, pathname }) {
  const { t } = useTranslation();
  const active = isPathActive(pathname, item.to);
  const Icon = item.icon;
  const label = t(item.labelKey);
  const childActive = item.children?.some((c) => isPathActive(pathname, c.to)) ?? false;
  // Controlled expand: keep active branch open; reset user toggle when leaving.
  const [userOpen, setUserOpen] = useState(false);
  const open = userOpen || active || childActive;

  // Reset open state when this item is no longer active (no cascading render while active).
  if (userOpen && !active && !childActive) {
    setUserOpen(false);
  }

  if (!item.children?.length) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={label}>
          <NavLink to={item.to}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setUserOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton asChild isActive={active} tooltip={label}>
            <NavLink to={item.to}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children.map((child) => {
              const ChildIcon = child.icon;
              const childLabel = t(child.labelKey);
              return (
                <SidebarMenuSubItem key={child.key}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isPathActive(pathname, child.to)}
                  >
                    <NavLink to={child.to}>
                      <ChildIcon />
                      <span>{childLabel}</span>
                    </NavLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { hasModuleAccess } = useRole();

  return (
    <Sidebar collapsible="icon" side="start" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={t("common.appName")}>
              <NavLink to="/">
                <div className="flex size-8 aspect-square shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <House className="size-4" />
                </div>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {t("common.appName")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    ERP
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter(
            (item) => !item.moduleKey || hasModuleAccess(item.moduleKey),
          );
          if (!visible.length) return null;

          return (
            <SidebarGroup key={section.id}>
              <SidebarGroupLabel>{t(`nav.section.${section.id}`)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => (
                    <NavItem key={item.key} item={item} pathname={location.pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
          <div className="px-2 py-2 text-center text-[10px] leading-tight text-sidebar-foreground/60">
          {t("footer.credit", {
            company: t("footer.company") || "Addition Solutions",
          })}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * AppShell — single sticky top bar + fixed light chrome PageToolbar.
 * Keeps HeaderContext/setHeader API unchanged for all pages.
 *
 * Layout:
 *   [☰][←][⌂] │ Title · breadcrumbs ──────── │ [🌐][🎨][(user)]
 *   main content (scrolls; pb when toolbar visible)
 *   [fixed light chrome bottom bar — status chips (start) + actions (end)]
 *
 * shellMode "list" (set by ListLayout): bottom-bar actions are suppressed —
 * they render inside ActionBar next to Filter instead.
 */
export default function AppShell({ children }) {
  const { header, shellMode } = useHeader();
  const {
    title = "",
    subtitle = "",
    breadcrumbs = [],
    actions = [],
    status = null,
    statusList = [],
    statusFilter = "",
    setStatusFilter = () => {},
    backFallback = "/",
    errorCount = 0,
    onErrorsClick,
  } = header || {};

  const showBottomActions = shellMode !== "list";
  const bottomActions = showBottomActions ? actions : [];
  const toolbarVisible =
    TOP_BAR.pageToolbar &&
    (bottomActions?.length > 0 || statusList?.length > 0 || errorCount > 0);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        {/* ================= SINGLE TOP BAR (solid light chrome) ================= */}
        <header
          className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-chrome px-2 pt-[env(safe-area-inset-top)] text-chrome-foreground print:hidden md:px-3"
          style={{
            "--foreground": "var(--chrome-foreground)",
            "--muted-foreground": "var(--chrome-muted)",
            "--muted": "var(--sidebar-accent)",
            "--accent": "var(--sidebar-accent)",
            "--border": "var(--chrome-border)",
            "--background": "var(--chrome)",
            "--card": "var(--chrome)",
          }}
        >
          {TOP_BAR.showSidebarTrigger && <SidebarTrigger className="ms-0.5 shrink-0" />}
          <TopBarNav backFallback={backFallback} />
          <TitleBlock
            title={title}
            subtitle={subtitle}
            breadcrumbs={breadcrumbs}
            status={status}
          />
          <GlobalTools />
        </header>

        <main
          className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 ${
            toolbarVisible ? "pb-24 print:pb-4" : "pb-4"
          }`}
        >
          {children}
        </main>

        {/* Fixed light bottom bar: page actions (forms) + status chips */}
        {toolbarVisible && (
          <PageToolbar
            actions={bottomActions}
            statusList={statusList}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            errorCount={errorCount}
            onErrorsClick={onErrorsClick}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
