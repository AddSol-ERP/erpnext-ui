import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  House,
  LayoutGrid,
  CircleUser,
  ChevronDown,
  LogOut,
} from "lucide-react";
import applyTheme from "../../utils/theme";
import { get, post } from "../../services/api";
import { getUserSync, getCurrentUser } from "../../utils/getUser";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../List/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ThemePanel from "../Theme";
import LanguageSwitcher from "../LanguageSwitcher";
import { TOP_BAR } from "../../config/topBar";

/** Shared breadcrumb row (desktop inline + mobile wrap). */
function Breadcrumbs({ breadcrumbs, navigate, className = "" }) {
  return (
    <div className={`flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground ${className}`}>
      {breadcrumbs.map((b, i) => {
        const isLast = i === breadcrumbs.length - 1;
        return (
          <div key={i} className="flex items-center gap-1">
            <span
              onClick={() => b.path && navigate(b.path)}
              className={
                b.path
                  ? "cursor-pointer transition-colors hover:text-primary"
                  : isLast
                    ? "font-medium text-foreground"
                    : ""
              }
            >
              {b.label}
            </span>
            {!isLast && <span className="opacity-40">/</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Left cluster for the single top bar: back / home / (optional desk).
 */
export function TopBarNav({ backFallback = "/" }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleBack = () => {
    const isInErpNext = window.location.pathname.includes("/app/");
    if (isInErpNext) {
      navigate(backFallback);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(backFallback);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {TOP_BAR.showBack && (
        <Button variant="ghost" size="icon-sm" onClick={handleBack} aria-label={t("common.back")}>
          <ArrowLeft />
        </Button>
      )}
      {TOP_BAR.showHome && (
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/")} aria-label={t("common.home")}>
          <House />
        </Button>
      )}
      {TOP_BAR.showDesk && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden sm:inline-flex"
          title="Desk"
          onClick={() => (window.location.href = "/app")}
        >
          <LayoutGrid />
        </Button>
      )}
    </div>
  );
}

/**
 * Center title + breadcrumbs for the single top bar.
 */
export function TitleBlock({
  title = "",
  subtitle = "",
  breadcrumbs = [],
  status = null,
}) {
  const navigate = useNavigate();

  if (!title && !breadcrumbs.length) return null;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-baseline gap-2">
        <div className="truncate text-base font-semibold leading-tight md:text-lg">{title}</div>

        {/* Read-only lifecycle badge, supplied by the form via setHeader. */}
        {status?.label && (
          <StatusBadge
            tone={status.tone}
            className="translate-y-px shrink-0 align-middle"
          >
            {status.label}
          </StatusBadge>
        )}

        {subtitle && (
          <div className="hidden truncate text-xs text-muted-foreground md:block">• {subtitle}</div>
        )}
      </div>
      {breadcrumbs.length > 0 && (
        <Breadcrumbs breadcrumbs={breadcrumbs} navigate={navigate} className="hidden md:flex" />
      )}
      {breadcrumbs.length > 0 && (
        <Breadcrumbs breadcrumbs={breadcrumbs} navigate={navigate} className="md:hidden" />
      )}
    </div>
  );
}

/**
 * Right cluster: language · theme · user menu.
 */
export function GlobalTools() {
  const { t } = useTranslation();
  const [user, setUser] = useState(() => getUserSync()?.user || "");

  useEffect(() => {
    if (user) return;
    (async () => {
      try {
        const res = await getCurrentUser(get);
        if (res) setUser(res.user);
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    if (window.frappe?.app?.logout) {
      window.frappe.app.logout();
      return;
    }
    // Routed through the shared API helper so the session's CSRF token is
    // attached -- logout is a POST and Frappe validates it like any other
    // write. `window.frappe.csrf_token` does not exist on the SPA.
    post("method/logout")
      .then(() => {
        window.location.href = "/login";
      })
      .catch(() => {
        window.location.href = "/logout";
      });
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      {TOP_BAR.showLanguage && <LanguageSwitcher />}
      {TOP_BAR.showTheme && <ThemePanel applyTheme={applyTheme} />}
      {TOP_BAR.showUser && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="max-w-40" title={user || "User"}>
              <CircleUser />
              <span className="hidden truncate sm:inline">{user || "User"}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel className="truncate text-muted-foreground">
              {user || "User"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => (window.location.href = "/app")}>
              <LayoutGrid />
              {t("nav.backToDesk")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setTimeout(handleLogout, 0);
              }}
            >
              <LogOut />
              {t("common.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/**
 * Back-compat composed header (AppShell uses named exports + PageToolbar).
 * Actions/status live in PageToolbar for the shell; kept here for any direct import.
 */
export default function PageHeader({
  title = "",
  subtitle = "",
  breadcrumbs = [],
  backFallback = "/",
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <TopBarNav backFallback={backFallback} />
        <TitleBlock title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} />
      </div>
      <GlobalTools />
    </div>
  );
}
