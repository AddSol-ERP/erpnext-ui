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
 * Deep-link guard for app-owned settings screens.
 *
 * Hiding the settings action is not access control: HashRouter URLs are
 * typeable. The server still checks System Manager on every settings call, but
 * without this guard the page shell and field catalog request would render
 * first. Fails closed while permissions load.
 */
export default function RequireSystemManager({ children }) {
  const { userRoles = [], loading } = useRole();
  const { t } = useTranslation();

  if (loading) return null;

  const allowed =
    userRoles.includes("System Manager") || userRoles.includes("Administrator");

  if (!allowed) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <Lock className="size-6 text-muted-foreground" />
          <EmptyTitle>
            {t("store.supplierQuotationSettings.noAccessTitle")}
          </EmptyTitle>
          <EmptyDescription>
            {t("store.supplierQuotationSettings.noAccessHint")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return children;
}
