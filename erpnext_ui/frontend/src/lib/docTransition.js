/**
 * Document save / submit / cancel, with Workflow awareness.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two Frappe routing facts drive this module:
 *
 * 1. `POST /api/resource/<dt>/<name>` is NOT an update. Frappe's url_map is
 *    (frappe/api/v1.py):
 *        POST /resource/<dt>                 -> create_doc
 *        PUT  /resource/<dt>/<name>          -> update_doc
 *        POST /resource/<dt>/<name>          -> execute_doc_method
 *    and `execute_doc_method` opens with
 *        `method = method or frappe.form_dict.pop("run_method")`
 *    which raises `KeyError: 'run_method'` unless the body carries one. So an
 *    update MUST be a PUT. Forms that POSTed their updates were failing on
 *    every edit of an existing document.
 *
 * 2. When a doctype has a Workflow, `frappe.client.submit` is not the correct
 *    step. `validate_workflow` only compares `workflow_state` before/after
 *    (frappe/model/workflow.py), so a plain submit that leaves the state alone
 *    passes validation and lands the document at `docstatus = 1` while still
 *    sitting in the workflow's first state -- the approval step is skipped
 *    silently. The Workflow path is `apply_workflow`, which sets the state and
 *    performs the matching submit/cancel.
 *
 * DETECTION
 * ---------
 * The `Workflow` doctype is readable only by System Manager (workflow.json
 * lists no other role), so the frontend cannot read it to find out whether a
 * workflow exists. The whitelisted `get_transitions` is the only
 * permission-safe probe: it resolves the Workflow internally and applies the
 * caller's permissions, returning exactly the transitions this user may run
 * from the document's current state.
 *
 * Per the agreed fallback, ANY failure to probe is treated as "no workflow"
 * so a permission blip or a network hiccup can never block a user from
 * submitting. If the doctype really does have a workflow, `frappe.client.submit`
 * then fails with Frappe's own (accurate) message, which we surface as-is.
 */

import { get, post, put } from "../services/api";

/**
 * Which forward actions a form may offer.
 *
 * This mirrors Frappe's own toolbar, which is the reference for "correct
 * lifecycle" (frappe/public/js/frappe/form/toolbar.js):
 *
 *   can_submit() {
 *       return this.get_docstatus() === 0
 *           && !this.frm.doc.__islocal      // the document must already exist
 *           && !this.frm.doc.__unsaved     // and have no unsaved changes
 *           && this.frm.perm[0].submit
 *           && !this.has_workflow();       // a Workflow replaces Submit
 *   }
 *
 * and `get_action_status()`, which shows Save when there is either no Workflow
 * or there are unsaved changes.
 *
 * The three consequences worth spelling out, because each one is a bug if
 * ignored:
 *
 *  1. A NEW form never offers Submit/transition actions -- there is no document
 *     to transition, and `get_transitions` returns [] for an unsaved doc, so any
 *     "Submit" shown there would silently degrade to a plain save.
 *  2. A Workflow doctype NEVER offers the plain Submit. `validate_workflow`
 *     only compares `workflow_state` before and after, so submitting without
 *     advancing the state passes validation and lands the document at
 *     docstatus 1 while still sitting in the workflow's first state -- the
 *     approval step is skipped with no error.
 *  3. Unsaved changes hide Submit. Both submit paths act on the STORED
 *     document (see `submitDocument`), so submitting a dirty form would discard
 *     the user's edits without warning.
 *
 * `workflowChecked` exists because #2 can only be decided after the meta probe
 * resolves; before that we do not know whether a Workflow exists, and guessing
 * "no workflow" would flash a Submit button that may have to be taken away.
 */
/**
 * Statuses a Leave Application may be submitted from.
 *
 * Mirrors `LeaveApplication.on_submit` in HRMS, which refuses to submit a
 * leave that is still `Open` or already `Cancelled`:
 *
 *   if self.status in ["Open", "Cancelled"]:
 *       frappe.throw(_("Only Leave Applications with status 'Approved' and
 *                       'Rejected' can be submitted"))
 *
 * Without a Workflow there is nothing else advancing `status`, so the approver
 * sets it to Approved/Rejected first and submission happens afterwards. With a
 * Workflow the transition action replaces Submit entirely, so this list is
 * never consulted -- see `resolveForwardActions`.
 */
export const LEAVE_SUBMITTABLE_STATUSES = ["Approved", "Rejected"];

/**
 * Doctypes whose `on_submit` refuses to run unless a status column already
 * carries the outcome.
 *
 * Kept as data rather than an `if` per caller, because two independent screens
 * decide what to offer -- the request form and the Approvals preview -- and when
 * they disagree one of them shows a button that can only fail. `field` is the
 * column HRMS/ERPNext actually reads; `allowed` is what it accepts.
 */
const DOCTYPE_SUBMIT_GATES = {
  "Leave Application": { field: "status", allowed: LEAVE_SUBMITTABLE_STATUSES },
};

/**
 * May this stored document be submitted right now?
 *
 * The single source of truth for doctype-level preconditions beyond Frappe's own
 * rules. Returns true for doctypes with no gate, so it never narrows anything
 * else. Reads the status off the passed document, which is why callers must
 * hand over the SERVER's copy -- a form's unsaved state would answer a different
 * question than the one the server asks.
 */
export function canSubmitDocument({ doctype, doc } = {}) {
  const gate = DOCTYPE_SUBMIT_GATES[doctype];
  if (!gate) return true;

  return gate.allowed.includes(doc?.[gate.field]);
}

export function resolveForwardActions({
  isEdit,
  isSubmitted = false,
  isDirty = false,
  hasWorkflow = false,
  workflowChecked = false,
  transitionCount = 0,
  /**
   * Doctype-specific precondition for submitting, beyond Frappe's own rules.
   * Defaults to true so doctypes with no such rule (most of them) are
   * unaffected. Leave Application passes `status in ["Approved","Rejected"]`.
   *
   * Only ever narrows the plain-Submit path: a Workflow doctype shows
   * transitions instead, and those are gated by the Workflow's own conditions
   * on the server.
   */
  canSubmit = true,
} = {}) {
  return {
    // Save is available on anything not yet submitted.
    showSave: !isSubmitted,
    showTransitions: Boolean(isEdit) && !isSubmitted && !isDirty && transitionCount > 0,
    showSubmit:
      Boolean(isEdit) &&
      !isSubmitted &&
      !isDirty &&
      workflowChecked &&
      !hasWorkflow &&
      canSubmit,
  };
}

/** Frappe answers whitelisted `/api/method/*` calls under `message`. */
const messageOf = (res) => res?.message;

/** `/api/resource/*` answers under `data`. */
const dataOf = (res) => res?.data;

const resourcePath = (doctype, name) =>
  name
    ? `resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
    : `resource/${encodeURIComponent(doctype)}`;

/**
 * Create or update a document, picking the HTTP verb Frappe actually routes.
 *
 * @param {string} doctype
 * @param {string} [name]  omit for a new document
 * @param {object} doc     the document payload
 */
export async function saveDocument({ doctype, name, doc }) {
  const payload = { ...doc, doctype };

  // PUT for updates. POST here is what produced `KeyError: 'run_method'`.
  return name ? put(resourcePath(doctype, name), payload) : post(resourcePath(doctype), payload);
}

/**
 * Transitions the current user may apply to this document right now.
 *
 * Returns `{ hasWorkflow, actions }` where each action is
 * `{ action, from, to }`. Never throws -- see the module note on fallback.
 *
 * An empty result covers three cases, all treated the same way: no Workflow,
 * a Workflow with no transition open to this user in this state, or a
 * brand-new (unsaved) document -- `get_transitions` returns `[]` for
 * `doc.is_new()` because there is no state to transition from yet.
 */
export async function getWorkflowActions({ doc }) {
  try {
    const res = await post("method/frappe.model.workflow.get_transitions", {
      doc: JSON.stringify(doc),
    });

    const list = messageOf(res);

    if (!Array.isArray(list) || list.length === 0) {
      return { hasWorkflow: false, actions: [] };
    }

    // get_transitions can repeat a transition when several roles may run it;
    // keep the first of each action.
    const unique = Object.values(
      list
        .filter((t) => t?.action)
        .reduce((acc, t) => {
          if (!acc[t.action]) {
            acc[t.action] = { action: t.action, from: t.state, to: t.next_state };
          }
          return acc;
        }, {}),
    );

    // Present the decision an approver actually has to make first: rejecting
    // before approving, with anything neutral in between. Without this the
    // order is whatever the backend happened to iterate.
    const rank = (action) => {
      const a = String(action).toLowerCase();
      if (a.includes("reject")) return 0;
      if (a.includes("approve")) return 2;
      return 1;
    };

    return { hasWorkflow: true, actions: unique.sort((a, b) => rank(a.action) - rank(b.action)) };
  } catch {
    // "Workflow State not set" means no workflow; anything else (permission,
    // network) is treated identically so the user is never blocked.
    return { hasWorkflow: false, actions: [] };
  }
}

/** Fetch the authoritative document straight from the server. */
export async function fetchDocument(doctype, name) {
  const res = await get(resourcePath(doctype, name));
  const doc = dataOf(res);

  if (!doc) {
    throw new Error(`${doctype} ${name} could not be loaded`);
  }

  return doc;
}

/**
 * Move a document forward.
 *
 * @param {string} action  a Workflow Action Master value. When given we take
 *                         the Workflow path (`apply_workflow`); when omitted we
 *                         fall back to the plain doctype submit.
 */
export async function submitDocument({ doctype, name, action, doc }) {
  const full = doc || (await fetchDocument(doctype, name));

  if (action) {
    return post("method/frappe.model.workflow.apply_workflow", {
      doc: JSON.stringify(full),
      action,
    });
  }

  // `frappe.client.submit(doc)` takes the WHOLE document, not {doctype, name}.
  return post("method/frappe.client.submit", { doc: JSON.stringify(full) });
}

/**
 * Delete a document.
 *
 * POST, like every other `/api/method/*` call that changes state -- a GET
 * works against a read-only method but not a mutating one.
 */
export async function deleteDocument({ doctype, name }) {
  return post("method/frappe.client.delete", { doctype, name });
}

/** Cancel a submitted document (docstatus 1 -> 2). */
export async function cancelDocument({ doctype, name }) {
  return post("method/frappe.client.cancel", { doctype, name });
}

/**
 * Whether this doctype allows cancelling at all.
 *
 * `can_cancel_document` resolves the Workflow internally, so it is safe to
 * call as a normal user. It raises for doctypes without a workflow, which we
 * read as "cancelling is allowed".
 */
export async function canCancelDocument(doctype) {
  try {
    const res = await post("method/frappe.model.workflow.can_cancel_document", {
      doctype,
    });
    return messageOf(res) !== false;
  } catch {
    return true;
  }
}

/**
 * Workflow Action Master values we can label in the UI.
 *
 * These are admin-authored data, so anything not listed here is shown exactly
 * as configured -- a workflow authored in Arabic must not be translated behind
 * the admin's back. Buttons read "Approve", not "Approved", hence a separate
 * block from `requests.status.*`.
 */
const ACTION_LABEL_KEYS = {
  approve: "requests.action.approve",
  approved: "requests.action.approve",
  reject: "requests.action.reject",
  rejected: "requests.action.reject",
  cancel: "requests.action.cancel",
  cancelled: "requests.action.cancelled",
  "pending approval": "requests.action.pendingApproval",
  pending_approval: "requests.action.pendingApproval",
};

/** Translation key for a workflow action, or null when unrecognised. */
export function workflowActionLabelKey(action) {
  return ACTION_LABEL_KEYS[String(action || "").trim().toLowerCase()] || null;
}
