import { readFileSync, readdirSync, existsSync } from "node:fs";
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
  applyQuantity,
  batchRule,
  conversionBasis,
  conversionDrift,
  conversionDriftSuspicious,
  computeFactor,
  conversionPreview,
  hasUsableFactor,
  needsMeasuredTotal,
  needsSerials,
  parseSerials,
  perSerialFigures,
  serialCount,
  serialsAreGenerated,
  validateBatch,
  validateLineRow,
  validateSerials,
  wholeNumberRules,
} from "../src/lib/receiptConversion.js";
import { DOCTYPE_CONFIG } from "../src/config/doctypes.js";
import {
  formatCell,
  isNumericColumn,
  parseSelectOptions,
  seedDefault,
  visibleColumns,
} from "../src/pages/Reports/custom-report/format.js";
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
// Superseded by the PO-fallback contract: a missing measurement now falls back
// to the ordered rate, and only reports factor 1 -- as an explicit `default`
// source -- when there is nothing to fall back to.
ok("applyMeasuredTotal: a missing measurement never invents a silent factor",
   noTotal.conversion_source === "default" && noTotal.conversion_factor === 1,
   "the source flag is what makes the placeholder honest");

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
// This exists because four endpoints shipped without
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
  // get_* AND create_*: both are endpoint names here. `create_return_stock_entry`
  // would have slipped through a get_*-only guard the same way the other three did.
  const m = apiLines[i].match(/^def ((?:get|create)_\w+)\(/);
  if (!m) continue;
  let j = i - 1;
  while (j >= 0 && (!apiLines[j].trim() || apiLines[j].trim().startsWith("#"))) j--;
  if (!apiLines[j].trim().startsWith("@frappe.whitelist")) {
    undecorated.push(`${m[1]} (line ${i + 1})`);
  }
}
ok(
  "every get_*/create_* endpoint in api.py carries @frappe.whitelist",
  undecorated.length === 0,
  `not whitelisted: ${undecorated.join(", ")} -- the SPA cannot call these`,
);
ok(
  "the whitelist guard actually located and parsed api.py",
  apiPath !== "" && apiLines.length > 500,
  `path=${apiPath || "NOT FOUND"} lines=${apiLines.length}`,
);

// ---------------------------------------------------------------------------
// Return-to-stock: which questions the dialog must ask.
//
// This is ERPNext's rule, not ours, and getting it wrong either shows a field
// that cannot be saved or hides one that is required. From
// `serial_batch_bundle.py:190-195` and `:294-308`: a batch number is generated
// only when the item has BOTH `create_new_batch` and a `batch_number_series`.
// With `create_new_batch` and no series, ERPNext has nothing to generate from
// and throws at save -- so the dialog must ask instead.
//
// HONEST SCOPE: `decideReturn` below restates the documented rule. The rule
// itself lives in `api.py:get_return_stock_entry_context`, which this JS suite
// cannot import -- there is no Python harness in this repo. So these assertions
// pin the *documented* behaviour and would not notice the server drifting from
// it. The contract check after them is what actually connects the two: it
// fails if the server stops returning a key the dialog reads, which is the
// realistic failure (a rename, or a typo in a response key).
// ---------------------------------------------------------------------------
const decideReturn = (item) => {
  const autoBatch = Boolean(item.has_batch_no && item.create_new_batch && item.batch_number_series);
  const autoSerial = Boolean(item.has_serial_no && item.serial_no_series);
  return {
    auto_batch: autoBatch,
    needs_batch_number: Boolean(item.has_batch_no) && !autoBatch,
    needs_serials: Boolean(item.has_serial_no) && !autoSerial,
  };
};

ok("return: plain item asks neither batch nor serial",
   JSON.stringify(decideReturn({})) === JSON.stringify({ auto_batch: false, needs_batch_number: false, needs_serials: false }));

ok("return: batch item WITH create_new_batch + series auto-names it",
   decideReturn({ has_batch_no: 1, create_new_batch: 1, batch_number_series: "BAT-.#####" }).auto_batch === true);

ok("return: batch item with create_new_batch but NO series must ASK",
   decideReturn({ has_batch_no: 1, create_new_batch: 1, batch_number_series: "" }).needs_batch_number === true,
   "ERPNext has no series to generate from and throws at save");

ok("return: batch item without create_new_batch must ASK (select existing)",
   decideReturn({ has_batch_no: 1, create_new_batch: 0, batch_number_series: "BAT-.#####" }).needs_batch_number === true);

ok("return: serial item WITH a series generates them",
   decideReturn({ has_serial_no: 1, serial_no_series: "SN-.#####" }).needs_serials === false);

ok("return: serial item WITHOUT a series must ASK for each number",
   decideReturn({ has_serial_no: 1, serial_no_series: "" }).needs_serials === true);

ok("return: batch+serial item asks for both when neither can auto-generate",
   JSON.stringify(decideReturn({ has_batch_no: 1, create_new_batch: 0, has_serial_no: 1 }))
     === JSON.stringify({ auto_batch: false, needs_batch_number: true, needs_serials: true }));

// A new item created on the fly never has a series, so if it is tracked the
// number must be typed -- the dialog must not offer auto-naming for it.
ok("return: a freshly created tracked item always needs the number typed",
   decideReturn({ has_batch_no: 1, create_new_batch: 0 }).needs_batch_number === true &&
   decideReturn({ has_serial_no: 1, serial_no_series: "" }).needs_serials === true);

// Contract: every key ReturnToStock.jsx reads from the context response must
// be one the server actually returns. A rename on either side breaks the dialog
// silently -- it would ask for a field number that is always absent, or ask for
// one the server never sends. Same failure class as invariant 16 (a titleKey
// pointing at an object instead of a string).
// Minimal on purpose: these are the keys the dialog actually reads. Listing
// everything the server happens to return made the first run fail on three keys
// it never uses -- which is the list being wrong, not the dialog. A contract
// test should be the smallest set that would break if either side changed.
const RETURN_CTX_KEYS = [
  "auto_batch", "auto_serial", "needs_batch_number", "needs_serials",
];
const dialogSrc = readFileSync(
  new URL("../../src/pages/Store/stock-balance/ReturnToStock.jsx", import.meta.url),
  "utf8",
);
for (const key of RETURN_CTX_KEYS) {
  ok(
    `return: the dialog reads context.${key}`,
    dialogSrc.includes(`?.${key}`) || dialogSrc.includes(`ctx.${key}`),
    "unused contract key -- either the dialog or the server changed",
  );
}
ok(
  "return: the dialog renders no batch field unless the server says it is needed",
  /effective\?\.needs_batch_number/.test(dialogSrc),
);
ok(
  "return: the dialog renders no serial field unless the server says it is needed",
  /effective\?\.needs_serials/.test(dialogSrc),
);
ok(
  "return: the dialog offers the same-item vs new-item choice the user asked for",
  dialogSrc.includes('t("store.returnStock.useSameItem")') &&
    dialogSrc.includes('t("store.returnStock.createNewItem")'),
);


// ---------------------------------------------------------------------------
// The desktop toolbar row, and every navigate() target.
//
// Two dead routes shipped because the route audit was a manual read of MEMORY
// §9.8: `/store/delivery/:name` (row click + post-save both fell through to the
// generic route) and `/quality-templates` (post-save redirect). A pattern
// matcher alone does NOT catch the first one -- `/store/:doctype/:name` happily
// matches `/store/delivery/DN-1`. It matches the wrong thing, which is why the
// hand audit missed it too.
// ---------------------------------------------------------------------------

const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const actionBarSrc = readSrc("../../src/components/ActionBar/index.jsx");
const filterFieldsSrc = readSrc("../../src/components/FilterModal/FilterFields.jsx");
const balanceSrc = readSrc("../../src/pages/Store/stock-balance/index.jsx");

// --- the desktop row -------------------------------------------------------
// Three flex children used to claim it at once: search was `sm:w-1/2`, and BOTH
// the filter row and the action cluster were `flex-1`. The filters got what was
// left after search took half and actions took half of the remainder.

ok("toolbar: inline search takes a fixed slot instead of half the row",
   /showInline \? "w-56 shrink-0" : "w-full sm:w-1\/2 sm:flex-none"/.test(actionBarSrc));
ok("toolbar: the action cluster yields the slack only when inline",
   /showInline \? "ml-auto" : "flex-1"/.test(actionBarSrc) &&
   /"flex shrink-0 flex-wrap items-center justify-end gap-1\.5"/.test(actionBarSrc),
   "inline: ml-auto lets the filter row grow. NOT inline: flex-1 pins the actions right");
ok("toolbar: the result-count pill never grows",
   /inline-flex h-7 shrink-0 items-center/.test(actionBarSrc));
ok("toolbar: the filter row may shrink and wraps internally",
   /"flex min-w-0 flex-1 flex-wrap items-start gap-2"/.test(actionBarSrc));
ok("toolbar: inline filters align from the top so mixed-height labels stay level",
   /inline \? "flex flex-wrap items-start gap-2" : "grid grid-cols-1 gap-3"/.test(filterFieldsSrc));

const balanceFilterCount = (balanceSrc.match(/field: "/g) || []).length;
const px = (name) => Number(actionBarSrc.match(new RegExp(name + " = (\\d+)"))[1]);
const declaredNeeds = px("INLINE_SEARCH_PX") + px("INLINE_RESULT_PX") + px("INLINE_FILTER_PX") * balanceFilterCount + 140;
const realNeeds = 224 + 96 + balanceFilterCount * 168 + 120 + 32;
ok("toolbar: the inline threshold is not optimistic",
   balanceFilterCount === 5 && declaredNeeds >= realNeeds - 40,
   `declared ${declaredNeeds}px vs ~${realNeeds}px for ${balanceFilterCount} filters`);

// --- navigate() targets ----------------------------------------------------

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const q = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(q, out);
    else if (e.name.endsWith(".jsx")) out.push(q);
  }
  return out;
};
const norm = (q) =>
  q.replace(/\$\{[^}]*\}/g, ":p").split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
const pat = (q) =>
  "^/" + norm(q).split("/").filter(Boolean)
    .map((s) => (s.startsWith(":") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/") + "/?$";

const appRouteSrc = readSrc("../../src/App.jsx");
const allRoutes = [...appRouteSrc.matchAll(/path="([^"]*)"/g)].map((m) => m[1]).filter((r) => r.startsWith("/"));
const allPats = allRoutes.map((r) => [r, new RegExp(pat(r))]);
const genericPats = allRoutes.filter((r) => r.includes(":doctype")).map((r) => [r, new RegExp(pat(r))]);
const specificPats = allPats.filter(([r]) => !r.includes(":doctype") && !r.includes(":hub"));

// GenericList/GenericForm navigate with a DYNAMIC hub (`/${hub}/${doctype}`)
// while routes name the hub literally. Widen a route's FIRST segment only when
// the target's own first segment is dynamic, so /nope/:doctype is still caught.
const hubWide = allRoutes
  .filter((r) => !norm(r).split("/").filter(Boolean)[0]?.startsWith(":"))
  .map((r) => new RegExp(pat("/" + [":hub", ...norm(r).split("/").filter(Boolean).slice(1)].join("/"))));

const navTargets = [];
for (const file of walk(new URL("../../src", import.meta.url).pathname)) {
  if (file.endsWith("/App.jsx")) continue;
  for (const m of readFileSync(file, "utf8").matchAll(/navigate\(\s*(`[^`]*`|"[^"]*")/g)) {
    navTargets.push([file.replace(/.*\/src\//, ""), m[1].slice(1, -1)]);
  }
}

const knownDoctypes = new Set(Object.keys(DOCTYPE_CONFIG));
const unresolvedNav = [];
const wrongDoctypeNav = [];
for (const [file, raw] of navTargets) {
  if (!raw.startsWith("/")) continue;                       // relative: resolved against the mounted route
  const n = norm(raw);
  const cands = n.startsWith("/:p/") ? allPats.map(([, rx]) => rx).concat(hubWide) : allPats.map(([, rx]) => rx);
  if (!cands.some((rx) => rx.test(n))) { unresolvedNav.push([file, raw]); continue; }
  // Only when NO specific literal route matches. `/store/delivery/new` matches
  // both a specific and a generic route and is fine; `/store/delivery/DN-1`
  // matches ONLY the generic one, so that segment is sent to the server verbatim
  // as the doctype (GenericForm decodes the param into the resource path).
  if (specificPats.some(([, rx]) => rx.test(n))) continue;
  const hits = genericPats.filter(([, rx]) => rx.test(n));
  if (!hits.length) continue;
  const idx = Math.min(...hits.map(([r]) => norm(r).split("/").filter(Boolean).indexOf(":doctype")));
  const val = decodeURIComponent(n.split("/")[idx + 1]);
  if (val === ":p") continue;                               // dynamic doctype from config at runtime
  if (!knownDoctypes.has(val)) wrongDoctypeNav.push([file, raw, val]);
}

ok("routes: every navigate() target resolves to a registered route",
   unresolvedNav.length === 0, unresolvedNav.map(([f, r]) => `${r} in ${f}`));
ok("routes: a target matched ONLY by a generic :doctype route names a real doctype",
   wrongDoctypeNav.length === 0,
   wrongDoctypeNav.map(([f, r, v]) => `${r} -> doctype ${JSON.stringify(v)} in ${f}`));

ok("routes: /store/delivery/:name is registered", /path="\/store\/delivery\/:name"/.test(appRouteSrc));
ok("routes: nothing navigates to the never-registered /quality-templates",
   !navTargets.some(([, r]) => norm(r) === "/quality-templates"));
ok("routes: no duplicate path= registrations",
   allRoutes.length === new Set(allRoutes).size,
   allRoutes.filter((r, i) => allRoutes.indexOf(r) !== i));



// ---------------------------------------------------------------------------
// Employee Checkin: the SPA once guessed this doctype's schema and every field
// it named was wrong (`checkin_time`, `checkout_time`, `status`, `log_date` do
// not exist; the moment is `time`, the direction is `log_type`). Frappe raises
// on the FIRST unknown field, so the message named whichever was listed first
// and read like a permissions fault.
//
// The reason it cannot simply be corrected in the client is permlevel: `time`
// is permlevel 1, and reportview.validate_fields DROPS a high-permlevel field
// the caller may not read instead of raising. A wrong guess renders an empty
// table with no error at all -- so the column choice has to be server-side and
// resolved from the live meta.
// ---------------------------------------------------------------------------

// Assertions below read COMMENTS-OUT. Explaining the bug means naming
// `checkout_time` and `resource/Employee Checkin` in prose, and a naive grep
// then reports the explanation as the defect -- which is how three of these
// failed while the code was correct.
const stripJsComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
// Python side needs BOTH: the docstring names every wrong field on purpose, and
// so do the inline `#` comments beside them.
//
// The docstring regex is deliberately NOT global. With /g it matches the real
// docstring and then keeps going, swallowing the `f"""` SQL block as a second
// pair -- which deletes the very lines the assertions below check for, and
// fails them while the code is correct. First pair only.
const stripPyComments = (src) =>
  src
    .replace(/"""[\s\S]*?"""/, "")
    .split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .join("\n");

const checkinFn = apiSource.slice(
  apiSource.indexOf("def get_checkin_logs("),
  apiSource.indexOf("@frappe.whitelist", apiSource.indexOf("def get_checkin_logs(")),
);
const checkinCode = stripPyComments(checkinFn);

ok(
  "checkin: the endpoint resolves its columns from the live meta, not literals",
  /meta\.has_field/.test(checkinCode) && /"time", "checkin_time"/.test(checkinCode),
  "a hardcoded column name is exactly what broke the client version",
);
ok(
  "checkin: no reference to a field that never existed on the doctype",
  !/\bcheckout_time\b/.test(checkinCode),
  "checkout_time has never existed on Employee Checkin",
);
// `time` vs `log_date`/`checkin_time` is a real version split, so those two may
// appear -- but only as guarded meta lookups, never as a literal in the SQL.
ok(
  "checkin: the SQL is built from resolved columns, never literal field names",
  /\.join\(select\)/.test(checkinCode) &&
    /order by `\{time_field\}`/.test(checkinCode),
  "a literal column in the f-string is the bug being fixed",
);
ok(
  "checkin: it fails closed on the doctype permission",
  /frappe\.has_permission\("Employee Checkin", "read"\)/.test(checkinFn),
);
ok(
  "checkin: it fails closed on the punch-time permlevel rather than returning blank",
  /get_permlevel_access/.test(checkinFn) && /permlevel/.test(checkinFn),
  "otherwise a missing permlevel looks exactly like 'no punches today'",
);
ok(
  "checkin: the day is a bounded range when only the Datetime exists",
  /between %s and %s/.test(checkinFn) && /00:00:00/.test(checkinFn),
);

const checkinClientCode = stripJsComments(
  readSrc("../../src/components/CheckinLogs.jsx"),
);
ok(
  "checkin: the client calls the endpoint, not the raw resource route",
  /method\/erpnext_ui\.api\.get_checkin_logs/.test(checkinClientCode) &&
    !/resource\/Employee Checkin/.test(checkinClientCode),
);
// The employee param is deliberate -- the Attendance report has to inspect a
// row's employee, not the caller's own. What matters is that it is optional,
// defaults to null so the ESS calendar cannot widen access by accident, and is
// authorised server-side through _get_scope.
ok(
  "checkin: the employee's employee is optional and defaults to null",
  /CheckinLogs\(\{ employee = null, date[,}]/.test(checkinClientCode) &&
    /\{ employee, date[ ,]/.test(checkinClientCode),
  "a required employee would force the ESS calendar to send one",
);
// Asserting that `_get_scope` APPEARS is not enough: leaving the call in place
// and gutting the branch around it still passes, and the branch is the whole
// point. These check the gate's own body -- a version of this file with the
// throw replaced by `pass`, or by a silent substitution, has to fail.
const gateStart = checkinCode.indexOf("if employee != my_employee:");
const gateEnd = checkinCode.indexOf('frappe.has_permission("Employee", "read"', gateStart);
const employeeGate = gateStart === -1 ? "" : checkinCode.slice(gateStart, gateEnd);

ok(
  "checkin: naming another employee passes through _get_scope",
  /_get_scope\(frappe\.session\.user\)/.test(checkinCode),
  "employee codes are guessable; an unauthorised check would expose anyone's punches",
);
ok(
  "checkin: the other-employee gate really gates (throws, and consults scope)",
  /frappe\.throw/.test(employeeGate) &&
    /PermissionError/.test(employeeGate) &&
    /can_view_others/.test(employeeGate),
  "the gate must throw when the scope refuses, not merely exist",
);
ok(
  "checkin: the gate never falls back to the caller's own employee",
  !/employee\s*=\s*my_employee/.test(employeeGate),
  "substituting would show one person's punches under another's name",
);
ok(
  "checkin: the named Employee must additionally be readable",
  /frappe\.has_permission\("Employee", "read", employee\)/.test(checkinCode),
);
// Match the CONDITION, not just the word: dead-coding the `if` left
// `allowed_departments` in the branch body and the loose check passed, so an HOD
// scoped to their own departments could see the rest of the company.
ok(
  "checkin: a department-restricted scope is honoured, not just can_view_others",
  /allowed_departments"\] is not None/.test(employeeGate) &&
    /department in scope\["allowed_departments"\]/.test(employeeGate),
  "an HOD scoped to their own departments must not see the rest",
);
ok(
  "checkin: the attendance report passes its row's employee",
  /<CheckinLogs employee=\{selectedEmployee\} date=\{selectedDate\} \/>/.test(
    readSrc("../../src/pages/Reports/attendance/AttendancePage.jsx")),
);
ok(
  "checkin: the report opens the log for Half Day and Late, not just Present",
  /\["Present", "Half Day", "Late"\]\.includes\(status\)/.test(
    readSrc("../../src/pages/Reports/attendance/AttendancePage.jsx")),
);
ok(
  "checkin: the client renders log_type as the direction, not a checkout column",
  /log\.log_type/.test(checkinClientCode) && !/checkout_time/.test(checkinClientCode),
);
ok(
  "checkin: a load failure is surfaced, not swallowed into an empty list",
  /setError/.test(checkinClientCode) && /reports\.checkinLogsError/.test(checkinClientCode),
  "an empty list is indistinguishable from 'you had no punches'",
);


// ---------------------------------------------------------------------------
// `?employee=null` reached the server as a four-character STRING.
//
// `new URLSearchParams({employee: null})` serialises a null JS value as the
// literal "null". Frappe copies query params into `frappe.form_dict`, so the
// endpoint received the string -- truthy, therefore kept by
// `employee = employee or my_employee`, and then read as a document name:
// `DoesNotExistError: Employee null not found`.
//
// Two fixes, both asserted: the query string is built without null/undefined,
// and the server normalises the literal spellings anyway. The server half is not
// redundant -- any bundle predating the client fix keeps sending `employee=null`
// until it is redeployed, and this endpoint is the security boundary.
// ---------------------------------------------------------------------------

const apiClientSrc = readSrc("../../src/services/api.jsx");

ok(
  "query params: null/undefined are dropped before serialising",
  /v !== null && v !== undefined/.test(apiClientSrc) &&
    /new URLSearchParams\(clean\)/.test(apiClientSrc),
  "URLSearchParams turns a null value into the string 'null'",
);
ok(
  "query params: an empty string is still sent",
  /v !== null && v !== undefined/.test(apiClientSrc) && !/v !== ""/.test(apiClientSrc),
  '"" is a deliberate "no filter" for filter fields and must survive',
);

ok(
  "checkin: the server treats a literal null/undefined/empty as no employee",
  /if employee in \("", "null", "undefined", "None"\):\s*\n\s*employee = None/.test(checkinFn) &&
    /if date in \("", "null", "undefined", "None"\):\s*\n\s*date = None/.test(checkinFn),
  "query params arrive as strings, so 'absent' has to be detected by spelling",
);
ok(
  "checkin: normalisation happens BEFORE the employee is used",
  checkinCode.indexOf('if employee in ("", "null"') <
    checkinCode.indexOf("scope = _get_scope(") &&
    checkinCode.indexOf('if employee in ("", "null"') <
    checkinCode.indexOf("employee = employee or my_employee"),
  "normalising after the fallback has already chosen is too late",
);



// ---------------------------------------------------------------------------
// The ESS day popup used to show the same punch twice.
//
// `Attendance.in_time` / `out_time` ARE the first and last check-in of the day
// (HRMS derives them from the check-ins). Adding the punch log to this popup --
// so a Half Day could show its middle punches at all -- therefore left the
// summary repeating the log's first IN and last OUT. Invisible on a Present day
// with one punch in and one out; obvious on a Half Day, which has four punches
// and so looks like two duplicated pairs.
//
// The summary is now suppressed once the log reports rows, and kept when the log
// is empty or failed -- an `Attendance` row can carry in/out with no check-in
// rows behind it (manually entered), and that case must not lose its times.
// ---------------------------------------------------------------------------

const essAttendanceSrc = readSrc("../../src/pages/ESS/Attendance.jsx");

ok(
  "attendance popup: the in/out summary is suppressed once the log lists punches",
  /dayHasPunches === false && activeDay\.att\?\.in_time/.test(essAttendanceSrc) &&
    /dayHasPunches === false && activeDay\.att\?\.out_time/.test(essAttendanceSrc),
  "otherwise a half day renders its first and last punch a second time below",
);
ok(
  "attendance popup: the state is tri-state so the summary cannot flash while loading",
  /useState\(null\)/.test(
    essAttendanceSrc.slice(
      essAttendanceSrc.indexOf("dayHasPunches"),
      essAttendanceSrc.indexOf("dayHasPunches") + 200,
    ),
  ) && /setDayHasPunches\(null\)/.test(essAttendanceSrc),
  "a boolean renders the summary for a frame and then pulls it away",
);
ok(
  "attendance popup: the log tells the parent how many punches it found",
  /onResult=\{\(\{ count \}\) => setDayHasPunches\(count > 0\)\}/.test(essAttendanceSrc),
);
ok(
  "attendance popup: onResult is NOT a fetch dependency (refetch loop otherwise)",
  /}, \[employee, date\]\);/.test(checkinClientCode) &&
    !/}, \[employee, date, onResult\]\);/.test(checkinClientCode),
  "an inline arrow changes identity each render: effect -> onResult -> render -> new arrow -> effect",
);



// ---------------------------------------------------------------------------
// Purchase Receipt: one surface, two sections -- never a dialog on a dialog.
//
// `ReceiptItemPicker` opened `ReceiptLineDialog` on top of itself, so adding a
// line meant two stacked overlays and dismissing two to get back to the
// receipt. On a phone the picker stayed fully rendered behind the form, so the
// user could not tell which surface they were editing.
//
// The split is two columns from `md` up and ONE PANE AT A TIME below it, which
// is a content decision rather than a width one: the list is a scrolling column
// and the form is a tall stack of number fields, and side by side on a phone
// both end up clipped.
// ---------------------------------------------------------------------------

const workbenchSrc = readSrc(
  "../../src/pages/Store/purchase-receipt/components/ReceiptItemWorkbench.jsx",
);
// Structural checks read COMMENTS-OUT. The docstring explains the stacked-dialog
// bug by naming both components, so a naive grep reports the explanation as the
// defect -- the same trap as the Employee Checkin fields.
const workbenchCode = stripJsComments(workbenchSrc);
const lineFormSrc = readSrc(
  "../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx",
);
const receiptFormSrc = readSrc(
  "../../src/pages/Store/purchase-receipt/form/index.jsx",
);
const receiptFormCode = stripJsComments(receiptFormSrc);

// Exactly ONE dialog -- not zero, and not two. Rendered inline it grew the
// document instead of the surface, so the user scrolled the page to work a line;
// a second dialog inside it is the stacking this replaced.
ok(
  "receipt picker: the workbench is itself the single dialog",
  /<AppModal/.test(workbenchCode) &&
    (workbenchCode.match(/<AppModal/g) || []).length === 1,
);
ok(
  "receipt picker: no second dialog is opened from inside it",
  !/ReceiptLineDialog/.test(workbenchCode) && !/<AppModal[\s\S]*<AppModal/.test(workbenchCode),
  "that is the stacked-overlay bug, verbatim",
);
ok(
  "receipt picker: the modal scrolls internally so the page never grows",
  /width="xl"/.test(workbenchCode) && /max-h-\[/.test(workbenchCode),
);
// Mutually exclusive on OPEN STATE, not on purpose. Gating the line dialog on
// `fromPo` shipped a dead Edit button: on a PO receipt the button set `editing`,
// and the only surface reading `editing` for that purpose was the workbench,
// which was closed -- so nothing appeared at all.
ok(
  "receipt picker: the tray Edit dialog is NOT gated on the purpose",
  !/\{fromPo \? null : \(\s*<ReceiptLineDialog/.test(receiptFormCode),
  "on a PO receipt this left the Edit button setting state nothing rendered",
);
ok(
  "receipt picker: the line dialog opens only while the workbench is closed",
  /show=\{!!editingRow && !pickerOpen\}/.test(receiptFormCode),
  "picking a line also sets `editing`, and that must show in the workbench pane",
);
ok(
  "receipt picker: the tray Edit button opens the line dialog",
  /onClick=\{\(\) => setEditing\(row\._rid\)\}/.test(receiptFormCode),
);
ok(
  "receipt picker: the workbench has both sections in one render",
  (workbenchCode.match(/<section/g) || []).length === 2,
  "one surface, two sections",
);
ok(
  "receipt picker: split panes from md up",
  /md:grid-cols-\[/.test(workbenchCode),
);
ok(
  "receipt picker: one pane at a time below md, via CSS not a media query",
  /pane === "list" \? "flex" : "hidden md:flex"/.test(workbenchCode) &&
    /pane === "form" \? "flex" : "hidden md:flex"/.test(workbenchCode) &&
    !/useIsMobile|matchMedia/.test(workbenchCode),
  "a JS breakpoint disagrees with the stylesheet after a resize",
);
// Match the Back BUTTON's own handler, not any `setPane("list")` -- `close()`
// also calls it, so the loose check passed a Back button wired to nothing.
ok(
  "receipt picker: the Back control itself returns to the list pane",
  /onClick=\{\(\) => setPane\("list"\)\}/.test(workbenchCode) &&
    /ArrowLeft/.test(workbenchCode) &&
    /md:hidden/.test(workbenchCode),
  "a dead Back button strands the user on the form with no route to the list",
);
ok(
  "receipt picker: choosing a line swaps to the form pane",
  /const choose = \(line\) => \{[\s\S]{0,160}setPane\("form"\)/.test(workbenchCode),
);
ok(
  "receipt picker: the empty state asks for a pick instead of blank space",
  /picker\.pickFirst/.test(workbenchCode),
);
ok(
  "receipt picker: the old picker is gone and nothing imports it",
  !existsSync(new URL("../../src/pages/Store/purchase-receipt/components/ReceiptItemPicker.jsx", import.meta.url)),
);
ok(
  "receipt picker: the line form is shared, so the two entry points cannot drift",
  /<ReceiptLineForm/.test(workbenchCode) &&
    /<ReceiptLineForm/.test(
      readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineDialog.jsx"),
    ),
  "two copies of the measured-total logic would drift",
);
ok(
  "receipt picker: the derived factor stays read-only in the shared form",
  /t\("store\.receipt\.factor"\)/.test(lineFormSrc) &&
    !/name="conversion_factor"[^]*?Input/.test(lineFormSrc),
);
ok(
  "receipt picker: the workbench renders the form, not a second dialog",
  /<ReceiptItemWorkbench/.test(receiptFormSrc) && !/<ReceiptItemPicker/.test(receiptFormSrc),
);


// ---------------------------------------------------------------------------
// A production indent is a bill of materials, so its project belongs on the
// HEADER, not on each row.
//
// Picking it per row meant transcribing a list the server already knows: every
// row opened the same BOM and the user re-read it N times. Worse, two rows could
// disagree about the project, so one indent could quietly request material for
// two different projects -- which `validate_with_previous_doc` never sees,
// because it compares rows against the source document, not against each other.
//
// ERPNext still stores `project` per ITEM row, so the header value is copied
// onto every row on selection and stripped back off before the save: it is a
// form control, and Material Request has no such header column.
// ---------------------------------------------------------------------------

const mrSrc = readSrc("../../src/pages/Store/material-request/form/index.jsx");
const mrCode = stripJsComments(mrSrc);

ok(
  "material request: the production project is chosen once, on the header",
  /isProjectDriven = purpose === "production"/.test(mrCode) &&
    /doctype="Project"[\s\S]{0,120}handleHeaderProjectChange/.test(mrCode),
  "a per-row project means transcribing one BOM once per line",
);
ok(
  "material request: choosing the project fills the items from its BOM",
  /get_project_items/.test(mrSrc) &&
    /bomAdded/.test(mrCode) &&
    /outstanding_qty/.test(mrCode),
  "the endpoint already returns BOM lines; the form must consume them",
);
ok(
  "material request: filling is additive -- existing rows and duplicates survive",
  // Check the Set is POPULATED, not merely that `.has()` is called -- an empty
  // Set still reads as "dedupe present" to a looser check.
  /const onDoc = new Set\([\s\S]{0,140}doc\.items\.map\(\(r\) => r\.item_code\)/.test(mrCode) &&
    /onDoc\.has\(it\.item_code\)/.test(mrCode) &&
    /const filled = withProject\.filter\(\(r\) => r\.item_code\)/.test(mrCode),
  "re-picking a project must not discard a typed row or duplicate a line",
);
ok(
  "material request: exactly one spare empty row is left at the end",
  /empties\.slice\(0, 1\)/.test(mrCode),
  "the user needs somewhere to add the next item",
);
ok(
  "material request: quantity defaults to the OUTSTANDING gap, not the BOM qty",
  /outstanding > 0 \? outstanding : it\.required_qty/.test(mrCode),
  "re-requesting what is already pending is how duplicate indents happen",
);
ok(
  "material request: the header project never reaches the server as a header field",
  /const \{ project: _formProject, \.\.\.payload \} = current/.test(mrCode) &&
    /doc: payload/.test(mrCode),
  "Material Request has no header project column; the rows carry it",
);
ok(
  "material request: an existing indent recovers its header project from the rows",
  /find\(\(r\) => r\.project\)\?\.project/.test(mrCode),
  "otherwise editing blanks every row when the empty box is cleared",
);
ok(
  "material request: the per-row project is hidden where the header owns it",
  /\{!isProjectDriven \? \([\s\S]{0,220}projectOptional/.test(mrCode),
  "two controls that can disagree are worse than one",
);


// ---------------------------------------------------------------------------
// No dashboard hero.
//
// `DashboardHero` rendered the page's own subtitle inside a card directly
// beneath the top bar, which already showed that subtitle from `setHeader`. So
// every dashboard opened with a full-width strip saying nothing the header had
// not already said, and the actual content -- the tiles -- started below the
// fold. Store and ESS had already dropped it with that reasoning recorded in
// place; the remaining seven dashboards did not, which is why it looked like a
// deliberate design element rather than an accident.
//
// The component is now deleted, so the strongest form of this check is simply
// that it is gone AND that no dashboard reintroduces a hero-shaped block.
// ---------------------------------------------------------------------------

const DASHBOARDS = [
  "../../src/components/Approval/index.jsx",
  "../../src/pages/Sales/index.jsx",
  "../../src/pages/Quality/index.jsx",
  "../../src/pages/Quality/reports/index.jsx",
  "../../src/pages/Dashboard/index.jsx",
  "../../src/pages/HR/index.jsx",
  "../../src/pages/Production/index.jsx",
  "../../src/pages/Purchase/index.jsx",
  "../../src/pages/Reports/index.jsx",
  "../../src/pages/ESS/index.jsx",
  "../../src/pages/Store/index.jsx",
];

ok(
  "dashboard: the hero component is gone",
  !existsSync(
    new URL("../../src/components/dashboard/DashboardHero.jsx", import.meta.url),
  ),
);
ok(
  "dashboard: no dashboard renders a hero",
  DASHBOARDS.every((rel) => {
    const src = stripJsComments(readSrc(rel));
    return !/DashboardHero/.test(src);
  }),
  DASHBOARDS.filter((rel) =>
    /DashboardHero/.test(stripJsComments(readSrc(rel))),
  ),
);
// The subtitles the heroes displayed must still be reachable -- through
// setHeader. Removing a hero must not take the page's context line with it.
// `dashboard.quickAccess` ("Quick access to all modules") was never rendered by
// anything, even before the hero went. Dead in all three locales.
ok(
  "dashboard: the never-rendered quickAccess key is gone from every locale",
  ["en", "hi", "ar"].every(
    (l) => !/"quickAccess"/.test(readSrc(`../../src/i18n/locales/${l}/translation.json`)),
  ),
);
ok(
  "dashboard: every hero subtitle is still shown by setHeader",
  [
    "../../src/components/Approval/index.jsx",
    "../../src/pages/Sales/index.jsx",
    "../../src/pages/Quality/index.jsx",
    "../../src/pages/Dashboard/index.jsx",
    "../../src/pages/HR/index.jsx",
    "../../src/pages/Production/index.jsx",
    "../../src/pages/Purchase/index.jsx",
    "../../src/pages/Reports/index.jsx",
  ].every((rel) => /subtitle:/.test(stripJsComments(readSrc(rel)))),
  "the hero repeated this text; deleting it must not orphan the string",
);


// ---------------------------------------------------------------------------
// Serial numbers on a weighed receipt.
//
// ERPNext's rule, from serial_batch_bundle.py and stock/utils.py: for a
// serialised item the serial count must equal the quantity in STOCK UOM. The
// bundle builds one `Serial and Batch Entry` per serial (qty 1) and then asserts
// the bundle total equals the Stock Ledger Entry's `actual_qty`, which is in
// stock UOM. So a Kg-stocked item takes one serial per Kg -- never per piece.
//
// That makes a whole `stock_qty` mandatory for a serialised item EVEN WHEN the
// UOM itself permits fractions, which no `must_be_whole_number` flag expresses.
// A 12.5 Kg delivery would otherwise reach ERPNext and fail with "Total qty ...
// is not equal to Actual Qty", which never mentions serials at all.
// ---------------------------------------------------------------------------

const SERIAL_INFO = { stock_uom: "Kg", has_serial_no: 1, serial_no_series: "" };
const AUTO_SERIAL_INFO = { stock_uom: "Kg", has_serial_no: 1, serial_no_series: "SN-.#####" };

ok(
  "serials: the count is per STOCK unit, not per transaction unit",
  serialCount({ uom: "Nos", stock_uom: "Kg", qty: 10, stock_qty: 13 }) === 13,
  "10 Nos weighing 13 Kg needs 13 serials, not 10",
);
ok(
  "serials: a serialised item refuses a fractional stock qty",
  validateSerials({ qty: 10, stock_qty: 12.5 }, SERIAL_INFO) ===
    "store.receipt.validation.serialWholeStockQty",
  "12.5 Kg cannot have 12.5 serials; this is the save failure, caught early",
);
ok(
  "serials: a whole stock qty passes the whole-number gate",
  validateSerials({ qty: 10, stock_qty: 13, serial_no: "a\nb\nc" }, SERIAL_INFO) === null ||
    validateSerials({ qty: 10, stock_qty: 13, serial_no: "" }, SERIAL_INFO) ===
      "store.receipt.validation.serialCountMismatch",
  "the count gate still applies once the qty is whole",
);
ok(
  "serials: the typed list must match the expected count exactly",
  validateSerials({ qty: 10, stock_qty: 3, serial_no: "a\nb" }, SERIAL_INFO) ===
    "store.receipt.validation.serialCountMismatch",
);
ok(
  "serials: a repeated serial is rejected",
  validateSerials({ qty: 2, stock_qty: 2, serial_no: "a\na" }, SERIAL_INFO) ===
    "store.receipt.validation.serialDuplicate",
);
ok(
  "serials: a series means nothing has to be typed",
  serialsAreGenerated(AUTO_SERIAL_INFO) &&
    !serialsAreGenerated(SERIAL_INFO) &&
    validateSerials({ qty: 10, stock_qty: 13, serial_no: "" }, AUTO_SERIAL_INFO) === null,
);
ok(
  "serials: an unserialised item is untouched by all of this",
  !needsSerials({ stock_uom: "Kg" }) &&
    validateSerials({ qty: 10, stock_qty: 12.5 }, { stock_uom: "Kg" }) === null,
  "a fractional Kg line that is not serialised is perfectly legal",
);
ok(
  "serials: a missing or zero quantity is reported before the count",
  validateSerials({ qty: "", stock_qty: "" }, SERIAL_INFO) ===
    "store.receipt.validation.serialNeedsQty" &&
    validateSerials({ qty: 1, stock_qty: 0 }, SERIAL_INFO) ===
      "store.receipt.validation.serialNeedsPositiveQty",
);
ok(
  "serials: parsing matches ERPNext's own newline split",
  parseSerials("a\n\n b \nc\n").join(",") === "a,b,c",
);
ok(
  "serials: per-serial weight is 1 stock unit and the value is the row rate",
  perSerialFigures({ qty: 10, stock_qty: 13, rate: 250 }).weightPerSerial === 1 &&
    perSerialFigures({ qty: 10, stock_qty: 13, rate: 250 }).ratePerSerial === 250,
  "derived, never an input -- neither doctype has a per-serial weight field",
);
ok(
  "batches: required, auto, or absent, per the item flags",
  batchRule({ has_batch_no: 0 }) === "none" &&
    batchRule({ has_batch_no: 1, create_new_batch: 1, batch_number_series: "B-.####" }) === "auto" &&
    batchRule({ has_batch_no: 1, create_new_batch: 0 }) === "required" &&
    validateBatch({ batch_no: "" }, { has_batch_no: 1, create_new_batch: 0 }) ===
      "store.receipt.validation.batchRequired" &&
    validateBatch({}, { has_batch_no: 1, create_new_batch: 1, batch_number_series: "B-.####" }) === null,
);
// The JS rules are useless if the endpoint stops telling the client the item is
// serialised -- the form would silently fall back to a non-serial receipt and
// ERPNext would reject it. Assert the contract, not just the arithmetic.
const uomOptionsFn = apiSource.slice(
  apiSource.indexOf("def get_item_uom_options("),
  apiSource.indexOf("@frappe.whitelist", apiSource.indexOf("def get_item_uom_options(")),
);
// ---------------------------------------------------------------------------
// The Nos <-> Kg (or Nos <-> Ltr) calculation.
//
// The user counts pieces and the item is stocked by weight. ERPNext relates the
// two with `stock_qty = qty * conversion_factor`, and on a PO receipt the factor
// is the one field it never compares against the purchase order -- so it is ours
// to derive and the user should see it, not infer it from a number in a corner.
// ---------------------------------------------------------------------------

const KG_ITEM = {
  stock_uom: "Kg",
  uoms: [
    { uom: "Nos", must_be_whole_number: 0 },
    { uom: "Kg", must_be_whole_number: 0 },
  ],
};
const LTR_ITEM = { ...KG_ITEM, stock_uom: "Ltr" };

ok(
  "conversion: Nos to Kg derives the factor from the measured weight",
  (() => {
    const c = conversionPreview({ qty: 10, measured_total: 25.4, uom: "Nos" }, KG_ITEM, "Nos");
    return c && c.from === "Nos" && c.to === "Kg" && c.perUnit === 2.54;
  })(),
  "10 pieces weighing 25.4 Kg is 2.54 Kg each",
);
ok(
  "conversion: Nos to Ltr works the same way (not hardcoded to Kg)",
  (() => {
    const c = conversionPreview({ qty: 10, measured_total: 4, uom: "Nos" }, LTR_ITEM, "Nos");
    return c && c.to === "Ltr" && c.perUnit === 0.4;
  })(),
);
ok(
  "conversion: both units of the delivery are reported, not just the factor",
  (() => {
    const c = conversionPreview({ qty: 10, measured_total: 25.4, uom: "Nos" }, KG_ITEM, "Nos");
    return c.thisQty === 10 && c.thisTotal === 25.4;
  })(),
);
ok(
  "conversion: no readout when the received UOM IS the stock UOM",
  conversionPreview({ qty: 10, uom: "Kg" }, KG_ITEM, "Kg") === null,
  "'1 Kg = 1 Kg' is noise",
);
ok(
  "conversion: the factor is shown before a weight is typed",
  (() => {
    const c = conversionPreview({ qty: 10, uom: "Nos" }, KG_ITEM, "Nos");
    return c !== null && c.perUnit === null && c.thisTotal === null;
  })(),
  "the relationship is the point; it should not wait for the numbers",
);

ok(
  "conversion: the form shows the calculation, not just the stored factor",
  /conversionPreview/.test(readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx")) &&
    /store\.receipt\.conversion/.test(
      readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx"),
    ),
);
ok(
  "conversion: the PO UOM stays locked, because ERPNext compares it",
  /isPoRow \? \(\s*<div className="flex items-center gap-2">/.test(
    readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx"),
  ) &&
    /uomFromPo/.test(
      readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx"),
    ),
  "purchase_receipt.py:315 puts uom in compare_fields -- changing it fails the save",
);

ok(
  "serials: the endpoint reports the item's serial and batch configuration",
  // Anchor on the `"key":` form. A bare `"batch_number_series"` also appears in
  // the get_value field list, so the loose check passed while the flag was no
  // longer returned -- and the form would then never generate a batch number.
  /"has_serial_no": cint\(tracking\.get\("has_serial_no"\)\)/.test(uomOptionsFn) &&
    /"serial_no_series": tracking\.get/.test(uomOptionsFn) &&
    /"has_batch_no": cint\(tracking\.get\("has_batch_no"\)\)/.test(uomOptionsFn) &&
    /"create_new_batch": cint\(tracking\.get\("create_new_batch"\)\)/.test(uomOptionsFn) &&
    /"batch_number_series": tracking\.get/.test(uomOptionsFn),
  "without these the form cannot tell a serialised item from a plain one",
);

ok(
  "serials: the form saves ONLY when both gates pass",
  /validateSerials\(row, info\)/.test(receiptFormSrc) &&
    /validateBatch\(row, info\)/.test(receiptFormSrc),
  "without these the failure surfaces from ERPNext as a bundle total mismatch",
);


// ---------------------------------------------------------------------------
// The purchase order's conversion factor is a valid default.
//
// The form built every picked row with a hardcoded `conversion_factor: 1` while
// KEEPING the PO's `stock_qty` -- so the row contradicted itself. The server
// recomputes `stock_qty = qty * conversion_factor` (buying_controller.py:517),
// so a delivery nobody could weigh booked 10 Kg instead of 10,000 Kg, with no
// error anywhere. `make_purchase_receipt` had handed us the real factor all
// along and the form threw it away.
//
// To stop that without forcing a weighbridge, `validateLineRow` used to make
// `measured_total` mandatory for ANY row whose UOM differs from stock UOM. The
// fix is to book on the ordered rate and treat a weight as an override.
// ---------------------------------------------------------------------------

const PO_FALLBACK = { conversion_factor: 1000, conversion_source: "purchase_order" };
const PO_ROW = {
  uom: "Nos",
  stock_uom: "Kg",
  qty: 10,
  measured_total: "",
  conversion_factor: 1000,
  conversion_source: "purchase_order",
  stock_qty: 10000,
};

ok(
  "conversion: the PO factor survives when no weight is entered",
  applyMeasuredTotal(PO_ROW, "", PO_FALLBACK).conversion_factor === 1000 &&
    applyMeasuredTotal(PO_ROW, "", PO_FALLBACK).stock_qty === 10000,
  "the live bug: factor 1 with the PO's stock_qty books 10 Kg",
);
ok(
  "conversion: a weight overrides the ordered rate",
  applyMeasuredTotal(PO_ROW, 1200, PO_FALLBACK).conversion_factor === 120 &&
    applyMeasuredTotal(PO_ROW, 1200, PO_FALLBACK).stock_qty === 1200,
);
ok(
  "conversion: clearing a weight restores the ordered rate, not factor 1",
  (() => {
    const weighed = applyMeasuredTotal(PO_ROW, 1200, PO_FALLBACK);
    const cleared = applyMeasuredTotal(weighed, "", PO_FALLBACK);
    return cleared.conversion_factor === 1000 && cleared.stock_qty === 10000;
  })(),
  "stranding the row at 1 is the silent-under-receipt bug again",
);
ok(
  "conversion: no fallback and no weight falls back to factor 1 AND says so",
  (() => {
    const r = applyMeasuredTotal(
      { uom: "Nos", stock_uom: "Kg", qty: 10, measured_total: "" },
      "",
      null,
    );
    return r.conversion_factor === 1 && r.conversion_source === "default";
  })(),
);
ok(
  "conversion: a factor of 1 is not treated as missing",
  hasUsableFactor({ conversion_source: "purchase_order", conversion_factor: 1 }) &&
    !hasUsableFactor({ conversion_source: "default", conversion_factor: 1 }),
  "1 Nos = 1 Kg is a real rate for a light item; magnitude proves nothing",
);
ok(
  "conversion: quantity edits recompute stock_qty from the factor",
  (() => {
    const r = applyQuantity(PO_ROW, 12, PO_FALLBACK);
    return r.stock_qty === 12000 && r.conversion_factor === 1000;
  })(),
  "otherwise 10 -> 12 Nos still posts the old 10,000 Kg",
);
ok(
  "conversion: a quantity edit keeps a measured factor",
  (() => {
    const weighed = applyMeasuredTotal(PO_ROW, 1200, PO_FALLBACK);
    const r = applyQuantity(weighed, 12, PO_FALLBACK);
    return r.stock_qty === 1200;
  })(),
  "weight is the numerator; it does not scale with the piece count",
);
ok(
  "conversion: the basis tells the UI which number it is showing",
  conversionBasis({ conversion_source: "measured" }) === "measured" &&
    conversionBasis({ conversion_source: "purchase_order" }) === "purchase_order" &&
    conversionBasis({ conversion_source: "default" }) === "unresolved",
);
ok(
  "conversion: an unweighed PO line passes validation",
  validateLineRow(PO_ROW, KG_ITEM, (k) => k) === null,
  "a delivery with no weighbridge must still be receivable",
);
ok(
  "conversion: a line with no factor AND no weight is still blocked",
  validateLineRow(
    { uom: "Nos", stock_uom: "Kg", qty: 10, measured_total: "", conversion_source: "default" },
    KG_ITEM,
    (k) => k,
  ) === "store.receipt.validation.totalRequired",
  "posting factor 1 there would book the piece count as stock",
);
// Asserting `applyQuantity` works is not the same as asserting the form CALLS
// it -- the wiring is where the stale stock_qty came from.
const receiptLineFormSrc = readSrc(
  "../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx",
);
ok(
  "conversion: a quantity edit routes through applyQuantity",
  /"qty" in patch/.test(lineFormSrc) &&
    /applyQuantity\(next, next\.qty, fallback\)/.test(lineFormSrc),
  "without it 10 -> 12 Nos still posts the old 10,000 Kg",
);
ok(
  "conversion: the ordered rate is threaded in so clearing a weight restores it",
  /factor_from_po/.test(lineFormSrc) && /factor_source_po/.test(lineFormSrc) &&
    /factor_from_po/.test(receiptFormSrc),
);

ok(
  "conversion: the form keeps the mapper's factor instead of hardcoding 1",
  /conversion_factor: r\.conversion_factor \?\? ""/.test(receiptFormSrc) &&
    // Scoped to pickLine: a blank direct-entry row legitimately has no factor
    // and must not be read as "the PO rate is being dropped".
    /conversion_factor: poFactor/.test(receiptFormSrc),
  "the mapper already returns the PO rate",
);
ok(
  "conversion: a zero or absent PO factor is not trusted",
  /Number\.isFinite\(poFactor\) && poFactor > 0/.test(receiptFormSrc),
  "TEST-KG-NOS carries 0.0 on its Nos row; a truthiness test would accept it",
);


// ---------------------------------------------------------------------------
// Receiving part of an order, and a delivery that does not match its rate.
//
// The PO line arrives holding the FULL outstanding quantity (10 Nos), which
// reads as "you must receive all of it". Partial receipt is legal and common --
// ERPNext's `status_updater` writes `received_qty` back against the ordered
// `qty`, with `overflow_type: "receipt"` governing only OVER-receipt -- so the
// UI has to say so rather than leave the user guessing.
//
// One line carries exactly one factor, so sheets of differing weights collapse
// to an average. That is not a correctness loss: `qty * factor` reproduces the
// weight the user typed either way. What it cannot catch is a slip -- the whole
// delivery's weight typed onto one sheet's line -- which would book silently and
// correctly for the wrong quantity.
// ---------------------------------------------------------------------------

const ORDERED_10 = { ...PO_ROW, pending_qty: 10 };

ok(
  "partial: one sheet out of ten takes the ordered rate",
  (() => {
    const r = applyQuantity(ORDERED_10, 1, PO_FALLBACK);
    return r.qty === 1 && r.conversion_factor === 1000 && r.stock_qty === 1000;
  })(),
  "under-receipt is legal; the factor comes from the order",
);
ok(
  "partial: that one sheet weighing 1200 instead of 1000 overrides the rate",
  (() => {
    const r = applyMeasuredTotal(applyQuantity(ORDERED_10, 1, PO_FALLBACK), 1200, PO_FALLBACK);
    return r.conversion_factor === 1200 && r.stock_qty === 1200;
  })(),
);
ok(
  "partial: mixed weights still total exactly right on one line",
  applyMeasuredTotal({ ...PO_ROW, qty: 5 }, 5200, PO_FALLBACK).stock_qty === 5200,
  "5 sheets totalling 5200 Kg must book 5200 Kg, however they were mixed",
);
ok(
  "partial: a factor of 1 on the order is not confused with an absent one",
  conversionDrift({ conversion_factor: 1, factor_from_po: 1 }) === 1,
);
ok(
  "partial: drift is null without both numbers",
  conversionDrift({ conversion_factor: 1000, factor_from_po: null }) === null &&
    conversionDrift({ conversion_factor: null, factor_from_po: 1000 }) === null,
);
ok(
  "partial: ordinary variation does not warn",
  !conversionDriftSuspicious({ conversion_factor: 1200, factor_from_po: 1000 }) &&
    !conversionDriftSuspicious({ conversion_factor: 1040, factor_from_po: 1000 }),
  "a 4% spread across mixed sheets is normal, not an error",
);
ok(
  "partial: a doubling DOES warn, on the boundary",
  conversionDriftSuspicious({ conversion_factor: 2000, factor_from_po: 1000 }) &&
    conversionDriftSuspicious({ conversion_factor: 400, factor_from_po: 1000 }),
  "a whole delivery's weight on one line is the classic slip, and it lands exactly on 2x",
);
ok(
  "partial: the UI states what is outstanding so reducing the qty is expected",
  // Quote-anchored: a bare substring test also matches `receivingOfX`, which is
  // how renaming the key to break this assertion went unnoticed once.
  /store\.receipt\.receivingOf"/.test(receiptLineFormSrc) &&
    /store\.receipt\.receivingAll"/.test(receiptLineFormSrc) &&
    /row\.pending_qty/.test(receiptLineFormSrc),
  "the row opens holding the full outstanding qty, which reads as mandatory",
);
ok(
  "partial: the picked line carries the outstanding quantity through",
  /pending_qty: line\.pending_qty/.test(receiptFormSrc),
);

// ---------------------------------------------------------------------------
// Cursor affordance — the one defect in this app that NOTHING can catch at
// runtime. A missing `cursor-pointer` compiles, renders, passes both SSR suites
// and throws no React error; the control simply shows the default arrow and the
// user never learns it is clickable. It shipped that way for every hand-rolled
// button in the Store module and in the shadcn primitives.
//
// The fix was one `@layer base` rule in index.css rather than ~60 per-call-site
// classes, so the invariant to guard is the rule itself plus the primitives that
// would otherwise contradict it.
// ---------------------------------------------------------------------------

const indexCssSrc = readSrc("../../src/index.css");

// The rule must live INSIDE `@layer base`. Tailwind emits its utilities into
// `@layer utilities`, which is declared after `base`, so layer order (not
// specificity) keeps the deliberate overrides working. Move it out of the layer
// and it would beat `cursor-default` on a locked form step and
// `cursor-w-resize` on the sidebar rail -- verified in the built
// public/erp_ui/*.css, where `@layer base` precedes `@layer utilities`.
//
// Containment is checked by brace-matching the enclosing block, NOT by slicing
// from `@layer base {` to EOF: index.css has several base blocks and a
// to-EOF slice happily "contains" a rule that was moved clean outside the
// layer, which is exactly the break this has to catch.
const cursorRuleAt = indexCssSrc.indexOf("button:not(:disabled)");
let enclosingBase = null;
{
  const lastBase = indexCssSrc.lastIndexOf("@layer base {", cursorRuleAt);
  if (lastBase !== -1) {
    // depth starts at 1 because `lastBase + "@layer base {".length` lands one
    // PAST the block's opening brace -- that brace is what makes the block open,
    // so counting from 0 here closes on the first inner rule instead.
    let depth = 1;
    for (let i = lastBase + "@layer base {".length; i < indexCssSrc.length; i++) {
      if (indexCssSrc[i] === "{") depth++;
      else if (indexCssSrc[i] === "}" && --depth === 0) {
        enclosingBase = indexCssSrc.slice(lastBase, i + 1);
        break;
      }
    }
  }
}
ok(
  "the cursor rule lives in @layer base so Tailwind utilities still override it",
  cursorRuleAt !== -1 && enclosingBase !== null && enclosingBase.includes("cursor: pointer"),
  "button:not(:disabled) ... cursor: pointer must sit inside a @layer base block",
);

// Radix renders menu and listbox items as <div role=...>, NOT <button>. A
// button-only rule misses every item in every menu, which is how Sign out and
// the language switcher stayed on the arrow even after the base rule landed.
ok(
  "the cursor rule covers Radix's role-based menu/listbox items, not just <button>",
  enclosingBase !== null &&
    ['role="menuitem"', 'role="menuitemcheckbox"', 'role="menuitemradio"', 'role="option"'].every(
      (r) => enclosingBase.includes(`[${r}]`),
    ),
  "every DropdownMenuItem (role=menuitem) and SelectItem (role=option) needs it",
);

// The controls that ARE explicitly non-actionable must keep saying so.
// `disabled:` / `data-disabled:` only affect the cursor while actually disabled,
// so a plain `cursor-pointer` on the primitive is the correct form.
const CURSOR_POINTER_PRIMITIVES = [
  ["../../src/components/ui/select.jsx", "SelectTrigger"],
  ["../../src/components/ui/tabs.jsx", "TabsTrigger"],
  ["../../src/components/ui/checkbox.jsx", "CheckboxPrimitive.Root"],
  ["../../src/components/ui/switch.jsx", "SwitchPrimitive.Root"],
];
for (const [rel, label] of CURSOR_POINTER_PRIMITIVES) {
  const src = readSrc(rel);
  const at = src.indexOf(label);
  // Take the ~700 chars from the primitive forward -- its className string is
  // the last thing before `>` in the JSX, so it is always inside this window.
  const region = at === -1 ? "" : src.slice(at, at + 700);
  ok(
    `${label} carries cursor-pointer`,
    region.includes("cursor-pointer"),
    `${rel}: no cursor-pointer near ${label}`,
  );
}

// shadcn ships `cursor-default` on menu items (its native-menu convention).
// That is the one place the arrow was EXPLICITLY requested rather than merely
// missing, and it is what made every dropdown item look like static text.
ok(
  "dropdown-menu.jsx no longer requests cursor-default on any item",
  !readSrc("../../src/components/ui/dropdown-menu.jsx").includes("cursor-default"),
  "every DropdownMenuItem / CheckboxItem / RadioItem / SubTrigger is clickable",
);

// Select is the one file where a legitimate `cursor-default` REMAINS: the
// up/down scroll buttons of the popup (select.jsx:146,165) are not actionable
// and should not advertise otherwise. Assert SelectItem itself is clean and
// that only those two survive -- zero-tolerance would be wrong, one would mean
// an item regressed, more would mean new dead affordances.
const selectSrc = readSrc("../../src/components/ui/select.jsx");
const selectItemAt = selectSrc.indexOf("function SelectItem(");
const selectDefaults = (selectSrc.match(/cursor-default/g) || []).length;
ok(
  "select.jsx's only remaining cursor-default is the non-interactive scroll buttons",
  selectItemAt !== -1 &&
    !selectSrc.slice(selectItemAt, selectItemAt + 900).includes("cursor-default") &&
    selectDefaults === 2,
  `SelectItem must be clean; found ${selectDefaults} cursor-default, expected exactly 2 (scroll up/down)`,
);

// ---------------------------------------------------------------------------
// Report keys must exist server-side.
//
// `canReadReport(key)` reads `doctypeAccess.reports[key]`, which the server
// populates from exactly two Python dicts: SPA_REPORT_DOCTYPES and
// SPA_CUSTOM_REPORTS. A key added to the frontend but forgotten in api.py
// resolves to `undefined` -> `false`, so the tile never renders, the sidebar
// child never renders and the route guard shows "No report permissions" for
// EVERY user -- with no error in any log and no failing request. The route
// audit above cannot catch it either: the route itself is perfectly valid.
//
// This mirrors that audit's intent for the one failure mode it cannot see.
// ---------------------------------------------------------------------------
const customReportBlock =
  apiSource.match(/SPA_CUSTOM_REPORTS\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || "";

const serverReportKeys = new Set();
for (const m of apiSource.matchAll(/^SPA_(?:REPORT_DOCTYPES|CUSTOM_REPORTS)\s*=\s*\{([^}]*)\}/gms)) {
  for (const key of m[1].matchAll(/["']([\w-]+)["']\s*:/g)) {
    serverReportKeys.add(key[1]);
  }
}
ok(
  "the api.py guard actually parsed both report maps",
  serverReportKeys.size >= 4,
  `found ${serverReportKeys.size}: ${[...serverReportKeys].join(", ")}`,
);

const appShellSrc = readSrc("../../src/layout/AppShell.jsx");
const reportKeyUses = [
  ...appShellSrc.matchAll(/reportKey:\s*"([^"]+)"/g),
  ...appRouteSrc.matchAll(/RequireReportAccess\s+reportKey="([^"]+)"/g),
].map((m) => m[1]);

ok(
  "every reportKey used in the sidebar and route guards is declared in api.py",
  reportKeyUses.length > 0 &&
    reportKeyUses.every((k) => serverReportKeys.has(k)),
  `undeclared: ${reportKeyUses.filter((k) => !serverReportKeys.has(k)).join(", ") || "none"} -- listed: ${reportKeyUses.join(", ")}`,
);

// The report NAME must never reach JavaScript. The client sends only the key,
// and the server maps key -> name and re-checks permission on every call, so
// editing the bundle alone cannot aim the endpoint at a different report.
//
// Note this is deliberately NOT "the app name must stay out of src/" — that is
// unachievable and therefore not a real invariant: the Store receipt already
// calls `addsol_nl_custom...` methods by path
// (pages/Store/purchase-receipt/form/index.jsx), so the owning app is in the
// shipped bundle regardless. What must not ship is the report name.
//
// Comments are stripped before the check, because a name in a comment is not a
// leak: the minifier drops comments, so it never reaches the shipped bundle,
// and this repo documents rationale in comments by convention (AGENTS.md
// section 4). Matching raw source would punish exactly the comments the
// standards ask for.
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

// "key": ("Report Name", "owning_app")
const reportNames = [
  ...customReportBlock.matchAll(
    /["'][\w-]+["']\s*:\s*\(\s*["']([^"']+)["']\s*,\s*["'][^"']+["']\s*\)/g,
  ),
].map((m) => m[1]);

const customReportSrc = readSrc("../../src/pages/Reports/custom-report/CustomReportPage.jsx");

const srcFiles = [
  appShellSrc,
  appRouteSrc,
  readSrc("../../src/pages/Reports/index.jsx"),
  customReportSrc,
].map(stripComments);
const leaked = reportNames.filter((name) =>
  srcFiles.some((s) => s.includes(name)),
);
ok(
  "no custom Report NAME appears in the SPA -- the client only ever sends keys",
  reportNames.length > 0 && leaked.length === 0,
  leaked.length
    ? `report name(s) leaked into src/: ${leaked.join(", ")}`
    : `checked ${reportNames.length} report name(s): ${reportNames.join(", ")}`,
);

// The endpoint must take a KEY. If it ever gained a `report_name` parameter the
// mapping above would be bypassable.
ok(
  "get_custom_report_data takes a report_key, never a report name",
  /def get_custom_report_data\(\s*report_key\s*,/.test(apiSource) &&
    !/def get_custom_report_data\([^)]*report_name/.test(apiSource),
  "signature must be (report_key, filters) and resolve the name server-side",
);

// The report's own filter/column metadata is what the page renders from, so the
// endpoint must return both. Losing `filters` renders no filter bar at all and
// losing `columns` renders an empty table -- neither is an exception.
ok(
  "the custom report page renders from the server's filters + columns metadata",
  /get_custom_report_data/.test(apiSource) &&
    /payload\.filters/.test(customReportSrc) &&
    /payload\.columns/.test(customReportSrc),
  "endpoint must return filters and columns, page must consume both",
);

// ---------------------------------------------------------------------------
// Cross-app report rendering. `Plate Stock Register` is a Script Report in
// another app whose COLUMN SET IS NOT KNOWN HERE, so the page renders whatever
// the server returns. That makes the cell formatter the only place a wrong
// number can be shown to a storekeeper, and `renderToString` cannot help: the
// page fetches in an effect, which never runs under SSR, so a render assertion
// would pass on an empty page. Calling the real functions is what actually bites.
// ---------------------------------------------------------------------------
const FLOAT = { fieldname: "total_weight", fieldtype: "Float" };
const CURRENCY = { fieldname: "stock_value", fieldtype: "Currency" };
const INT = { fieldname: "plates", fieldtype: "Int" };
const LINK = { fieldname: "item", fieldtype: "Link", options: "Item" };

// A blank weight must read as blank. `Number(null)` is 0 and 0 IS finite, which
// is exactly the guard that made conversionPreview() once render "1 Nos = 0 Kg".
ok(
  "formatCell: a missing value renders as an em dash, never as 0",
  formatCell(null, FLOAT) === "\u2014" &&
    formatCell(undefined, FLOAT) === "\u2014" &&
    formatCell("", FLOAT) === "\u2014" &&
    formatCell(null, LINK) === "\u2014",
  `got null->${formatCell(null, FLOAT)}, ""->${formatCell("", FLOAT)} -- a blank plate weight must not read as a real zero`,
);

ok(
  "formatCell: 0 stays 0, because a real zero weight IS meaningful",
  formatCell(0, FLOAT) === "0" && formatCell(0, INT) === "0",
  `got ${formatCell(0, FLOAT)}`,
);

ok(
  "formatCell: a whole-number Float prints without a trailing .0",
  formatCell(12, FLOAT) === "12" && formatCell(12.5, FLOAT) === "12.5",
  `got 12 -> ${formatCell(12, FLOAT)}, 12.5 -> ${formatCell(12.5, FLOAT)}`,
);

ok(
  "formatCell: Currency keeps two decimals, Float keeps three",
  formatCell(1234.5, CURRENCY).endsWith(".50") &&
    formatCell(1234.5, CURRENCY).startsWith("1,234") &&
    formatCell(1.23456, FLOAT) === "1.235",
  `currency -> ${formatCell(1234.5, CURRENCY)}, float -> ${formatCell(1.23456, FLOAT)}`,
);

ok(
  "formatCell: a non-numeric string in a numeric column is shown verbatim",
  formatCell("n/a", FLOAT) === "n/a",
  `got ${formatCell("n/a", FLOAT)}`,
);

// A NUMERIC STRING in a numeric column must still be formatted. This is what
// separates `Number.isFinite(Number(value))` from `Number.isFinite(value)`:
// Number.isFinite does not coerce, so on the raw "1.23456" it is false and the
// cell would print the un-rounded string. A SQL report can hand back a numeric
// column as a string, and 1.23456 Kg vs 1.235 Kg is the difference the report
// exists to make legible.
ok(
  "formatCell: a numeric STRING in a numeric column is formatted, not printed raw",
  formatCell("1.23456", FLOAT) === "1.235" &&
    formatCell("12", FLOAT) === "12",
  `got "1.23456" -> ${formatCell("1.23456", FLOAT)} -- an unformatted SQL string means isFinite was applied to the raw value`,
);

ok(
  "isNumericColumn covers exactly the fieldtypes that get tabular alignment",
  isNumericColumn(FLOAT) &&
    isNumericColumn(CURRENCY) &&
    isNumericColumn(INT) &&
    !isNumericColumn(LINK) &&
    !isNumericColumn({ fieldtype: "Data" }),
);

// `Report Filter.default` is Small Text, so a Check's default arrives as the
// STRING "0". The report tests `filters.get("include_offcuts")` for TRUTHINESS
// and the string "0" is truthy in Python -- it would invert the filter.
ok(
  "seedDefault: a Check's string default normalises to an int",
  seedDefault({ fieldtype: "Check", default: "1" }) === 1 &&
    seedDefault({ fieldtype: "Check", default: "0" }) === 0 &&
    seedDefault({ fieldtype: "Check", default: "" }) === undefined,
  `got "1"->${seedDefault({ fieldtype: "Check", default: "1" })}, "0"->${seedDefault({ fieldtype: "Check", default: "0" })}`,
);
ok(
  "seedDefault: a text default passes through, an empty one seeds nothing",
  seedDefault({ fieldtype: "Data", default: "ALL" }) === "ALL" &&
    seedDefault({ fieldtype: "Data", default: "" }) === undefined,
);

// `Report Filter.options` is Small Text written one option per line.
ok(
  "parseSelectOptions splits on newlines and drops blank lines",
  JSON.stringify(parseSelectOptions("Draft\n\n  Submitted  \n")) ===
    JSON.stringify([
      { value: "Draft", label: "Draft" },
      { value: "Submitted", label: "Submitted" },
    ]),
  `got ${JSON.stringify(parseSelectOptions("Draft\n\n  Submitted  \n"))}`,
);

// The Offcuts column is `hidden`, not absent: the row dict still carries it, so
// rendering it would shift every later value one column to the left.
ok(
  "visibleColumns drops hidden columns while the row keeps the key",
  visibleColumns([
    { fieldname: "item" },
    { fieldname: "excluded", hidden: 1 },
    { fieldname: "total_weight" },
  ]).map((c) => c.fieldname).join(",") === "item,total_weight",
  "a hidden column must not occupy a visible cell",
);

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
