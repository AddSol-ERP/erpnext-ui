import { useTranslation } from "react-i18next";
import { FormField } from "./FormField";
import { StatusBadge } from "./List/StatusBadge";

/**
 * The document's status, shown as a read-only field inside the form body.
 *
 * WHY THIS IS NOT AN EDITABLE SELECT
 * ---------------------------------
 * ERPNext renders `status` on Leave Application and Attendance Request and
 * `approval_status` on Expense Claim as read-only: an approval outcome is
 * written by the Workflow, never typed by a user. Exposing an editable control
 * would let the document claim an approval that never happened.
 *
 * The value comes from `useDocStatus`, which resolves the right column for the
 * doctype (workflow_state > curated status column > docstatus) from meta rather
 * than hard-coding a field name, so this stays correct for workflow and
 * non-workflow doctypes alike and matches the header badge exactly.
 *
 * While nothing has been submitted there is no status to report, so a fresh
 * draft shows "Draft" instead of an empty control.
 */
export function DocStatusField({ label, status, className }) {
  const { t } = useTranslation();

  return (
    <FormField label={label} name="__doc_status" className={className}>
      {status ? (
        <div className="flex h-9 items-center">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
      ) : (
        <span className="flex h-9 items-center text-sm text-muted-foreground">
          {t("common.draft")}
        </span>
      )}
    </FormField>
  );
}