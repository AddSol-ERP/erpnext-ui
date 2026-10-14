import { readFileSync } from "node:fs";
import {
  resolveForwardActions,
  resolveDocstatusActions,
  canSubmitDocument,
  LEAVE_SUBMITTABLE_STATUSES,
} from "../src/lib/docTransition.js";
import {
  canActAsLeaveApprover,
  resolveLeaveApprovalActions,
} from "../src/lib/leaveApproval.js";
import { resolveHrApprovalGate } from "../src/lib/profileFlags.js";
import {
  MATERIAL_REQUEST_TYPES,
  REQUEST_PURPOSES,
  REQUEST_PURPOSE_KEYS,
  STOCK_ENTRY_PURPOSES,
  STOCK_MOVEMENT_GROUPS,
  STORE_FULFILLABLE_TYPES,
  buildStockEntryPayload,
  requestPurposeForType,
  stockPurposeForType,
} from "../src/config/storePurposes.js";
import {
  applyMeasuredTotal,
  computeFactor,
  needsMeasuredTotal,
  validateLineRow,
  wholeNumberRules,
} from "../src/lib/receiptConversion.js";
import {
  directionOf,
  freeQty,
  isValuationAccurate,
  reconcile,
  splitMovement,
  valueOf,
  withRunningBalance,
} from "../src/lib/stockBalance.js";

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

/* ---------- docstatus -> Back / Cancel / Delete (all three forms) ---------- */
// The exact bug that shipped once: `Number(undefined) === 0` is false, so
// gating Back on `docstatus === 0` hid the only way off a NEW form.
const D = (isEdit, docstatus) => resolveDocstatusActions({ isEdit, docstatus });

let d = D(false, undefined);
ok("docstatus: new form has no docstatus", d.docstatus === 0);
ok("docstatus: new form still offers Back", d.showBack);
ok("docstatus: new form has nothing to cancel", !d.showCancel);
ok("docstatus: new form has nothing to delete", !d.showDelete);

d = D(true, 0);
ok("docstatus: draft offers Back", d.showBack);
ok("docstatus: draft cannot be cancelled", !d.showCancel);
ok("docstatus: draft can be deleted", d.showDelete);

d = D(true, 1);
ok("docstatus: submitted has no Back", !d.showBack);
ok("docstatus: submitted offers Cancel", d.showCancel);
ok("docstatus: submitted is NOT deletable", !d.showDelete);

d = D(true, 2);
ok("docstatus: cancelled has no Back", !d.showBack);
ok("docstatus: cancelled cannot be re-cancelled", !d.showCancel);
ok("docstatus: cancelled can be deleted", d.showDelete);

// Frappe sends docstatus as a number, but tolerate the shapes a raw API
// response can carry rather than silently rendering an empty toolbar.
ok("docstatus: string \"1\" is submitted", D(true, "1").showCancel && !D(true, "1").showDelete);
ok("docstatus: string \"0\" is draft", D(true, "0").showBack && D(true, "0").showDelete);
ok("docstatus: null is treated as draft", D(true, null).showBack);
ok("docstatus: no args safe", resolveDocstatusActions().showBack === true && resolveDocstatusActions().showDelete === false);

// Back is navigation, Delete is destructive, so a draft legitimately offers
// both. What must never happen is two COMPETING ways out of the same state:
// Back (leave without touching) alongside Cancel (reverse a submission), or two
// destructive actions at once.
for (const ds of [0, 1, 2]) {
  const r = D(true, ds);
  ok(`docstatus ${ds}: Back and Cancel never compete`, !(r.showBack && r.showCancel));
  ok(`docstatus ${ds}: at most one destructive action`,
     [r.showCancel, r.showDelete].filter(Boolean).length <= 1);
}
ok("docstatus 0: draft offers Back and Delete together", D(true, 0).showBack && D(true, 0).showDelete);

// --- a Workflow owns cancellation, so no duplicate Cancel button ----------
// Once any transition targets a doc_status "2" state, Frappe's
// `can_cancel_document` returns False: the Workflow has taken over
// cancellation. Rendering the docstatus Cancel alongside the Workflow's Cancel
// transition would put two identical Cancel buttons on one screen for a single
// decision, and the docstatus one would leave workflow_state desynced from
// docstatus.
const W = (isEdit, docstatus) => resolveDocstatusActions({ isEdit, docstatus, hasWorkflow: true });

let w = W(true, 1);
ok("workflow+submitted: docstatus Cancel suppressed", !w.showCancel);
ok("workflow+submitted: Back still suppressed", !w.showBack);
ok("workflow+submitted: still NOT deletable", !w.showDelete);

// Delete and Back are not forward transitions, so a Workflow has no opinion
// about them; they must survive the workflow check.
w = W(true, 0);
ok("workflow+draft: Back survives", w.showBack);
ok("workflow+draft: Delete survives", w.showDelete);
ok("workflow+draft: no docstatus Cancel anyway", !w.showCancel);

w = W(true, 2);
ok("workflow+cancelled: Delete survives", w.showDelete);
ok("workflow+cancelled: no docstatus Cancel", !w.showCancel);

// The doctype-level rule is what matters: a Workflow governs the doctype even
// for the logged-in role that has zero available transitions, and that role
// must still not be offered a bare cancel.
ok("workflow: hasWorkflow defaults to false (opt-in, no silent suppression)",
   resolveDocstatusActions({ isEdit: true, docstatus: 1 }).showCancel === true);
ok("workflow: Back/Cancel still never compete under a workflow", !W(true, 0).showBack || !W(true, 0).showCancel);
ok("workflow: at most one destructive action under a workflow",
   [0, 1, 2].every((ds) => [W(true, ds).showCancel, W(true, ds).showDelete].filter(Boolean).length <= 1));
ok("docstatus 1: submitted offers Cancel alone", (() => {
  const r = D(true, 1);
  return r.showCancel && !r.showBack && !r.showDelete;
})());
ok("docstatus 2: cancelled offers Delete alone", (() => {
  const r = D(true, 2);
  return r.showDelete && !r.showBack && !r.showCancel;
})());
// Cancelling is the only route out of Submitted, and it is what makes the
// document deletable afterwards -- so 1 -> Cancel -> 2 -> Delete must hold.
ok("docstatus: submitted can only be escaped via Cancel, never Delete",
   D(true, 1).showCancel && !D(true, 1).showDelete && D(true, 2).showDelete);

// ============================================================
// ESS HR approval gate
// ----------------------------------------------------------
// The regression this replaces: `!profile.workflow_state` cannot
// distinguish "pending" from "field does not exist", because
// !undefined === true, so every employee at every site without the
// workflow was shown the warning.
ok("gate: no workflow configured (key absent) hides the banner",
   resolveHrApprovalGate({ name: "HR-EMP-00001" }).showWarning === false);
ok("gate: no workflow configured -> hasGate false",
   resolveHrApprovalGate({ name: "HR-EMP-00001" }).hasGate === false);
ok("gate: null state hides the banner (record predates the workflow)",
   resolveHrApprovalGate({ workflow_state: null }).showWarning === false);
ok("gate: Pending HR Approval shows the warning",
   resolveHrApprovalGate({ workflow_state: "Pending HR Approval" }).showWarning === true);
ok("gate: Rejected shows the warning",
   resolveHrApprovalGate({ workflow_state: "Rejected" }).showWarning === true);
ok("gate: Approved hides the warning",
   resolveHrApprovalGate({ workflow_state: "Approved" }).showWarning === false);
ok("gate: warning shows for ANY non-Approved state (future-proof)",
   ["Pending HR Approval", "Rejected", "Something New"].every(
     (s) => resolveHrApprovalGate({ workflow_state: s }).showWarning === true));
ok("gate: state is echoed through for consumers",
   resolveHrApprovalGate({ workflow_state: "Rejected" }).state === "Rejected");
ok("gate: absent state is normalised to null, not undefined",
   resolveHrApprovalGate({}).state === null);
ok("gate: missing profile object does not throw",
   resolveHrApprovalGate(undefined).showWarning === false);
ok("gate: empty string is a real state, so it warns (not treated as absent)",
   resolveHrApprovalGate({ workflow_state: "" }).showWarning === true);
ok("gate: a legacy custom_hr_approved flag alone must NOT trigger the banner",
   resolveHrApprovalGate({ custom_hr_approved: false }).showWarning === false);
ok("gate: Approved wins even when a legacy flag disagrees",
   resolveHrApprovalGate({ workflow_state: "Approved", custom_hr_approved: false })
     .showWarning === false);

// ===========================================================================
// STORE PURPOSES — the purpose -> doctype contract
// ===========================================================================
// These guard the Store redesign. Every assertion here corresponds to a value
// that ERPNext enforces somewhere and the browser fails silently on.

// --- the bug that shipped: two MR type tiles wrote values ERPNext rejects ---
// Frappe's _validate_selects (base_document.py:892) throws 417 for a Select
// value outside its options. The old Store hub offered "Transfer" and
// "Material Receipt" as material_request_type; neither exists in v15.
ok("no purpose writes the bare word 'Transfer'",
   !REQUEST_PURPOSE_KEYS.some((k) => REQUEST_PURPOSES[k].materialRequestType === "Transfer"));
ok("no purpose writes 'Material Receipt' as a REQUEST type",
   !REQUEST_PURPOSE_KEYS.some((k) => REQUEST_PURPOSES[k].materialRequestType === "Material Receipt"));
ok("every request purpose writes a value ERPNext actually accepts",
   REQUEST_PURPOSE_KEYS.every((k) =>
     MATERIAL_REQUEST_TYPES.includes(REQUEST_PURPOSES[k].materialRequestType)),
   REQUEST_PURPOSE_KEYS.map((k) => REQUEST_PURPOSES[k].materialRequestType));
ok("the full ERPNext v15 type list is captured exactly",
   JSON.stringify(MATERIAL_REQUEST_TYPES) ===
     JSON.stringify(["Purchase", "Material Transfer", "Material Issue", "Manufacture", "Customer Provided"]),
   MATERIAL_REQUEST_TYPES);

// --- one-to-one mapping: two purposes may not share a type --------------
ok("each MR type maps back to exactly one purpose",
   MATERIAL_REQUEST_TYPES.every((t) => {
     const keys = REQUEST_PURPOSE_KEYS.filter(
       (k) => REQUEST_PURPOSES[k].materialRequestType === t);
     return keys.length === 1;
   }));

// --- the store-fulfilment gate must mirror ERPNext's own ------------------
// material_request.py:816-822 hard-restricts make_stock_entry to Material
// Transfer / Material Issue / Customer Provided. Purchase and Manufacture are
// routed elsewhere, so offering them in the storekeeper's queue would surface a
// "Give Items" button that can only fail.
ok("store-fulfillable set matches ERPNext's make_stock_entry gate",
   JSON.stringify([...STORE_FULFILLABLE_TYPES].sort()) ===
     JSON.stringify(["Customer Provided", "Material Issue", "Material Transfer"]),
   STORE_FULFILLABLE_TYPES);
ok("Purchase is NOT fulfilable by the store",
   !STORE_FULFILLABLE_TYPES.includes("Purchase"));
ok("Manufacture is NOT fulfilable by the store",
   !STORE_FULFILLABLE_TYPES.includes("Manufacture"));

// ---------------------------------------------------------------------------
// stockPurposeForType: the shared ERPNext-type -> purpose-key lookup.
//
// This replaced an if/else chain in useStockEntry.js that named only 5 of the 9
// purposes and fell through to "set both warehouses" for the rest. An unlisted
// purpose therefore silently got the wrong warehouse shape, and a 10th purpose
// from ERPNext would have inherited that default. The chain is gone, so this
// lookup is the only place a purpose gets named -- assert it stays complete.
// ---------------------------------------------------------------------------

const SE_TYPES = Object.values(STOCK_ENTRY_PURPOSES).map((p) => p.stockEntryType);
ok("stockPurposeForType: all 9 ERPNext types map back to a purpose",
   SE_TYPES.length === 9 && SE_TYPES.every((t) => stockPurposeForType(t) !== ""),
   `types=${SE_TYPES.length}`);
ok("stockPurposeForType: unknown type yields '' rather than a wrong purpose",
   stockPurposeForType("Not A Real Type") === "");

// ---------------------------------------------------------------------------
// Purchase Receipt line arithmetic.
//
// The factor is a MEASUREMENT, never a master-data lookup: a weighed delivery
// differs every time, and reading the nominal factor from UOM Conversion
// Detail books the wrong stock while looking like a successful save. These
// pin the derivation and the ERPNext rules that make a factor other than 1
// legal at all.
// ---------------------------------------------------------------------------

ok("computeFactor: 25.4 Kg over 10 Nos = 2.54",
   computeFactor(10, 25.4) === 2.54, computeFactor(10, 25.4));
ok("computeFactor: unrounded -- 10/3 keeps full precision",
   computeFactor(3, 10) === 10 / 3);
ok("computeFactor: qty 0 returns null rather than Infinity",
   computeFactor(0, 25.4) === null);
ok("computeFactor: empty total returns null rather than defaulting to 1",
   computeFactor(10, "") === null && computeFactor(10, undefined) === null);

// Rule: stock_controller.py:110-116 resets the factor to 1.0 when uom equals
// stock_uom, so a measured total is only meaningful when they differ.
const KG_NOS = {
  stock_uom: "Kg",
  uoms: [{ uom: "Kg", must_be_whole_number: 0 }, { uom: "Nos", must_be_whole_number: 1 }],
};
ok("needsMeasuredTotal: false when received UOM == stock UOM",
   needsMeasuredTotal(KG_NOS, "Kg") === false);
ok("needsMeasuredTotal: true when a weighed stock UOM differs from received",
   needsMeasuredTotal(KG_NOS, "Nos") === true);
ok("needsMeasuredTotal: false without a UOM lookup",
   needsMeasuredTotal(undefined, "Nos") === false && needsMeasuredTotal({ uoms: [] }, "Nos") === false);

// Live-data bug (W-0268-01-001: stock_uom Nos, also Kg). Offering a total here
// let a 10 Kg receipt book 25 NOS of stock -- factor 2.5 -- and save cleanly.
const NOS_STOCK = {
  stock_uom: "Nos",
  uoms: [{ uom: "Nos", must_be_whole_number: 1 }, { uom: "Kg", must_be_whole_number: 0 }],
};
ok("needsMeasuredTotal: NOT offered when the STOCK UOM counts whole pieces",
   needsMeasuredTotal(NOS_STOCK, "Kg") === false,
   "a weight cannot be stock in Nos, so the field would only book wrong quantities");
ok("needsMeasuredTotal: still offered for a weighed stock UOM",
   needsMeasuredTotal(KG_NOS, "Nos") === true);

// purchase_receipt.py:278 is validate_uom_is_integer("stock_uom", "stock_qty"):
// the STOCK qty against the STOCK UOM. The transaction qty against the
// transaction UOM is a DIFFERENT pair, and the previous code checked only that.
const RULES_INFO = KG_NOS;
ok("wholeNumberRules: received Nos is whole-number",
   wholeNumberRules(RULES_INFO, "Nos").mustWholeQty === true);
ok("wholeNumberRules: stock Kg is not whole-number",
   wholeNumberRules(RULES_INFO, "Nos").mustWholeStock === false);
ok("wholeNumberRules: reversed item -- stock Nos IS whole-number",
   wholeNumberRules(
     { stock_uom: "Nos", uoms: [{ uom: "Nos", must_be_whole_number: 1 }, { uom: "Kg", must_be_whole_number: 0 }] },
     "Kg",
   ).mustWholeStock === true);

const WEIGHED = { _rid: "r1", qty: 10, uom: "Nos", stock_uom: "Kg" };
const applied = applyMeasuredTotal({ ...WEIGHED, conversion_factor: 1 }, 25.4);
ok("applyMeasuredTotal: factor = total / qty",
   applied.conversion_factor === 2.54, applied.conversion_factor);
ok("applyMeasuredTotal: stock_qty is the measured total, not qty*factor",
   applied.stock_qty === 25.4, applied.stock_qty);
ok("applyMeasuredTotal: stock_qty has no float noise from the multiplication",
   applyMeasuredTotal({ ...WEIGHED }, 0.1 + 0.2).stock_qty === 0.30000000000000004);

// A missing total must NOT fall back to factor 1 -- that would book the piece
// count as stock and read as a successful save.
const noTotal = applyMeasuredTotal({ ...WEIGHED }, "");
ok("applyMeasuredTotal: missing total yields an empty factor, not 1",
   noTotal.conversion_factor === "" && noTotal.stock_qty === "");

// Same UOM -> factor 1, stock_qty == qty, and the total is cleared.
const same = applyMeasuredTotal({ _rid: "r2", qty: 7, uom: "Nos", stock_uom: "Nos", measured_total: "99" }, "99");
ok("applyMeasuredTotal: same UOM pins factor to 1 and ignores any total",
   same.conversion_factor === 1 && same.stock_qty === 7 && same.measured_total === "");

// Stand-in for i18next's t(). validateLineRow passes a KEY plus interpolation
// vars, so this returns the key verbatim and records the vars -- asserting on
// the key is the stable contract; the rendered wording is covered by the
// store suite, which renders with the real i18n instance.
let lastVars = null;
const T = (k, vars) => {
  lastVars = vars || {};
  return k;
};
ok("validateLineRow: weighed line with no total is rejected",
   validateLineRow({ qty: 10, uom: "Nos", stock_uom: "Kg", measured_total: "" }, RULES_INFO, T)
     === "store.receipt.validation.totalRequired");
ok("validateLineRow: the missing-total message names the STOCK uom",
   lastVars && lastVars.uom === "Kg", JSON.stringify(lastVars));
ok("validateLineRow: fractional qty against whole-number received UOM is rejected",
   validateLineRow({ qty: 0.5, uom: "Nos", stock_uom: "Kg", measured_total: "5" }, RULES_INFO, T)
     === "store.receipt.validation.wholeNumberUom");
// The total field is hidden for a whole-number stock UOM (see
// needsMeasuredTotal), so this row cannot be produced by the UI -- but the rule
// ERPNext enforces is about stock_qty, not about which fields we render, so the
// validator must catch it regardless.
ok("validateLineRow: fractional stock qty against whole-number STOCK UOM is rejected",
   validateLineRow({ qty: 10, uom: "Kg", stock_uom: "Nos", measured_total: "25.4", stock_qty: 25.4 },
     NOS_STOCK, T) === "store.receipt.validation.wholeNumberUom");
ok("validateLineRow: a whole stock qty against a whole-number STOCK UOM is fine",
   validateLineRow({ qty: 10, uom: "Kg", stock_uom: "Nos", measured_total: "25", stock_qty: 25 },
     NOS_STOCK, T) === null);
ok("validateLineRow: a complete weighed line passes",
   validateLineRow({ qty: 10, uom: "Nos", stock_uom: "Kg", measured_total: "25.4" }, RULES_INFO, T) === null);
ok("validateLineRow: qty must be greater than zero",
   validateLineRow({ qty: 0, uom: "Nos", stock_uom: "Kg", measured_total: "25.4" }, RULES_INFO, T)
     === "store.validation.qtyGtZero");
ok("stockPurposeForType: round-trips every key",
   Object.keys(STOCK_ENTRY_PURPOSES).every(
     (k) => stockPurposeForType(STOCK_ENTRY_PURPOSES[k].stockEntryType) === k));

// These flags are what buildPayload reads in place of its own chain. Pin each
// shape -- "both warehouses" being the old fallback is the bug that was removed.
const SHAPE = {
  issue: [true, false],
  receipt: [false, true],
  transfer: [true, true],
  transferForManufacture: [true, true],
  consumption: [true, false],
  manufacture: [true, true],
  repack: [true, true],
  disassemble: [true, true],
  subcontractor: [true, true],
};
for (const [k, [from, to]] of Object.entries(SHAPE)) {
  const got = STOCK_ENTRY_PURPOSES[k];
  ok(`STOCK_ENTRY_PURPOSES.${k}: warehouse shape`,
     got.showFromWarehouse === from && got.showToWarehouse === to,
     `from=${got.showFromWarehouse} to=${got.showToWarehouse}`);
}
ok("requestPurposeForType resolves the indent purpose",
   requestPurposeForType("Material Issue") === "indent");
ok("requestPurposeForType returns null for an unknown type, not undefined",
   requestPurposeForType("Nonsense") === null);

// --- Stock Entry purposes: stock_entry_type is a Link, not a Select -------
// purpose is hidden + read_only on the Stock Entry and is re-derived from
// stock_entry_type.purpose by server-side fetch_from, so a payload that sends
// `purpose` is at best redundant and at worst silently overwritten.
const payload = buildStockEntryPayload("issue", {
  items: [{ item_code: "X", qty: 1 }],
  fromWarehouse: "Stores - DVPL",
  toWarehouse: "Finished Goods - DVPL",
  posting_date: "2026-01-01",
});
ok("payload sets stock_entry_type (the authoritative field)",
   payload.stock_entry_type === "Material Issue");
ok("payload never sends the derived `purpose`",
   !("purpose" in payload), payload);
ok("Material Issue sends the source warehouse", payload.from_warehouse === "Stores - DVPL");
ok("Material Issue never sends a target warehouse (server clears it anyway)",
   !("to_warehouse" in payload), payload);

// --- every one of the nine purposes must be present and self-consistent ---
ok("all nine ERPNext stock entry purposes are modelled",
   Object.keys(STOCK_ENTRY_PURPOSES).length === 9);
ok("every purpose has a group, and every group is declared",
   Object.values(STOCK_ENTRY_PURPOSES).every((p) => STOCK_MOVEMENT_GROUPS.includes(p.group)));
ok("every purpose declares at least one warehouse side",
   Object.values(STOCK_ENTRY_PURPOSES).every(
     (p) => p.showFromWarehouse || p.showToWarehouse));
ok("stock_entry_type always equals the purpose it mirrors",
   Object.values(STOCK_ENTRY_PURPOSES).every((p) => p.stockEntryType === p.purpose));
ok("no two stock purposes share a stock_entry_type",
   new Set(Object.values(STOCK_ENTRY_PURPOSES).map((p) => p.stockEntryType)).size === 9);

// --- the one-sided purposes must not ask for a warehouse the server clears -
// validate_warehouse (stock_entry.py:847-853) force-nulls the header AND every
// row for these. Asking for them would put a field on screen that cannot be
// saved, which is the exact confusion this redesign removes.
ok("Material Issue shows one warehouse side only",
   STOCK_ENTRY_PURPOSES.issue.showFromWarehouse === true &&
   STOCK_ENTRY_PURPOSES.issue.showToWarehouse === false);
ok("Material Receipt shows one warehouse side only",
   STOCK_ENTRY_PURPOSES.receipt.showFromWarehouse === false &&
   STOCK_ENTRY_PURPOSES.receipt.showToWarehouse === true);
ok("Material Consumption shows one warehouse side only",
   STOCK_ENTRY_PURPOSES.consumption.showFromWarehouse === true &&
   STOCK_ENTRY_PURPOSES.consumption.showToWarehouse === false);
ok("Material Transfer shows both sides",
   STOCK_ENTRY_PURPOSES.transfer.showFromWarehouse === true &&
   STOCK_ENTRY_PURPOSES.transfer.showToWarehouse === true);

// --- manufacturing moves require a Work Order (stock_entry.py:903-905) ----
ok("both manufacturing moves demand a Work Order",
   STOCK_ENTRY_PURPOSES.transferForManufacture.requiresWorkOrder === true &&
   STOCK_ENTRY_PURPOSES.consumption.requiresWorkOrder === true);
ok("plain store moves do not demand a Work Order",
   STOCK_ENTRY_PURPOSES.issue.requiresWorkOrder === false &&
   STOCK_ENTRY_PURPOSES.receipt.requiresWorkOrder === false &&
   STOCK_ENTRY_PURPOSES.transfer.requiresWorkOrder === false);

// --- payload builder refuses an unknown purpose rather than emitting junk --
let threw = false;
try { buildStockEntryPayload("not-a-purpose", { items: [] }); } catch { threw = true; }
ok("unknown stock movement purpose throws", threw);


// ---------------------------------------------------------------------------
// Stock balance arithmetic.
//
// The reason this module is separated from the SQL: a balance report that shows
// one blended number hides that the stock is made of several receipts of value.
// Live case -- item CORE, 3 Kg, all from PR-26-00008, at 2 Kg @ 1000 and
// 1 Kg @ 1200. The trail must show both, not 3 Kg @ 1066.67.
// ---------------------------------------------------------------------------

ok("splitMovement: positive is all inbound",
   JSON.stringify(splitMovement(5)) === JSON.stringify({ inQty: 5, outQty: 0 }));
ok("splitMovement: negative becomes a POSITIVE outbound magnitude",
   JSON.stringify(splitMovement(-5)) === JSON.stringify({ inQty: 0, outQty: 5 }),
   "out_qty is a magnitude, never negative");
ok("splitMovement: zero is neither",
   JSON.stringify(splitMovement(0)) === JSON.stringify({ inQty: 0, outQty: 0 }));

// closing = opening + in - out
const r1 = reconcile({ openingQty: 10, inQty: 5, outQty: 3 });
ok("reconcile: closing = opening + in - out",
   r1.closingQty === 12 && r1.openingQty === 10 && r1.inQty === 5 && r1.outQty === 3,
   JSON.stringify(r1));

// The CORE case: two receipts, two rates, one balance.
const r2 = reconcile({
  openingQty: 0,
  movements: [{ actual_qty: 2 }, { actual_qty: 1 }],
});
ok("reconcile: two inbound movements sum to 3", r2.closingQty === 3 && r2.inQty === 3);
ok("reconcile: value is NOT the blend of the two receipts",
   valueOf(r2.closingQty, (2 * 1000 + 1 * 1200) / 3) === 3200 &&
   valueOf(2, 1000) !== valueOf(2, 1200),
   "the two receipts must stay distinguishable in the trail");

ok("reconcile: mixed in and out from detail",
   reconcile({ openingQty: 5, movements: [{ actual_qty: 10 }, { actual_qty: -3 }] }).closingQty === 12);
ok("reconcile: empty movement list leaves the opening untouched",
   reconcile({ openingQty: 7, movements: [] }).closingQty === 7);
ok("reconcile: missing everything defaults to zero",
   reconcile({}).closingQty === 0);

ok("freeQty: balance minus reserved", freeQty(40, 12) === 28);
ok("freeQty: over-reserved goes negative rather than clamping",
   freeQty(5, 12) === -7, "a negative free balance is information, not a bug");

ok("directionOf: labels each movement",
   directionOf(3) === "in" && directionOf(-3) === "out" && directionOf(0) === "");

// The running balance must START at the opening, or the trail's first row
// visibly disagrees with the summary above it.
const folded = withRunningBalance(
  [{ actual_qty: 2 }, { actual_qty: 1 }],
  10,
);
ok("withRunningBalance: starts from the window opening, not zero",
   folded[0].running_balance === 12 && folded[1].running_balance === 13,
   JSON.stringify(folded.map((f) => f.running_balance)));
ok("withRunningBalance: an outbound subtracts",
   withRunningBalance([{ actual_qty: 5 }, { actual_qty: -2 }], 0)[1].running_balance === 3);
ok("withRunningBalance: direction attached per row",
   withRunningBalance([{ actual_qty: -1 }], 0)[0].direction === "out");
ok("withRunningBalance: empty ledger is empty",
   withRunningBalance([], 5).length === 0);

// Bin.valuation_rate is TODAY's moving average. Rendering it next to a past
// balance states a wrong number confidently.
ok("isValuationAccurate: true for a window ending today",
   isValuationAccurate("2026-10-13", "2026-10-13") === true);
ok("isValuationAccurate: false for a past window",
   isValuationAccurate("2026-09-30", "2026-10-13") === false);
ok("isValuationAccurate: false when either date is missing",
   isValuationAccurate("", "2026-10-13") === false && isValuationAccurate("2026-10-13", null) === false);

// ---------------------------------------------------------------------------
// Every SPA endpoint must be reachable.
//
// This exists because all three stock-balance endpoints shipped without
// `@frappe.whitelist`, so every call died with
//
//   "Function erpnext_ui.api.get_stock_balance_summary is not whitelisted."
//
// Nothing caught it. The store suite stubs `fetch` to throw and so never calls
// an endpoint; the rules suite only exercises pure `lib/`; eslint and ruff have
// no idea what a Frappe decorator is. All green, feature completely unreachable.
//
// So this parses the file instead. Scoped to `def get_*`, which is the endpoint
// naming convention here: the two public functions that legitimately have no
// decorator -- `has_app_permission` and `boot_session` -- are called by a boot
// hook rather than by the SPA, and are outside this scope on purpose.
// ---------------------------------------------------------------------------
// `import.meta.url` points at the BUILT entry (out-rules/entry.mjs), not at the
// source, so the depth depends on outDir. Walk up until api.py is found rather
// than hardcoding it -- otherwise this guard silently stops parsing anything the
// day SSR_OUT changes.
const API_CANDIDATES = [
  "../../../api.py",
  "../../../../api.py",
  "../../erpnext_ui/api.py",
];
let apiSource = "";
let apiPath = "";
for (const rel of API_CANDIDATES) {
  try {
    apiSource = readFileSync(new URL(rel, import.meta.url), "utf8");
    apiPath = rel;
    break;
  } catch {
    /* try the next depth */
  }
}
const apiLines = apiSource.split("\n");
const undecorated = [];
for (let i = 0; i < apiLines.length; i++) {
  const m = apiLines[i].match(/^def (get_\w+)\(/);
  if (!m) continue;
  let j = i - 1;
  while (j >= 0 && (!apiLines[j].trim() || apiLines[j].trim().startsWith("#"))) j--;
  if (!apiLines[j].trim().startsWith("@frappe.whitelist")) {
    undecorated.push(`${m[1]} (line ${i + 1})`);
  }
}
ok(
  "every get_* endpoint in api.py carries @frappe.whitelist",
  undecorated.length === 0,
  `not whitelisted: ${undecorated.join(", ")} -- the SPA cannot call these`,
);
ok(
  "the whitelist guard actually located and parsed api.py",
  apiPath !== "" && apiLines.length > 500,
  `path=${apiPath || "NOT FOUND"} lines=${apiLines.length}`,
);
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
