//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region src/lib/docTransition.js
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
var LEAVE_SUBMITTABLE_STATUSES = ["Approved", "Rejected"];
/**
* Doctypes whose `on_submit` refuses to run unless a status column already
* carries the outcome.
*
* Kept as data rather than an `if` per caller, because two independent screens
* decide what to offer -- the request form and the Approvals preview -- and when
* they disagree one of them shows a button that can only fail. `field` is the
* column HRMS/ERPNext actually reads; `allowed` is what it accepts.
*/
var DOCTYPE_SUBMIT_GATES = { "Leave Application": {
	field: "status",
	allowed: LEAVE_SUBMITTABLE_STATUSES
} };
/**
* May this stored document be submitted right now?
*
* The single source of truth for doctype-level preconditions beyond Frappe's own
* rules. Returns true for doctypes with no gate, so it never narrows anything
* else. Reads the status off the passed document, which is why callers must
* hand over the SERVER's copy -- a form's unsaved state would answer a different
* question than the one the server asks.
*/
function canSubmitDocument({ doctype, doc } = {}) {
	const gate = DOCTYPE_SUBMIT_GATES[doctype];
	if (!gate) return true;
	return gate.allowed.includes(doc?.[gate.field]);
}
function resolveForwardActions({ isEdit, isSubmitted = false, isDirty = false, hasWorkflow = false, workflowChecked = false, transitionCount = 0, canSubmit = true } = {}) {
	return {
		showSave: !isSubmitted,
		showTransitions: Boolean(isEdit) && !isSubmitted && !isDirty && transitionCount > 0,
		showSubmit: Boolean(isEdit) && !isSubmitted && !isDirty && workflowChecked && !hasWorkflow && canSubmit
	};
}
//#endregion
//#region src/lib/leaveApproval.js
/**
* Is the signed-in user the approver this document was addressed to?
*
* `leave_approver` is a User link, so this is an exact id comparison. Kept
* deliberately narrow: showing the buttons to everyone with write access would
* let an employee approve their own leave through the UI. A blank approver
* (no approver configured for the employee) means nobody can approve here, which
* is the correct dead end -- Save still works and the server still validates.
*/
function canActAsLeaveApprover({ currentUser, leaveApprover } = {}) {
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
function resolveLeaveApprovalActions({ isEdit, isSubmitted = false, isDirty = false, hasWorkflow = false, workflowChecked = false, currentUser, leaveApprover } = {}) {
	const eligible = Boolean(isEdit) && !isSubmitted && !isDirty && workflowChecked && !hasWorkflow && canActAsLeaveApprover({
		currentUser,
		leaveApprover
	});
	return {
		showApprove: eligible,
		showReject: eligible
	};
}
/**
* The `txt` to send for the current contents of a Link field's search box.
*
* Text too short to be a search term maps to the empty string, which
* search_link answers with the Link field's default option list. Sending the
* partial text instead is what left the dropdown empty after backspacing out
* of a search.
*
* Kept in its own module (rather than exported from the component) so the
* decision is testable and so the component file only exports components.
*/
function linkSearchTerm(txt, minChars = 2) {
	const term = (txt || "").trim();
	return term.length >= minChars ? term : "";
}
//#endregion
//#region .smoke-tmp/linkfield-cases.mjs
var linkfield_cases_exports = /* @__PURE__ */ __exportAll({
	lf_customThreshold: () => lf_customThreshold,
	lf_emptyMapsToDefault: () => lf_emptyMapsToDefault,
	lf_neverEmptiesOptions: () => lf_neverEmptiesOptions,
	lf_oneCharMapsToDefault: () => lf_oneCharMapsToDefault,
	lf_twoCharsSearches: () => lf_twoCharsSearches,
	lf_undefinedSafe: () => lf_undefinedSafe,
	lf_whitespaceTrimmed: () => lf_whitespaceTrimmed
});
var lf_emptyMapsToDefault = {
	name: "empty box -> default list",
	actual: (f) => f(""),
	expected: ""
};
var lf_oneCharMapsToDefault = {
	name: "one char -> default list",
	actual: (f) => f("a"),
	expected: ""
};
var lf_twoCharsSearches = {
	name: "two chars -> searched",
	actual: (f) => f("ab"),
	expected: "ab"
};
var lf_whitespaceTrimmed = {
	name: "whitespace-only -> default list, padded term trimmed",
	actual: (f) => [f("  "), f("  ab  ")],
	expected: ["", "ab"]
};
var lf_undefinedSafe = {
	name: "null/undefined are safe",
	actual: (f) => [
		f(null),
		f(void 0),
		f()
	],
	expected: [
		"",
		"",
		""
	]
};
var lf_neverEmptiesOptions = {
	name: "backspacing through a value never asks search_link for unusable text",
	actual: (f) => {
		const start = "HR-EMP-00002";
		for (let i = 12; i >= 0; i--) {
			const term = f(start.slice(0, i));
			if (term !== "" && term.length < 2) return `sent unusable term ${JSON.stringify(term)}`;
		}
		return f("") === "" ? "" : "cleared box did not map to the default list";
	},
	expected: ""
};
var lf_customThreshold = {
	name: "threshold is configurable (MIN_SEARCH_CHARS contract)",
	actual: (f) => f("ab", 2) + "|" + f("ab", 5),
	expected: "ab|"
};
//#endregion
//#region .smoke-tmp/rules.jsx
var pass = 0, fail = 0;
var ok = (n, c, got) => c ? pass++ : (fail++, console.log("  FAIL:", n, "got:", JSON.stringify(got)));
var base = {
	isEdit: true,
	isSubmitted: false,
	isDirty: false,
	hasWorkflow: false,
	workflowChecked: true,
	transitionCount: 0
};
var R = (o) => resolveForwardActions({
	...base,
	...o
});
var r = R({ isEdit: false });
ok("new form: no Submit", !r.showSubmit);
ok("new form: no transitions", !r.showTransitions);
ok("new form: Save offered", r.showSave);
r = R({
	isEdit: false,
	hasWorkflow: true
});
ok("new+workflow: no Submit", !r.showSubmit);
ok("new+workflow: Save offered", r.showSave);
r = R({});
ok("saved draft, no workflow: Submit", r.showSubmit);
ok("saved draft, no workflow: no transitions", !r.showTransitions);
r = R({
	hasWorkflow: true,
	transitionCount: 0
});
ok("workflow, no open transition: NO Submit", !r.showSubmit);
r = R({
	hasWorkflow: true,
	transitionCount: 2
});
ok("workflow w/ transitions: transitions shown", r.showTransitions);
ok("workflow w/ transitions: NO Submit", !r.showSubmit);
r = R({ workflowChecked: false });
ok("probe pending: no Submit flash", !r.showSubmit);
r = R({
	workflowChecked: false,
	hasWorkflow: true,
	transitionCount: 1
});
ok("probe pending: transitions still shown", r.showTransitions);
r = R({ isDirty: true });
ok("dirty: no Submit", !r.showSubmit);
ok("dirty: no transitions", !r.showTransitions);
ok("dirty: Save offered", r.showSave);
r = R({ isSubmitted: true });
ok("submitted: nothing offered", !r.showSave && !r.showSubmit && !r.showTransitions);
ok("no args safe", resolveForwardActions().showSave === true);
ok("undefined isEdit safe", resolveForwardActions({ isEdit: void 0 }).showSubmit === false);
for (const c of Object.values(linkfield_cases_exports)) {
	const got = c.actual(linkSearchTerm);
	ok(c.name, JSON.stringify(got) === JSON.stringify(c.expected), got);
}
var base2 = {
	isEdit: true,
	isSubmitted: false,
	isDirty: false,
	hasWorkflow: false,
	workflowChecked: true,
	transitionCount: 0
};
var R2 = (o) => resolveForwardActions({
	...base2,
	...o
});
var canSubmitLeave = (status) => LEAVE_SUBMITTABLE_STATUSES.includes(status);
ok("leave: Open -> no Submit (HRMS on_submit guard)", !R2({ canSubmit: canSubmitLeave("Open") }).showSubmit);
ok("leave: Approved -> Submit offered", R2({ canSubmit: canSubmitLeave("Approved") }).showSubmit);
ok("leave: Rejected -> Submit offered", R2({ canSubmit: canSubmitLeave("Rejected") }).showSubmit);
ok("leave: Cancelled -> no Submit", !R2({ canSubmit: canSubmitLeave("Cancelled") }).showSubmit);
ok("leave: missing status -> no Submit", !R2({ canSubmit: canSubmitLeave(void 0) }).showSubmit);
ok("leave: gate is status-only, never widens", R2({ canSubmit: canSubmitLeave("Open") }).showSave);
ok("leave: gate keeps transitions off a no-workflow doctype", !R2({ canSubmit: false }).showTransitions);
ok("leave+workflow: transitions unaffected by a blocking status", R2({
	hasWorkflow: true,
	transitionCount: 1,
	canSubmit: false
}).showTransitions);
ok("leave+workflow: still no plain Submit", !R2({
	hasWorkflow: true,
	transitionCount: 1,
	canSubmit: false
}).showSubmit);
ok("leave+workflow: approved status does not resurrect Submit", !R2({
	hasWorkflow: true,
	transitionCount: 1,
	canSubmit: true
}).showSubmit);
ok("default canSubmit keeps the plain path open", R2({}).showSubmit);
ok("default canSubmit cannot be widened by omitting other flags", !R2({ isEdit: false }).showSubmit);
ok("status list matches HRMS exactly", JSON.stringify(LEAVE_SUBMITTABLE_STATUSES) === JSON.stringify(["Approved", "Rejected"]));
var A3 = (o) => resolveLeaveApprovalActions({
	isEdit: true,
	isSubmitted: false,
	isDirty: false,
	hasWorkflow: false,
	workflowChecked: true,
	currentUser: "manager@erp.test",
	leaveApprover: "manager@erp.test",
	...o
});
ok("approver: exact user match", canActAsLeaveApprover({
	currentUser: "a@x",
	leaveApprover: "a@x"
}));
ok("approver: different user refused", !canActAsLeaveApprover({
	currentUser: "a@x",
	leaveApprover: "b@x"
}));
ok("approver: blank approver refuses everyone", !canActAsLeaveApprover({
	currentUser: "a@x",
	leaveApprover: ""
}));
ok("approver: blank user refuses", !canActAsLeaveApprover({
	currentUser: "",
	leaveApprover: "a@x"
}));
ok("approver: both blank refuses", !canActAsLeaveApprover({}));
ok("approval: approver sees approve+reject", A3({}).showApprove && A3({}).showReject);
ok("approval: non-approver sees neither", !A3({ currentUser: "someone@erp.test" }).showApprove && !A3({ currentUser: "someone@erp.test" }).showReject);
ok("approval: cannot self-approve without being the approver", !A3({ currentUser: "hr-emp@erp.test" }).showApprove);
ok("approval: hidden on new form", !A3({ isEdit: false }).showApprove);
ok("approval: hidden while dirty", !A3({ isDirty: true }).showApprove && !A3({ isDirty: true }).showReject);
ok("approval: hidden after submit", !A3({ isSubmitted: true }).showApprove);
ok("approval: hidden before the workflow probe resolves", !A3({ workflowChecked: false }).showApprove);
ok("approval: workflow owns the status change instead", !A3({
	hasWorkflow: true,
	transitionCount: 1
}).showApprove && !A3({
	hasWorkflow: true,
	transitionCount: 1
}).showReject);
ok("approval: available on the Open leave where Submit is withheld", A3({}).showApprove && !resolveForwardActions({
	...base2,
	canSubmit: LEAVE_SUBMITTABLE_STATUSES.includes("Open")
}).showSubmit);
ok("approval: does not itself unlock Submit", !resolveForwardActions({
	...base2,
	canSubmit: false
}).showSubmit);
var gate = (doctype, doc) => canSubmitDocument({
	doctype,
	doc
});
ok("gate: Leave Open refused", !gate("Leave Application", { status: "Open" }));
ok("gate: Leave Approved allowed", gate("Leave Application", { status: "Approved" }));
ok("gate: Leave Rejected allowed", gate("Leave Application", { status: "Rejected" }));
ok("gate: Leave Cancelled refused", !gate("Leave Application", { status: "Cancelled" }));
ok("gate: Leave with no status refused", !gate("Leave Application", {}));
ok("gate: Leave with null doc refused", !gate("Leave Application", null));
ok("gate: case-sensitive like HRMS", !gate("Leave Application", { status: "approved" }));
ok("gate: Expense Claim ungated", gate("Expense Claim", { approval_status: "Open" }));
ok("gate: Purchase Order ungated", gate("Purchase Order", { status: "Draft" }));
ok("gate: unknown doctype ungated", gate("Widget", {}));
var previewActions = (doctype, doc) => [
	"submit",
	"save",
	"delete"
].filter((a) => a !== "submit" || canSubmitDocument({
	doctype,
	doc
}));
ok("preview: Open leave offers no Submit", !previewActions("Leave Application", { status: "Open" }).includes("submit"));
ok("preview: Open leave still offers Save and Delete", ["save", "delete"].every((a) => previewActions("Leave Application", { status: "Open" }).includes(a)));
ok("preview: Approved leave offers Submit", previewActions("Leave Application", { status: "Approved" }).includes("submit"));
ok("preview: expense claim keeps Submit", previewActions("Expense Claim", { approval_status: "Open" }).includes("submit"));
for (const st of [
	"Open",
	"Approved",
	"Rejected",
	"Cancelled"
]) {
	const formShows = resolveForwardActions({
		...base2,
		canSubmit: gate("Leave Application", { status: st })
	}).showSubmit;
	ok(`agreement: ${st} leave -> form and preview both ${formShows ? "offer" : "withhold"} Submit`, formShows === previewActions("Leave Application", { status: st }).includes("submit"));
}
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
//#endregion
export {};
