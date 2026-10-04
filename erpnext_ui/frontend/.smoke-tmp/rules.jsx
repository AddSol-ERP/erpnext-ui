import {
  resolveForwardActions,
  canSubmitDocument,
  LEAVE_SUBMITTABLE_STATUSES,
} from "../src/lib/docTransition.js";
import {
  canActAsLeaveApprover,
  resolveLeaveApprovalActions,
} from "../src/lib/leaveApproval.js";

let pass = 0, fail = 0;
const ok = (n, c, got) => (c ? pass++ : (fail++, console.log("  FAIL:", n, "got:", JSON.stringify(got))));

const base = { isEdit: true, isSubmitted: false, isDirty: false, hasWorkflow: false, workflowChecked: true, transitionCount: 0 };
const R = (o) => resolveForwardActions({ ...base, ...o });

// --- the bug that was reported: a new form must not offer Submit ----------
let r = R({ isEdit: false });
ok("new form: no Submit", !r.showSubmit);
ok("new form: no transitions", !r.showTransitions);
ok("new form: Save offered", r.showSave);

r = R({ isEdit: false, hasWorkflow: true });
ok("new+workflow: no Submit", !r.showSubmit);
ok("new+workflow: Save offered", r.showSave);

// --- saved draft, no workflow -> plain ERPNext lifecycle -----------------
r = R({});
ok("saved draft, no workflow: Submit", r.showSubmit);
ok("saved draft, no workflow: no transitions", !r.showTransitions);

// --- workflow doctype must NEVER show the plain Submit -------------------
r = R({ hasWorkflow: true, transitionCount: 0 });
ok("workflow, no open transition: NO Submit", !r.showSubmit);

r = R({ hasWorkflow: true, transitionCount: 2 });
ok("workflow w/ transitions: transitions shown", r.showTransitions);
ok("workflow w/ transitions: NO Submit", !r.showSubmit);

// --- probe still in flight ----------------------------------------------
r = R({ workflowChecked: false });
ok("probe pending: no Submit flash", !r.showSubmit);
r = R({ workflowChecked: false, hasWorkflow: true, transitionCount: 1 });
ok("probe pending: transitions still shown", r.showTransitions);

// --- dirty form: submit would act on the stale stored document ----------
r = R({ isDirty: true });
ok("dirty: no Submit", !r.showSubmit);
ok("dirty: no transitions", !r.showTransitions);
ok("dirty: Save offered", r.showSave);

// --- submitted / cancelled are locked -----------------------------------
r = R({ isSubmitted: true });
ok("submitted: nothing offered", !r.showSave && !r.showSubmit && !r.showTransitions);

// --- robustness ---------------------------------------------------------
ok("no args safe", resolveForwardActions().showSave === true);
ok("undefined isEdit safe", resolveForwardActions({ isEdit: undefined }).showSubmit === false);

/* ---------- LinkField: search term -> default list on backspace ---------- */
import { linkSearchTerm } from "../src/components/LinkField/searchTerm.js";
import * as LF from "./linkfield-cases.mjs";

for (const c of Object.values(LF)) {
  const got = c.actual(linkSearchTerm);
  ok(c.name, JSON.stringify(got) === JSON.stringify(c.expected), got);
}


/* ---------- Leave Application: HRMS refuses to submit "Open" ---------- */
const base2 = { isEdit: true, isSubmitted: false, isDirty: false, hasWorkflow: false, workflowChecked: true, transitionCount: 0 };
const R2 = (o) => resolveForwardActions({ ...base2, ...o });
const canSubmitLeave = (status) => LEAVE_SUBMITTABLE_STATUSES.includes(status);

ok("leave: Open -> no Submit (HRMS on_submit guard)", !R2({ canSubmit: canSubmitLeave("Open") }).showSubmit);
ok("leave: Approved -> Submit offered", R2({ canSubmit: canSubmitLeave("Approved") }).showSubmit);
ok("leave: Rejected -> Submit offered", R2({ canSubmit: canSubmitLeave("Rejected") }).showSubmit);
ok("leave: Cancelled -> no Submit", !R2({ canSubmit: canSubmitLeave("Cancelled") }).showSubmit);
ok("leave: missing status -> no Submit", !R2({ canSubmit: canSubmitLeave(undefined) }).showSubmit);
ok("leave: gate is status-only, never widens", R2({ canSubmit: canSubmitLeave("Open") }).showSave);
ok("leave: gate keeps transitions off a no-workflow doctype", !R2({ canSubmit: false }).showTransitions);

// A Workflow replaces Submit entirely, so the status gate must not matter there.
ok("leave+workflow: transitions unaffected by a blocking status",
   R2({ hasWorkflow: true, transitionCount: 1, canSubmit: false }).showTransitions);
ok("leave+workflow: still no plain Submit", !R2({ hasWorkflow: true, transitionCount: 1, canSubmit: false }).showSubmit);
ok("leave+workflow: approved status does not resurrect Submit",
   !R2({ hasWorkflow: true, transitionCount: 1, canSubmit: true }).showSubmit);

// Default must not narrow doctypes that have no such rule.
ok("default canSubmit keeps the plain path open", R2({}).showSubmit);
ok("default canSubmit cannot be widened by omitting other flags", !R2({ isEdit: false }).showSubmit);

ok("status list matches HRMS exactly",
   JSON.stringify(LEAVE_SUBMITTABLE_STATUSES) === JSON.stringify(["Approved", "Rejected"]));


/* ---------- Leave Approve/Reject (no-Workflow approval path) ---------- */
const A3 = (o) => resolveLeaveApprovalActions({
  isEdit: true, isSubmitted: false, isDirty: false, hasWorkflow: false, workflowChecked: true,
  currentUser: "manager@erp.test", leaveApprover: "manager@erp.test", ...o,
});

ok("approver: exact user match", canActAsLeaveApprover({ currentUser: "a@x", leaveApprover: "a@x" }));
ok("approver: different user refused", !canActAsLeaveApprover({ currentUser: "a@x", leaveApprover: "b@x" }));
ok("approver: blank approver refuses everyone", !canActAsLeaveApprover({ currentUser: "a@x", leaveApprover: "" }));
ok("approver: blank user refuses", !canActAsLeaveApprover({ currentUser: "", leaveApprover: "a@x" }));
ok("approver: both blank refuses", !canActAsLeaveApprover({}));

ok("approval: approver sees approve+reject", A3({}).showApprove && A3({}).showReject);
ok("approval: non-approver sees neither", !A3({ currentUser: "someone@erp.test" }).showApprove && !A3({ currentUser: "someone@erp.test" }).showReject);
// an employee must not be able to approve their own leave through the UI
ok("approval: cannot self-approve without being the approver", !A3({ currentUser: "hr-emp@erp.test" }).showApprove);
ok("approval: hidden on new form", !A3({ isEdit: false }).showApprove);
ok("approval: hidden while dirty", !A3({ isDirty: true }).showApprove && !A3({ isDirty: true }).showReject);
ok("approval: hidden after submit", !A3({ isSubmitted: true }).showApprove);
ok("approval: hidden before the workflow probe resolves", !A3({ workflowChecked: false }).showApprove);
ok("approval: workflow owns the status change instead",
   !A3({ hasWorkflow: true, transitionCount: 1 }).showApprove && !A3({ hasWorkflow: true, transitionCount: 1 }).showReject);
// The whole point of the feature: an Open leave (no Submit) is exactly the
// state where the approver still has work to do.
ok("approval: available on the Open leave where Submit is withheld",
   A3({}).showApprove && !resolveForwardActions({ ...base2, canSubmit: LEAVE_SUBMITTABLE_STATUSES.includes("Open") }).showSubmit);
ok("approval: does not itself unlock Submit", !resolveForwardActions({ ...base2, canSubmit: false }).showSubmit);


/* ---------- canSubmitDocument: the one gate both surfaces consult ---------- */
const gate = (doctype, doc) => canSubmitDocument({ doctype, doc });

ok("gate: Leave Open refused", !gate("Leave Application", { status: "Open" }));
ok("gate: Leave Approved allowed", gate("Leave Application", { status: "Approved" }));
ok("gate: Leave Rejected allowed", gate("Leave Application", { status: "Rejected" }));
ok("gate: Leave Cancelled refused", !gate("Leave Application", { status: "Cancelled" }));
ok("gate: Leave with no status refused", !gate("Leave Application", {}));
ok("gate: Leave with null doc refused", !gate("Leave Application", null));
ok("gate: case-sensitive like HRMS", !gate("Leave Application", { status: "approved" }));
// Expense Claim / Purchase Order: submit really does advance their status, so
// gating them would break a path that works today.
ok("gate: Expense Claim ungated", gate("Expense Claim", { approval_status: "Open" }));
ok("gate: Purchase Order ungated", gate("Purchase Order", { status: "Draft" }));
ok("gate: unknown doctype ungated", gate("Widget", {}));

// The Approvals preview's default action list, with the gate applied.
const previewActions = (doctype, doc) =>
  ["submit", "save", "delete"].filter(
    (a) => a !== "submit" || canSubmitDocument({ doctype, doc }),
  );

ok("preview: Open leave offers no Submit", !previewActions("Leave Application", { status: "Open" }).includes("submit"));
ok("preview: Open leave still offers Save and Delete", ["save", "delete"].every((a) => previewActions("Leave Application", { status: "Open" }).includes(a)));
ok("preview: Approved leave offers Submit", previewActions("Leave Application", { status: "Approved" }).includes("submit"));
ok("preview: expense claim keeps Submit", previewActions("Expense Claim", { approval_status: "Open" }).includes("submit"));

// Both surfaces must agree for the same document.
for (const st of ["Open", "Approved", "Rejected", "Cancelled"]) {
  const formShows = resolveForwardActions({ ...base2, canSubmit: gate("Leave Application", { status: st }) }).showSubmit;
  ok(`agreement: ${st} leave -> form and preview both ${formShows ? "offer" : "withhold"} Submit`,
     formShows === previewActions("Leave Application", { status: st }).includes("submit"));
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
