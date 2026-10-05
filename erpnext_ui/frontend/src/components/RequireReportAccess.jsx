import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRole } from "../context/RoleContext";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Deep-link guard for a single report route.
 *
 * Hiding a report from the hub and the sidebar stops the obvious route in, but
 * the URL is still typeable and still bookmarkable, and this SPA uses
 * HashRouter so every route is a plain hash that anyone can share. Without this
 * guard a user with no read permission on Attendance could open
 * #/reports/attendance directly; the server would reject the data request, but
 * the page shell, filters and column headers would already have rendered.
 *
 * Fails closed while permissions are still loading: the child is withheld
 * rather than briefly flashed. `useRole().loading` clears on both the success
 * and failure paths, so this cannot hang on a spinner.
 */
export default function RequireReportAccess({ reportKey, children }) {
  const { canReadReport, loading } = useRole();
  const { t } = useTranslation();

  if (loading) return null;

  if (!canReadReport(reportKey)) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <Lock className="size-6 text-muted-foreground" />
          <EmptyTitle>{t("reports.noAccessTitle")}</EmptyTitle>
          <EmptyDescription>{t("reports.noAccessHint")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return children;
}
