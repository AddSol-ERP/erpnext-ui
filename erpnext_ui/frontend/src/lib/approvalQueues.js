import { get } from "../services/api";

/**
 * How many approval documents are waiting, per doctype and in total.
 *
 * WHY THE SERVER COUNTS THESE
 * ---------------------------
 * "Waiting for approval" is a property of the doctype's **Workflow**, and the
 * state it waits in is admin-authored: `Waiting For Approval` for Quotation
 * and Purchase Order, `Pending Leave Approver` / `Pending HR Approval` for
 * leave, `status` rather than `workflow_state` on the IMS doctypes, and
 * anything at all on a site whose workflows were written in another language.
 *
 * Both callers used to derive the numbers in JavaScript and both were wrong:
 *
 *   - the Approvals tile asked for `status == "Pending"`, a value NONE of these
 *     doctypes has, so a Quotation sitting in `workflow_state == "Waiting For
 *     Approval"` counted as zero;
 *   - the home card counted Purchase Orders with `status == "Pending"` -- the
 *     same non-existent value -- so it was zero even when the hub was not.
 *
 * `api.py:get_approval_queues` reads the states off the Workflow (via the same
 * `_workflow_queues` helper the per-doctype meta uses) and counts them
 * server-side. One request, and the card, the tile and the list's base filter
 * cannot disagree about what "pending" means.
 *
 * This list is NOT an access-control boundary: the endpoint returns only the
 * doctypes the caller may read, and every tile is additionally gated by
 * `RoleContext.canReadApprovalDoctype` (AGENTS.md invariant 8).
 */
export const APPROVAL_QUEUE_DOCTYPES = [
  "Purchase Order",
  "Expense Claim",
  "Leave Application",
  "Attendance Request",
  "Quotation",
  "Overtime Log",
];

/** The shape every caller can rely on, including when the call fails. */
const EMPTY = { totalPending: 0, doctypes: {} };

/**
 * `{totalPending, doctypes: {[doctype]: {pending, approved}}}`.
 *
 * A failure resolves to zeros rather than throwing: the hub still has to render
 * its tiles, and a count is not worth an error screen. It is never cached, so
 * the next mount (or navigation back to Home) retries.
 */
export async function getApprovalQueues() {
  try {
    const res = await get("method/erpnext_ui.api.get_approval_queues");
    const message = res?.message;
    if (!message || typeof message.total_pending !== "number") return EMPTY;

    const doctypes = {};
    for (const [doctype, row] of Object.entries(message.doctypes || {})) {
      doctypes[doctype] = {
        pending: Number(row?.pending) || 0,
        approved: Number(row?.approved) || 0,
      };
    }
    return { totalPending: message.total_pending, doctypes };
  } catch (error) {
    console.error("Failed to load approval counts:", error);
    return EMPTY;
  }
}

/** One doctype's counts, defaulting rather than returning `undefined`. */
export function queueFor(queues, doctype) {
  return queues?.doctypes?.[doctype] || { pending: 0, approved: 0 };
}
