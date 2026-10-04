import { post } from "../services/api";

/**
 * Approve/Reject for a Leave Application that has no Workflow.
 *
 * Why this exists: `LeaveApplication.on_submit` refuses to submit a leave whose
 * status is "Open" or "Cancelled", so submission requires status to already be
 * "Approved" or "Rejected". With a Workflow the transition action supplies that
 * state change and Submit never appears. Without a Workflow something still has
 * to move `status`, and HRMS provides no approve/reject endpoint for it --
 * `leave_application.py` only shares the document with `leave_approver` on save
 * (see `share_doc_with_approver`). So the approver sets the status here.
 */
export const LEAVE_APPROVED = "Approved";
export const LEAVE_REJECTED = "Rejected";

/**
 * Is the signed-in user the approver this document was addressed to?
 *
 * `leave_approver` is a User link, so this is an exact id comparison. Kept
 * deliberately narrow: showing the buttons to everyone with write access would
 * let an employee approve their own leave through the UI. A blank approver
 * (no approver configured for the employee) means nobody can approve here, which
 * is the correct dead end -- Save still works and the server still validates.
 */
export function canActAsLeaveApprover({ currentUser, leaveApprover } = {}) {
  return Boolean(currentUser && leaveApprover && currentUser === leaveApprover);
}

/**
 * Whether to offer Approve/Reject.
 *
 * Applies only when no Workflow exists: with one, transitions own the status
 * change and offering these too would let someone bypass the Workflow's own
 * conditions by writing `status` directly.
 *
 * Hidden while dirty. `setLeaveApprovalStatus` updates the *stored* document, so
 * acting on a form with unsaved edits would silently discard them -- the same
 * reason Submit and transitions require a clean form.
 */
export function resolveLeaveApprovalActions({
  isEdit,
  isSubmitted = false,
  isDirty = false,
  hasWorkflow = false,
  workflowChecked = false,
  currentUser,
  leaveApprover,
} = {}) {
  const eligible =
    Boolean(isEdit) &&
    !isSubmitted &&
    !isDirty &&
    workflowChecked &&
    !hasWorkflow &&
    canActAsLeaveApprover({ currentUser, leaveApprover });

  return { showApprove: eligible, showReject: eligible };
}

/**
 * Move the stored document's `status`.
 *
 * Uses `frappe.client.set_value` rather than PUTing the form payload, for three
 * reasons:
 *   1. It loads and saves the SERVER's document, so no partial form state is
 *      ever written -- the same rule the submit path follows.
 *   2. `get_doc` + `doc.save()` run the doctype's normal permission checks and
 *      `validate()`, so a user without write access or a validation failure is
 *      refused by the server instead of by the button.
 *   3. Only `status` is touched; the approver cannot smuggle in field edits.
 */
export async function setLeaveApprovalStatus({ name, status, doctype = "Leave Application" } = {}) {
  const doc = await post("method/frappe.client.set_value", {
    doctype,
    name,
    fieldname: "status",
    value: status,
  });

  return doc;
}