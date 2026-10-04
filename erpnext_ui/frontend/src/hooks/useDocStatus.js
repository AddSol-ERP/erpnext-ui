import { useEffect, useState } from "react";
import { getApprovalMeta, resolveStatusField, DOCSTATUS_STATES } from "../lib/approvalMeta";
import { statusTone } from "../components/List/statusTones";

/**
 * The document's current status, ready to render as a read-only badge.
 *
 * WHY THIS IS NOT JUST `doc.status`
 * ---------------------------------
 * Frappe models "where is this document in its lifecycle" in different columns
 * depending on the doctype, and only the doctype's meta says which one applies:
 *
 *   workflow_state   added by Frappe only when a Workflow exists; the field an
 *                    approval actually advances, so it wins when present.
 *   status /         ERPNext's own approval outcome -- `approval_status` on
 *   approval_status  Expense Claim, `status` on Leave Application, and the
 *                    curated preference lives in approvalMeta.
 *   docstatus        Draft/Submitted/Cancelled, on every submittable doctype.
 *
 * Picking the wrong one shows a stale value, e.g. a document sitting in
 * "Pending Approval" still reading "Open", which is worse than showing nothing.
 * So the field is resolved from meta at runtime, not hard-coded per screen.
 *
 * @param {string} doctype
 * @param {object} doc             the document being displayed
 * @param {string} [preferredField] override the curated status column
 * @returns {{label: string, tone: string, source: string} | null}
 *          null when the document has no status worth showing
 */
export function useDocStatus({ doctype, doc, preferredField } = {}) {
  const [resolved, setResolved] = useState(null);

  const name = doc?.name;
  // Only the fields that can carry a status, so a re-render of the form (every
  // keystroke) does not re-run the meta lookup.
  const workflowState = doc?.workflow_state;
  const status = doc?.status;
  const approvalStatus = doc?.approval_status;
  const docstatus = doc?.docstatus;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const meta = await getApprovalMeta(doctype);
      if (cancelled) return;

      const field = preferredField || resolveStatusField(meta, doctype);
      const byMeta = (name) => Boolean(meta?.fieldSet?.has(name));

      // Precedence: workflow_state > curated status column > status >
      // approval_status > docstatus.
      let value;
      let source;

      if (workflowState && byMeta("workflow_state")) {
        value = workflowState;
        source = "workflow_state";
      } else if (status && byMeta(field)) {
        value = status;
        source = field;
      } else if (status && !meta) {
        // Meta unavailable (offline / permission): still show what we were
        // given rather than dropping the badge entirely.
        value = status;
        source = field;
      } else if (approvalStatus && (!meta || byMeta("approval_status"))) {
        value = approvalStatus;
        source = "approval_status";
      } else if (
        docstatus != null &&
        (meta?.isSubmittable || (!meta && Number(docstatus) !== 0))
      ) {
        value = DOCSTATUS_STATES[Number(docstatus)];
        source = "docstatus";
      }

      if (!value) {
        setResolved(null);
        return;
      }

      setResolved({ label: String(value), tone: statusTone(value), source });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    doctype,
    name,
    preferredField,
    workflowState,
    status,
    approvalStatus,
    docstatus,
  ]);

  return resolved;
}
