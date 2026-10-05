import { Lock } from "lucide-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRole } from "../context/RoleContext";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Deep-link guard for `/approvals/:doctype`.
 *
 * Two things are being stopped here:
 *
 * 1. Permission. The Approvals hub hides doctypes the user cannot read, but
 *    #/approvals/<doctype> is a plain hash that anyone can type or share.
 *    Without this guard the page shell, filter chips and column headers render
 *    before the server rejects the list request.
 *
 * 2. Unlisted doctypes. `doctypeAccess.approvals` only contains the doctypes
 *    the hub declares, so an unrecognised value such as #/approvals/Employee or
 *    #/approvals/Salary Slip resolves to `undefined` and is treated as "no
 *    access" rather than passed through to a generic list view. That keeps this
 *    route from becoming a permission-free way to open any list the SPA can
 *    render.
 *
 * Fails closed while permissions are loading, so the page cannot flash before
 * the check resolves.
 */
export default function RequireApprovalDoctypeAccess({ children }) {
  const { doctype } = useParams();
  const { canReadApprovalDoctype, loading } = useRole();
  const { t } = useTranslation();

  if (loading) return null;

  if (!canReadApprovalDoctype(doctype)) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <Lock className="size-6 text-muted-foreground" />
          <EmptyTitle>{t("approvals.noAccessTitle")}</EmptyTitle>
          <EmptyDescription>{t("approvals.noAccessHint")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return children;
}
