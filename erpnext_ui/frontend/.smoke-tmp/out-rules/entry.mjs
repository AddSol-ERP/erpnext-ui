import { existsSync, readFileSync, readdirSync } from "node:fs";
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
/**
* Which document-lifecycle actions to render, straight from `docstatus`.
*
* Frappe's own state machine (frappe/model/document.py, `docstatus`):
*
*   0 Draft     -> fully editable, can be deleted, no ledger effect
*   1 Submitted -> read-only (except "Allow on Submit"), CANNOT be deleted;
*                  Frappe refuses with "Submitted Record cannot be deleted.
*                  You must Cancel it first", so offering Delete here only
*                  produces a button that is guaranteed to fail
*   2 Cancelled -> read-only, reverses ledger entries, deletable
*
* `isEdit` distinguishes a stored document from a new form. A new form has no
* document at all, so `docstatus` is `undefined` -- reading it directly would
* yield `NaN` and silently hide every draft-only action, stranding the user on
* a form with no way out. It is therefore treated as a draft for navigation
* (Back applies) but as having nothing to delete or cancel.
*/
function resolveDocstatusActions({ isEdit, docstatus, hasWorkflow = false } = {}) {
	const ds = Number(docstatus) || 0;
	return {
		docstatus: ds,
		showBack: !isEdit || ds === 0,
		showCancel: Boolean(isEdit) && ds === 1 && !hasWorkflow,
		showDelete: Boolean(isEdit) && (ds === 0 || ds === 2)
	};
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
//#endregion
//#region src/lib/profileFlags.js
/**
* ESS profile: which optional-feature state, if any, the profile page should
* surface.
*
* Kept as pure functions so the rules suite can cover them without rendering
* the page. `Profile` fetches its data with an async `get(...)`, so it cannot be
* smoke-rendered the way `GenericForm` is.
*/
/**
* Does this Employee record carry an HR-approval gate?
*
* The gate is Frappe's own `workflow_state`, which only exists once an Employee
* Workflow has been configured (`erpnext_ui/setup/workflows.py` seeds one). That
* makes the *presence* of the key a reliable per-customer capability signal:
*
*   - key absent        -> this site has no Employee Workflow; show nothing.
*   - key null          -> record predates the workflow and has never been
*                          re-saved, so it never went through approval either.
*                          Warning it would be noise, so also show nothing.
*   - "Pending HR Approval" / "Rejected" -> genuinely not approved yet.
*   - "Approved"        -> approved; nothing to say.
*
* This deliberately does NOT read a customer-added field such as a
* `custom_hr_approved` Check. Those can sit at permlevel > 0, in which case
* Frappe's REST layer omits them for non-privileged users and the gate would
* silently vanish for exactly the employees it targets. `workflow_state` is
* first-party and always at permlevel 0.
*
* The failure this replaces: `!profile.workflow_state` cannot tell "pending"
* from "no such field", because `!undefined` is `true` -- which showed the
* warning to every employee at every customer, including those that never
* configured an approval workflow at all.
*/
function resolveHrApprovalGate(profile) {
	const state = profile?.workflow_state;
	const hasGate = state !== void 0 && state !== null;
	return {
		hasGate,
		state: hasGate ? state : null,
		showWarning: hasGate && state !== "Approved"
	};
}
//#endregion
//#region src/config/storePurposes.js
/**
* Store module vocabulary — the ONE place that maps what a person wants to do
* onto what ERPNext stores.
*
* Why this file exists
* --------------------
* The Store UI used to name things in ERPNext's vocabulary ("Material Request",
* "Type", "Stock Entry", "Entry Type") and each page hardcoded its own doctype
* strings. That produced three concrete failures:
*
*   1. The Material Request hub offered `material_request_type: "Transfer"` and
*      `"Material Receipt"`. Neither is a valid ERPNext v15 option, so
*      Frappe's `_validate_selects` rejected every save with HTTP 417.
*   2. The same concept was called "Material Transfer" on one screen and
*      "Transfer" on another, because the raw enum and the display label were
*      kept in two parallel i18n namespaces (`store.types.*` and
*      `store.entryTypes.*`) that had drifted apart.
*   3. "Material Issue"/"Material Transfer"/"Material Receipt" are used as the
*      name for BOTH a Material Request type and a Stock Entry purpose. They
*      read as the same thing but are opposite directions on different
*      documents — which is precisely why people could not tell which one to
*      pick.
*
* The rule this file enforces: a person picks a *purpose*, never a doctype.
* Everything downstream reads its doctype and field value from here.
*
* Nothing in this file may import React, i18n or the api layer. It is pure data
* so it can be asserted against in `.smoke-tmp/rules.jsx` without a DOM.
*/
var MATERIAL_REQUEST_TYPES = [
	"Purchase",
	"Material Transfer",
	"Material Issue",
	"Manufacture",
	"Customer Provided"
];
/**
* User-facing purposes that create a Material Request.
*
* `i18nKey` resolves under the `store.purposes.*` namespace.
*/
var REQUEST_PURPOSES = {
	indent: {
		i18nKey: "indent",
		doctype: "Material Request",
		materialRequestType: "Material Issue",
		fulfillableByStore: true,
		icon: "ClipboardList"
	},
	purchase: {
		i18nKey: "purchase",
		doctype: "Material Request",
		materialRequestType: "Purchase",
		fulfillableByStore: false,
		icon: "ShoppingCart"
	},
	transfer: {
		i18nKey: "transfer",
		doctype: "Material Request",
		materialRequestType: "Material Transfer",
		fulfillableByStore: true,
		icon: "ArrowLeftRight"
	},
	production: {
		i18nKey: "production",
		doctype: "Material Request",
		materialRequestType: "Manufacture",
		fulfillableByStore: false,
		icon: "Factory"
	},
	customerProvided: {
		i18nKey: "customerProvided",
		doctype: "Material Request",
		materialRequestType: "Customer Provided",
		fulfillableByStore: true,
		icon: "UserCheck"
	}
};
/** Purpose keys, in the order a new user should see them. */
var REQUEST_PURPOSE_KEYS = [
	"indent",
	"purchase",
	"transfer",
	"production",
	"customerProvided"
];
var STOCK_ENTRY_PURPOSES = {
	issue: {
		i18nKey: "issue",
		stockEntryType: "Material Issue",
		purpose: "Material Issue",
		group: "everyday",
		showFromWarehouse: true,
		showToWarehouse: false,
		requiresWorkOrder: false
	},
	receipt: {
		i18nKey: "receipt",
		stockEntryType: "Material Receipt",
		purpose: "Material Receipt",
		group: "everyday",
		showFromWarehouse: false,
		showToWarehouse: true,
		requiresWorkOrder: false
	},
	transfer: {
		i18nKey: "transfer",
		stockEntryType: "Material Transfer",
		purpose: "Material Transfer",
		group: "everyday",
		showFromWarehouse: true,
		showToWarehouse: true,
		requiresWorkOrder: false
	},
	transferForManufacture: {
		i18nKey: "transferForManufacture",
		stockEntryType: "Material Transfer for Manufacture",
		purpose: "Material Transfer for Manufacture",
		group: "manufacturing",
		showFromWarehouse: true,
		showToWarehouse: true,
		requiresWorkOrder: true
	},
	consumption: {
		i18nKey: "consumption",
		stockEntryType: "Material Consumption for Manufacture",
		purpose: "Material Consumption for Manufacture",
		group: "manufacturing",
		showFromWarehouse: true,
		showToWarehouse: false,
		requiresWorkOrder: true
	},
	manufacture: {
		i18nKey: "manufacture",
		stockEntryType: "Manufacture",
		purpose: "Manufacture",
		group: "manufacturing",
		showFromWarehouse: true,
		showToWarehouse: true,
		perRowWarehouses: true,
		requiresWorkOrder: true
	},
	repack: {
		i18nKey: "repack",
		stockEntryType: "Repack",
		purpose: "Repack",
		group: "correction",
		showFromWarehouse: true,
		showToWarehouse: true,
		perRowWarehouses: true,
		requiresWorkOrder: false
	},
	disassemble: {
		i18nKey: "disassemble",
		stockEntryType: "Disassemble",
		purpose: "Disassemble",
		group: "correction",
		showFromWarehouse: true,
		showToWarehouse: true,
		perRowWarehouses: true,
		requiresWorkOrder: true
	},
	subcontractor: {
		i18nKey: "subcontractor",
		stockEntryType: "Send to Subcontractor",
		purpose: "Send to Subcontractor",
		group: "correction",
		showFromWarehouse: true,
		showToWarehouse: true,
		requiresWorkOrder: false
	}
};
/** Display groups for the Stock Movements page, in order. */
var STOCK_MOVEMENT_GROUPS = [
	"everyday",
	"manufacturing",
	"correction"
];
/**
* Build a `resource/Stock Entry` payload from a purpose's config.
*
* `items` rows must already carry s_warehouse/t_warehouse where the purpose
* needs them per row -- the header from/to are only a backstop. ERPNext's
* `validate_warehouse` only copies the header down when a row has neither side
* set (stock_entry.py:855-858), so a row that set one side keeps it.
*
* `purpose` is deliberately NOT emitted: it is hidden, read-only, and derived.
*/
function buildStockEntryPayload(purposeKey, { items, fromWarehouse, toWarehouse, ...rest }) {
	const cfg = STOCK_ENTRY_PURPOSES[purposeKey];
	if (!cfg) throw new Error(`Unknown stock movement purpose: ${purposeKey}`);
	const payload = {
		doctype: "Stock Entry",
		stock_entry_type: cfg.stockEntryType,
		items: items.map((row) => ({ ...row })),
		...rest
	};
	if (cfg.showFromWarehouse && fromWarehouse) payload.from_warehouse = fromWarehouse;
	if (cfg.showToWarehouse && toWarehouse) payload.to_warehouse = toWarehouse;
	return payload;
}
/** Look up a Material Request purpose by its ERPNext `material_request_type`. */
/**
* Reverse lookup: ERPNext Stock Entry type string -> its purpose key.
*
* The UI stores the raw type (that is what `stock_entry_type` links to), but
* every rule about that type is expressed on the key. One function here means a
* tenth purpose is added in exactly one place; the alternative is the
* `if (type === "Material Issue")` chain this replaced, which fell through to
* a both-warehouses default for anything it did not list.
*/
function stockPurposeForType(stockEntryType) {
	return Object.keys(STOCK_ENTRY_PURPOSES).find((k) => STOCK_ENTRY_PURPOSES[k].stockEntryType === stockEntryType) || "";
}
function requestPurposeForType(materialRequestType) {
	return Object.entries(REQUEST_PURPOSES).find(([, cfg]) => cfg.materialRequestType === materialRequestType)?.[0] || null;
}
/**
* Material Request types the store keeper is able to fulfil.
*
* Mirrors ERPNext's own gate in `make_stock_entry`
* (material_request.py:816-822), which only accepts Material Transfer, Material
* Issue and Customer Provided. If this list ever drifts from that, the symptom
* is a mapped Stock Entry that fails to save -- so it is asserted in
* `.smoke-tmp/rules.jsx`.
*/
var STORE_FULFILLABLE_TYPES = MATERIAL_REQUEST_TYPES.filter((type) => REQUEST_PURPOSES[requestPurposeForType(type)]?.fulfillableByStore);
//#endregion
//#region src/lib/receiptConversion.js
/**
* Purchase Receipt line arithmetic.
*
* Everything here is pure so it can be asserted directly in the rules suite
* without mounting a form. The behaviour is not ours to choose, though -- it is
* forced by ERPNext, and the four rules below are the whole reason this module
* exists. All citations are v15 source.
*
* ---------------------------------------------------------------------------
* WHY THE FACTOR IS COMPUTED AND NEVER FETCHED
* ---------------------------------------------------------------------------
* `conversion_factor` converts transaction-UOM -> stock-UOM, so
* `stock_qty = qty * conversion_factor` (buying_controller.py:517). For a
* weighed receipt the honest factor is a *measurement*, not a master-data
* constant: 10 plates that came in at 25.4 Kg are 2.54 Kg each, and the next
* delivery will not weigh the same. Reading it from UOM Conversion Detail
* (which is what `get_conversion_factor` does) books the nominal figure and
* silently mis-states stock on every weighed receipt.
*
* So: the factor is always `total / qty`, computed as the user types, and it is
* never offered as an input. Four rules make that legal:
*
*   1. `uom` is compared against the PO line
*      (purchase_receipt.py:315) -- so on a PO receipt the received UOM is
*      pinned, but it is NOT compared to anything else.
*   2. `conversion_factor` is not in `compare_fields` at all, so it is never
*      compared to the PO (transaction_base.py:125-127 iterates compare_fields
*      only). Note this is true for every case, not just is_return.
*   3. `stock_qty` must be a whole number when the STOCK UOM is flagged
*      `must_be_whole_number` (purchase_receipt.py:278 --
*      `validate_uom_is_integer("stock_uom", "stock_qty")`). Note this checks
*      stock_qty against the STOCK uom, which is a different pair from the
*      transaction qty against the transaction uom.
*   4. If `uom == stock_uom`, ERPNext force-resets the factor to 1.0
*      (stock_controller.py:110-116). This is exactly why a total is only
*      offered when the two differ -- otherwise it could never be used.
*
* A client-supplied non-zero factor is respected: `set_missing_values` only
* fills it when it is zero (buying_controller.py:362), and it is excluded from
* float rounding (:361), so 2.54 stays 2.54.
*
* Side benefit worth knowing: valuation needs no extra work.
* `stock_uom_rate = rate / conversion_factor` (stock_controller.py:1225), so a
* rate of 500/Nos at factor 2.54 becomes 196.85/Kg and 25.4 Kg values back to
* the same total.
*/
/**
* Conversion factor from a measured total. Returns null when it cannot be
* derived -- deliberately not 1, because a silent 1 would book qty instead of
* the measured weight and look like a successful save.
*
* @param {number|string} qty     quantity in the received (transaction) UOM
* @param {number|string} total   measured total in the stock UOM
* @returns {number|null}
*/
function computeFactor(qty, total) {
	if (total === "" || total === null || total === void 0) return null;
	if (typeof total === "string" && total.trim() === "") return null;
	const q = Number(qty);
	const t = Number(total);
	if (!Number.isFinite(q) || q === 0 || !Number.isFinite(t)) return null;
	return t / q;
}
/**
* Whether this line needs a measured total at all.
*
* Two conditions, both necessary:
*
* 1. The received UOM must differ from the stock UOM. That is exactly when a
*    factor other than 1 survives ERPNext's force-reset (rule 4 above); when
*    they match, asking for a total would be theatre.
* 2. The STOCK UOM must not be flagged `must_be_whole_number`.
*
* The second one is a correctness guard, not a nicety, and it was found by
* checking against live data. Take W-0268-01-001: stock_uom `Nos`, also
* `Kg`. Set the received UOM to `Kg` and condition 1 alone would offer a
* "Total received (Nos)" field -- and a user entering 10 Kg against a total of
* 25 gets factor 2.5, so ERPNext books **25 Nos of stock from a 10 Kg
* delivery**. It saves cleanly and the quantity is silently wrong.
*
* A weight simply cannot be stock when the stock UOM counts whole pieces, so
* there is no coherent meaning for the field on such an item and it is not
* offered. Weighed items must be stocked in a weight UOM -- which is item-master
* configuration, and out of scope for this screen to change.
*/
function needsMeasuredTotal(info, receivedUom) {
	if (!info || !info.stock_uom || !receivedUom) return false;
	if (info.stock_uom === receivedUom) return false;
	const stockUomRow = (info.uoms || []).find((u) => u.uom === info.stock_uom);
	return !(stockUomRow && stockUomRow.must_be_whole_number);
}
/**
* The two whole-number rules ERPNext will enforce, which are NOT the same check:
*
*   - `mustWholeQty`   -- transaction qty against the RECEIVED uom
*                         (a half-plate is not a plate)
*   - `mustWholeStock` -- stock_qty against the STOCK uom
*                         (purchase_receipt.py:278)
*
* `info` is the get_item_uom_options payload: { stock_uom, uoms: [...] }.
*/
function wholeNumberRules(info, receivedUom) {
	const uoms = info && info.uoms || [];
	const find = (uom) => uoms.find((x) => x.uom === uom);
	return {
		mustWholeQty: Boolean(find(receivedUom)?.must_be_whole_number),
		mustWholeStock: Boolean(find(info?.stock_uom)?.must_be_whole_number)
	};
}
/**
* Apply a measured total to a row, returning the fields ERPNext will use.
*
* `stock_qty` is set to the measured total directly rather than to
* `qty * factor`: the multiplication is algebraically identical but reintroduces
* float noise (25.4/10*10 === 25.400000000000002), and this value is what the
* user reads back on screen. ERPNext re-derives it server-side regardless.
*
* When the factor cannot be derived, the row is left with an empty factor and
* an empty stock_qty so the caller can block the save with a real message
* instead of posting a wrong number.
*/
/**
* Where a row's conversion factor came from.
*
* A MAGNITUDE TEST IS NOT ENOUGH to decide whether the factor is trustworthy:
* `1 Nos = 1 Kg` is a legitimate rate for a light item, so "is it 1?" cannot
* mean "is it missing?". The source has to be recorded alongside the number.
*
* `purchase_order` is the case that matters. ERPNext's `make_purchase_receipt`
* already returns the PO line's factor, and `validate_with_previous_doc` never
* compares `conversion_factor` -- so it is free for us to set, and correct as
* ordered. It was being thrown away (the row was built with a hardcoded 1),
* which forced the measured weight to become mandatory and blocked any
* delivery that could not be weighed.
*/
var CONVERSION_SOURCE = {
	PURCHASE_ORDER: "purchase_order",
	MEASURED: "measured",
	DEFAULT: "default"
};
/** True when the row carries a factor we are willing to book. */
function hasUsableFactor(row) {
	return row?.conversion_source === CONVERSION_SOURCE.PURCHASE_ORDER || row?.conversion_source === CONVERSION_SOURCE.MEASURED;
}
/**
* Apply a conversion to a row, deriving stock_qty from the factor every time.
*
* `stock_qty = qty * conversion_factor` unconditionally, so the row can never
* hold a stock quantity that disagrees with its own factor -- the state the form
* used to ship, carrying the PO's 10,000 Kg alongside a factor of 1.
*/
function applyMeasuredTotal(row, total, fallback = null) {
	if (!needsMeasuredTotal(row, row?.uom)) {
		const q = Number(row?.qty);
		return {
			...row,
			measured_total: "",
			conversion_factor: 1,
			conversion_source: CONVERSION_SOURCE.DEFAULT,
			stock_qty: Number.isFinite(q) ? q : ""
		};
	}
	const qty = Number(row?.qty);
	const t = Number(total);
	if (total !== "" && total !== null && total !== void 0 && Number.isFinite(t) && t > 0) {
		const factor = computeFactor(row.qty, total);
		if (factor !== null) return {
			...row,
			measured_total: t,
			conversion_factor: factor,
			conversion_source: CONVERSION_SOURCE.MEASURED,
			stock_qty: t
		};
	}
	const fallbackFactor = Number(fallback?.conversion_factor);
	if (Number.isFinite(fallbackFactor) && fallbackFactor > 0) return {
		...row,
		measured_total: "",
		conversion_factor: fallbackFactor,
		conversion_source: fallback.conversion_source || CONVERSION_SOURCE.PURCHASE_ORDER,
		stock_qty: Number.isFinite(qty) ? qty * fallbackFactor : ""
	};
	return {
		...row,
		measured_total: "",
		conversion_factor: 1,
		conversion_source: CONVERSION_SOURCE.DEFAULT,
		stock_qty: Number.isFinite(qty) ? qty : ""
	};
}
/**
* Recompute stock_qty after a quantity edit that did NOT involve a weight.
*
* Without this, changing 10 -> 12 Nos on a PO-factored row leaves stock_qty at
* the old 10 x 1000 while qty says 12, and the row posts the old weight.
*/
function applyQuantity(row, qty, fallback = null) {
	const next = {
		...row,
		qty
	};
	if (row?.measured_total !== "" && row?.measured_total != null && Number.isFinite(Number(row.measured_total)) && Number(row.measured_total) > 0) return applyMeasuredTotal(next, row.measured_total, fallback);
	const factor = Number(row?.conversion_factor);
	if (Number.isFinite(factor) && factor > 0) {
		const n = Number(qty);
		return {
			...next,
			stock_qty: Number.isFinite(n) ? n * factor : ""
		};
	}
	const n = Number(qty);
	return {
		...next,
		stock_qty: Number.isFinite(n) ? n : ""
	};
}
/** Which basis the live factor on a row rests on. Drives the UI strip. */
function conversionBasis(row) {
	if (row?.conversion_source === CONVERSION_SOURCE.MEASURED) return "measured";
	if (row?.conversion_source === CONVERSION_SOURCE.PURCHASE_ORDER) return "purchase_order";
	return "unresolved";
}
/**
* Client-side pre-check for one line. Mirrors ERPNext so a save is not spent
* discovering something we already knew.
*
* @returns {string|null} an i18n key, or null when the line is sound
*/
function validateLineRow(row, info, t) {
	const qty = Number(row.qty);
	const rules = wholeNumberRules(info, row.uom);
	if (!Number.isFinite(qty) || qty <= 0) return t("store.validation.qtyGtZero");
	if (needsMeasuredTotal(info, row.uom)) if (row.measured_total === "" || row.measured_total === void 0 || row.measured_total === null) {
		if (!hasUsableFactor(row)) return t("store.receipt.validation.totalRequired", { uom: info.stock_uom });
	} else {
		const total = Number(row.measured_total);
		if (!Number.isFinite(total) || total <= 0) return t("store.receipt.validation.totalInvalid", { uom: info.stock_uom });
	}
	const stockQty = Number(row.stock_qty);
	if (rules.mustWholeStock && row.stock_qty !== "" && Number.isFinite(stockQty) && stockQty % 1 !== 0) return t("store.receipt.validation.wholeNumberUom", { uom: info.stock_uom });
	if (rules.mustWholeQty && qty % 1 !== 0) return t("store.receipt.validation.wholeNumberUom", { uom: row.uom });
	return null;
}
/** Does this item carry serial numbers at all? */
function needsSerials(info) {
	return !!info && Number(info.has_serial_no) === 1;
}
/** True when ERPNext will generate the serials from the item's series. */
function serialsAreGenerated(info) {
	return needsSerials(info) && !!info?.serial_no_series;
}
/** "auto" | "required" | "none" -- whether the user must supply a batch number. */
function batchRule(info) {
	if (!info || Number(info.has_batch_no) !== 1) return "none";
	return Number(info.create_new_batch) === 1 && info?.batch_number_series ? "auto" : "required";
}
/**
* How many serials this row needs: one per STOCK unit, per the rule above.
* Fractional stock_qty has no valid answer, so this reports what was asked for
* and `validateSerials` refuses it.
*/
function serialCount(row) {
	const stockQty = Number(row?.stock_qty);
	if (row?.stock_qty === "" || row?.stock_qty == null || !Number.isFinite(stockQty)) return 0;
	return Math.round(stockQty);
}
/** Split a textarea value into serials, the way ERPNext's own parser does. */
function parseSerials(value) {
	return String(value ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
}
/** Derived, read-only per-serial figures. Never an input. */
function perSerialFigures(row) {
	const count = serialCount(row);
	const stockQty = Number(row?.stock_qty) || 0;
	const rate = Number(row?.rate) || 0;
	return {
		count,
		weightPerSerial: count > 0 ? stockQty / count : 0,
		ratePerSerial: count > 0 ? stockQty > 0 ? rate : 0 : 0,
		total: stockQty * rate
	};
}
/**
* Validate the serial side of a row. Returns an i18n key string or null.
*
* Order matters: the whole-number check comes first because a fractional
* stock_qty makes the required count meaningless, and reporting "expected 13
* serials" for a quantity that cannot exist would send the user hunting.
*/
function validateSerials(row, info) {
	if (!needsSerials(info)) return null;
	const stockQty = Number(row?.stock_qty);
	if (row?.stock_qty === "" || row?.stock_qty == null || !Number.isFinite(stockQty)) return "store.receipt.validation.serialNeedsQty";
	if (stockQty <= 0) return "store.receipt.validation.serialNeedsPositiveQty";
	if (stockQty % 1 !== 0) return "store.receipt.validation.serialWholeStockQty";
	if (serialsAreGenerated(info)) return null;
	const entered = parseSerials(row?.serial_no);
	const expected = serialCount(row);
	if (entered.length !== expected) return "store.receipt.validation.serialCountMismatch";
	if (new Set(entered).size !== entered.length) return "store.receipt.validation.serialDuplicate";
	return null;
}
/** Validate the batch side of a row. Returns an i18n key string or null. */
function validateBatch(row, info) {
	const rule = batchRule(info);
	if (rule === "none") return null;
	if (rule === "auto") return null;
	return row?.batch_no && String(row.batch_no).trim() ? null : "store.receipt.validation.batchRequired";
}
/**
* The Nos <-> Kg (or Nos <-> Ltr, or any pair) calculation, as display values.
*
* A weighed receipt is entered in the unit the goods are COUNTED in -- pieces --
* and stocked in the unit they are MEASURED in -- kilograms. ERPNext relates the
* two with `stock_qty = qty * conversion_factor`, and on a PO receipt the factor
* is the one field it never compares against the purchase order. So it is ours to
* derive, and the user should be able to see it rather than infer it from a
* number in a corner of the form.
*
* Returns null when the two units are the same, because there is no conversion
* to show and an "1 Nos = 1 Nos" line would be noise.
*/
function conversionPreview(row, info, receivedUom) {
	const from = receivedUom || row?.uom || "";
	const to = info?.stock_uom || "";
	if (!from || !to || from === to) return null;
	const factor = computeFactor(row?.qty, row?.measured_total);
	const qtyRaw = row?.qty;
	const totalRaw = row?.measured_total;
	const qty = Number(qtyRaw);
	const total = Number(totalRaw);
	return {
		from,
		to,
		perUnit: factor === null || factor === void 0 ? null : Number(factor),
		thisQty: qtyRaw === "" || qtyRaw == null || !Number.isFinite(qty) ? null : qty,
		thisTotal: totalRaw === "" || totalRaw == null || !Number.isFinite(total) ? null : total,
		needsWeight: needsMeasuredTotal(info, from)
	};
}
/**
* How far a measured factor has drifted from the ordered one, as a ratio.
*
* `null` when there is nothing to compare -- no measurement, or no ordered
* rate. A ratio of 1 means the delivery matched the order.
*
* This is a SANITY CHECK, not a rule. The total is always right: `qty * factor`
* reproduces the weight the user typed, however the sheets were mixed. A large
* drift almost always means a data-entry slip -- the weight of the whole
* delivery typed onto one sheet's line -- and it would book silently and
* correctly for the wrong quantity, which is the worst kind of wrong.
*/
function conversionDrift(row) {
	const measured = Number(row?.conversion_factor);
	const ordered = Number(row?.factor_from_po);
	if (!Number.isFinite(measured) || measured <= 0) return null;
	if (!Number.isFinite(ordered) || ordered <= 0) return null;
	return measured / ordered;
}
/** True when the drift is large enough to be worth a word. */
function conversionDriftSuspicious(row, threshold = 2) {
	const ratio = conversionDrift(row);
	if (ratio === null) return false;
	return ratio >= threshold || ratio <= 1 / threshold;
}
//#endregion
//#region src/config/doctypes.js
/**
* Doctype Display Configuration
*
* For each doctype, define:
* - list: which fields to show as title, subtitle, meta, and status
* - searchFields: fields to search against
* - baseFilters: default filters applied to list queries
* - fields: explicit field list to fetch (optional — auto from metadata if omitted)
*
* Pattern:
*   titleField  → displayed as the primary row text (bold)
*   subtitleField → secondary row text (grey)
*   metaField   → extra info shown on desktop (date, amount, etc.)
*   statusField → drives the status badge color
*/
var DOCTYPE_CONFIG = {
	Employee: {
		list: {
			titleField: "employee_name",
			subtitleField: "designation",
			metaField: "department",
			statusField: "status"
		},
		searchFields: [
			"employee_name",
			"employee",
			"designation"
		],
		printFormat: "Employee Appointment Letter",
		form: { layout: "stepper" }
	},
	Department: {
		list: {
			titleField: "department_name",
			subtitleField: "",
			metaField: "",
			statusField: "disabled"
		},
		searchFields: ["department_name"],
		baseFilters: []
	},
	Designation: {
		list: {
			titleField: "designation_name",
			subtitleField: "",
			metaField: "",
			statusField: ""
		},
		searchFields: ["designation_name"]
	},
	"Leave Type": {
		list: {
			titleField: "leave_type_name",
			subtitleField: "max_days",
			metaField: "",
			statusField: "is_active"
		},
		searchFields: ["leave_type_name"],
		form: { layout: "single" }
	},
	"Holiday List": {
		list: {
			titleField: "holiday_list_name",
			subtitleField: "",
			metaField: "",
			statusField: ""
		},
		searchFields: ["holiday_list_name"]
	},
	Attendance: {
		list: {
			titleField: "employee_name",
			subtitleField: "employee",
			metaField: "attendance_date",
			statusField: "status"
		},
		searchFields: ["employee_name", "employee"],
		baseFilters: []
	},
	"Salary Structure": {
		list: {
			titleField: "name",
			subtitleField: "company",
			metaField: "",
			statusField: "is_active"
		},
		searchFields: ["name"],
		nativeForm: true
	},
	"Overtime Log": {
		list: {
			titleField: "employee_name",
			subtitleField: "employee",
			metaField: "attendance_date",
			statusField: "status"
		},
		searchFields: ["employee_name", "employee"],
		readOnly: true
	},
	"Salary Slip": {
		list: {
			titleField: "employee_name",
			subtitleField: "employee",
			metaField: "posting_date",
			statusField: "docstatus"
		},
		searchFields: ["employee_name", "employee"],
		readOnly: true,
		printFormat: "Salary Slip"
	},
	"Job Opening": {
		list: {
			titleField: "job_title",
			subtitleField: "designation",
			metaField: "publish",
			statusField: "status"
		},
		searchFields: ["job_title", "designation"]
	},
	"Job Applicant": {
		list: {
			titleField: "applicant_name",
			subtitleField: "email_id",
			metaField: "job_title",
			statusField: "status"
		},
		searchFields: ["applicant_name", "email_id"]
	},
	Customer: {
		list: {
			titleField: "customer_name",
			subtitleField: "customer_type",
			metaField: "territory",
			statusField: "disabled"
		},
		searchFields: ["customer_name", "name"]
	},
	Lead: {
		list: {
			titleField: "lead_name",
			subtitleField: "company_name",
			metaField: "status",
			statusField: "status"
		},
		searchFields: [
			"lead_name",
			"company_name",
			"email_id"
		]
	},
	Opportunity: {
		list: {
			titleField: "opportunity_from",
			subtitleField: "customer_name",
			metaField: "expected_closing",
			statusField: "status"
		},
		searchFields: ["customer_name", "opportunity_from"],
		nativeForm: true
	},
	Quotation: {
		list: {
			titleField: "customer_name",
			subtitleField: "name",
			metaField: "transaction_date",
			statusField: "status"
		},
		searchFields: ["customer_name", "name"],
		nativeForm: true
	},
	"Sales Order": {
		list: {
			titleField: "customer_name",
			subtitleField: "name",
			metaField: "transaction_date",
			statusField: "status"
		},
		searchFields: ["customer_name", "name"],
		nativeForm: true
	},
	"Sales Invoice": {
		list: {
			titleField: "customer_name",
			subtitleField: "name",
			metaField: "posting_date",
			statusField: "status"
		},
		searchFields: ["customer_name", "name"],
		nativeForm: true
	},
	Item: {
		list: {
			titleField: "item_name",
			subtitleField: "item_code",
			metaField: "item_group",
			statusField: "disabled"
		},
		searchFields: ["item_name", "item_code"]
	},
	Supplier: {
		list: {
			titleField: "supplier_name",
			subtitleField: "supplier_type",
			metaField: "",
			statusField: "disabled"
		},
		searchFields: ["supplier_name", "name"]
	},
	"Purchase Order": {
		list: {
			titleField: "supplier",
			subtitleField: "name",
			metaField: "transaction_date",
			statusField: "status"
		},
		searchFields: ["supplier", "name"],
		nativeForm: true
	},
	"Purchase Receipt": {
		list: {
			titleField: "supplier",
			subtitleField: "name",
			metaField: "posting_date",
			statusField: "status"
		},
		searchFields: ["supplier", "name"],
		nativeForm: true
	},
	"Purchase Invoice": {
		list: {
			titleField: "supplier",
			subtitleField: "name",
			metaField: "posting_date",
			statusField: "status"
		},
		searchFields: ["supplier", "name"],
		nativeForm: true
	},
	"Supplier Quotation": {
		list: {
			titleField: "supplier",
			subtitleField: "name",
			metaField: "transaction_date",
			statusField: "status"
		},
		searchFields: ["supplier", "name"],
		nativeForm: true
	},
	"Request for Quotation": {
		list: {
			titleField: "name",
			subtitleField: "company",
			metaField: "transaction_date",
			statusField: "status"
		},
		searchFields: ["name"],
		nativeForm: true
	},
	Warehouse: {
		list: {
			titleField: "warehouse_name",
			subtitleField: "company",
			metaField: "",
			statusField: "disabled"
		},
		searchFields: ["warehouse_name"]
	},
	BOM: {
		list: {
			titleField: "item_name",
			subtitleField: "name",
			metaField: "modified",
			statusField: "docstatus"
		},
		searchFields: [
			"name",
			"item_name",
			"project"
		],
		baseFilters: [[
			"is_active",
			"=",
			1
		]],
		form: { layout: "tabs" }
	},
	"Stock Reconciliation": {
		list: {
			titleField: "name",
			subtitleField: "company",
			metaField: "posting_date",
			statusField: "docstatus"
		},
		searchFields: ["name"],
		nativeForm: true
	},
	"Non Conformance": {
		list: {
			titleField: "subject",
			subtitleField: "name",
			metaField: "date",
			statusField: "status"
		},
		searchFields: ["subject", "name"]
	},
	"Corrective Action": {
		list: {
			titleField: "name",
			subtitleField: "status",
			metaField: "date",
			statusField: "status"
		},
		searchFields: ["name"]
	},
	"Quality Procedure": {
		list: {
			titleField: "name",
			subtitleField: "procedure_scope",
			metaField: "",
			statusField: "is_active"
		},
		searchFields: ["name"]
	}
};
//#endregion
//#region src/pages/Reports/custom-report/format.js
/**
* Pure helpers for the generic cross-app report page.
*
* Split out from CustomReportPage.jsx because these are the parts with real
* logic and they are unit-tested in .smoke-tmp/rules.jsx. They are deliberately
* free of React and of i18n so a rules-suite case can assert on them directly.
*/
var NUMERIC = new Set([
	"Currency",
	"Float",
	"Int",
	"Percent"
]);
function isNumericColumn(col) {
	return NUMERIC.has(col?.fieldtype);
}
/**
* Frappe stores a Select filter's options in `Report Filter.options`, which is a
* Small Text field written as one option per line with surrounding whitespace
* from the doctype editor's Textarea.
*/
function parseSelectOptions(options) {
	return String(options ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({
		value: line,
		label: line
	}));
}
/**
* Render one report cell.
*
* Two things here are load-bearing, both because a stock count that reads as
* "0" when it is actually blank is a business error, not a formatting nit:
*
* - `null` / `undefined` / `""` become an em dash. A naive `Number(value)` or
*   `value ?? 0` renders a missing plate weight as 0.
* - `Number.isFinite` is the guard, and it is applied to `Number(value)`, never
*   to the raw value. `Number(null)` is 0 and 0 IS finite, so the same mistake
*   `conversionPreview` once made (see AGENTS.md section 20) would report a
*   missing weight as a real zero here.
*
* Numbers arrive straight from a SQL report, so whole-number Float columns
* would otherwise print "12.0" and Currency columns would drop trailing zeros.
*/
function formatCell(value, col) {
	if (value === null || value === void 0 || value === "") return "—";
	if (!isNumericColumn(col)) return String(value);
	const n = Number(value);
	if (!Number.isFinite(n)) return String(value);
	if (col.fieldtype === "Currency") return n.toLocaleString(void 0, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
	if (col.fieldtype === "Int" || Number.isInteger(n)) return n.toLocaleString();
	return n.toLocaleString(void 0, { maximumFractionDigits: 3 });
}
/**
* Columns to actually render.
*
* A report drops a column from DISPLAY without dropping it from the row dict by
* setting `hidden` — `Plate Stock Register`'s execute() appends a hidden
* "Offcuts" column whenever `include_offcuts` is falsy. Filtering here is what
* keeps that from shifting every later value one column to the left, since the
* row dict still carries the field.
*/
function visibleColumns(columns) {
	return (columns || []).filter((c) => !c.hidden);
}
/**
* Seed a filter value from the report's declared `default`.
*
* `Report Filter.default` is Small Text, so a Check's default arrives as the
* STRING "1"/"0". The report tests `filters.get("include_offcuts")` for
* TRUTHINESS, and the string "0" is truthy in Python — so passing it through
* un-normalised would silently invert the filter.
*/
function seedDefault(filter) {
	if (!filter || filter.default === "" || filter.default === null) return void 0;
	if (filter.fieldtype === "Check") return filter.default === "1" ? 1 : 0;
	return filter.default;
}
//#endregion
//#region src/pages/Reports/custom-report/group.js
/**
* Row grouping for the generic cross-app report page.
*
* Why grouping is client-side: the report already returns one row per
* (item, warehouse, batch) and already sorts by (item, warehouse, batch), so
* every child row and the correct order are on screen before anything is
* grouped. Grouping is presentation over rows the user is already permitted to
* see, so it belongs here rather than in a change to the owning app.
*
* Split out from CustomReportPage.jsx because the aggregation rules are the only
* place a wrong number can reach a storekeeper, and they are unit-tested in
* .smoke-tmp/rules.jsx. Pure: no React, no i18n.
*/
/**
* How a column behaves once rows are grouped.
*
* - sum:     a true total; added across children and shown on the parent
* - ratio:   NOT a total and never added -- recomputed from the parent's own
*            totals as numerator/denominator
* - constant: one value per group (an Item-master attribute); shown on the
*            parent and blanked on children because it would repeat
* - mixed:   constant in practice but derived per batch, so it can disagree;
*            shown when the children agree and flagged when they do not
*
* Everything else is blank on the parent: warehouse, batch, heat number and MTC
* number describe one batch in one place and have no meaning across a group.
*/
var DEFAULT_GROUP_CONFIG = {
	groupBy: [],
	childKey: [],
	sum: [],
	ratio: {},
	constant: [],
	mixed: [],
	countFields: []
};
/** Numeric coercion for aggregation. A blank or non-numeric value contributes 0. */
function toNum(value) {
	if (value === null || value === void 0 || value === "") return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}
/** Distinct non-empty values of `field` across `rows`, counted for the subtitle. */
function distinctCount(rows, field) {
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows || []) {
		const v = row?.[field];
		if (v !== null && v !== void 0 && v !== "") seen.add(String(v));
	}
	return seen.size;
}
/**
* Whether a cell should render blank for this row's role.
*
* parent: only the group label, the constant/mixed attributes and the
* aggregated figures show. The per-batch describing columns are blank.
* child: the group columns and the constant attributes are blank, because every
* child shares them with its siblings; everything else shows its own value.
*/
function isBlankCell(field, role, config) {
	const cfg = {
		...DEFAULT_GROUP_CONFIG,
		...config || {}
	};
	const groupBy = cfg.groupBy || [];
	const constant = cfg.constant || [];
	if (role === "parent") {
		if (groupBy.includes(field)) return false;
		if (constant.includes(field)) return false;
		if ((cfg.mixed || []).includes(field)) return false;
		if ((cfg.sum || []).includes(field)) return false;
		if (Object.prototype.hasOwnProperty.call(cfg.ratio || {}, field)) return false;
		return true;
	}
	if (groupBy.includes(field)) return true;
	if (constant.includes(field)) return true;
	return false;
}
/**
* Group flat report rows into parents with aggregated children.
*
* ARRIVAL ORDER IS PRESERVED, deliberately. The report sorts by
* (item, warehouse, batch), which is exactly the order wanted here -- grouping
* by item keeps the groups in the server's item order and keeps each group's
* children in warehouse-then-batch order. Sorting again on the client would
* silently override the owning report's chosen order.
*
* @returns {Array<{key,label,children,aggregate,counts}>}
*/
function groupRows(rows, config) {
	const cfg = {
		...DEFAULT_GROUP_CONFIG,
		...config || {}
	};
	const groupBy = cfg.groupBy || [];
	const childKey = cfg.childKey || [];
	const sumFields = cfg.sum || [];
	const ratio = cfg.ratio || {};
	const constant = cfg.constant || [];
	const mixed = cfg.mixed || [];
	if (!groupBy.length) return rows?.length ? [buildGroup(rows, groupBy, cfg, "\0all")] : [];
	const order = [];
	const byKey = /* @__PURE__ */ new Map();
	for (const row of rows || []) {
		const key = groupBy.map((f) => row?.[f] ?? "").join("\0");
		let group = byKey.get(key);
		if (!group) {
			group = {
				key,
				children: []
			};
			byKey.set(key, group);
			order.push(group);
		}
		group.children.push(row);
	}
	return order.map((g) => buildGroup(g.children, groupBy, cfg, g.key, {
		label: g.children[0],
		key: g.key,
		childKey,
		sumFields,
		ratio,
		constant,
		mixed,
		countFields: cfg.countFields || []
	}));
}
function buildGroup(children, groupBy, cfg, key, opts) {
	const groupByFields = opts?.groupBy || groupBy;
	const childKeyFields = opts?.childKey || cfg.childKey || [];
	const sumFields = opts?.sumFields || cfg.sum || [];
	const ratio = opts?.ratio || cfg.ratio || {};
	const constant = opts?.constant || cfg.constant || [];
	const mixed = opts?.mixed || cfg.mixed || [];
	const countFields = opts?.countFields || cfg.countFields || [];
	const labelRow = opts?.label || children[0];
	const totals = {};
	for (const field of sumFields) totals[field] = children.reduce((acc, r) => acc + toNum(r?.[field]), 0);
	for (const [field, [numField, denField]] of Object.entries(ratio)) {
		const den = denField ? toNum(totals[denField] ?? children[0]?.[denField]) : 0;
		totals[field] = den ? toNum(totals[numField] ?? children[0]?.[numField]) / den : null;
	}
	const attributes = {};
	for (const field of constant) attributes[field] = labelRow?.[field];
	const mixedFlags = {};
	for (const field of mixed) {
		const values = new Set(children.map((r) => r?.[field] === null || r?.[field] === void 0 ? "" : String(r[field])));
		attributes[field] = values.size === 1 ? children[0]?.[field] : void 0;
		mixedFlags[field] = values.size > 1;
	}
	const counts = {};
	for (const { field } of countFields) counts[field] = distinctCount(children, field);
	const keyedChildren = children.map((row, i) => {
		const parts = childKeyFields.map((f) => row?.[f] ?? "");
		return {
			row,
			key: `${key}::${parts.length ? parts.join(" | ") : `row-${i}`}`,
			index: i
		};
	});
	return {
		key,
		label: groupByFields.map((f) => labelRow?.[f]).filter((v) => v !== null && v !== void 0 && v !== "").join(" / "),
		labelRow,
		children: keyedChildren,
		aggregate: {
			...attributes,
			...totals
		},
		mixedFlags,
		counts
	};
}
//#endregion
//#region src/lib/stockBalance.js
/**
* Stock balance arithmetic.
*
* Pure, and deliberately so: the SQL behind the summary report cannot be unit
* tested, so everything that decides *what the numbers mean* lives here where
* the rules suite can assert it. Only fetching stays in `api.py`.
*
* The contract, from ERPNext itself (`stock_balance.py:456-587`):
*
*     closing = opening + in - out
*
* with `in`/`out` taken from Stock Ledger Entry movement inside the window and
* `opening` being everything posted before it. A Stock Ledger Entry's
* `actual_qty` is signed -- positive in, negative out -- so the split is by sign,
* not by voucher type. A return is an inward movement that happens to be a
* "Purchase Return", which is why the sign is the only honest classifier.
*
* Worth stating because it is the whole point of the report: a balance is not a
* single number with a single price. On QA, item `CORE` holds 3 Kg received on
* one Purchase Receipt at two different rates (2 Kg @ 1000, 1 Kg @ 1200). A flat
* blended rate hides that the stock is made of two receipts of value; the
* ledger trail is what surfaces it.
*/
/** Split a signed quantity into the inbound and outbound magnitudes. */
function splitMovement(actualQty) {
	const q = Number(actualQty) || 0;
	return q > 0 ? {
		inQty: q,
		outQty: 0
	} : {
		inQty: 0,
		outQty: Math.abs(q)
	};
}
/**
* Reconcile opening + movement into a closing balance.
*
* @param {object} p
* @param {number} p.openingQty  everything posted before the window
* @param {Array}  p.movements  Stock Ledger Entries inside the window (signed
*                              `actual_qty`); may be undefined when the server
*                              already aggregated them
* @param {number} [p.inQty]    pre-aggregated inbound, when there is no detail
* @param {number} [p.outQty]   pre-aggregated outbound
*/
function reconcile({ openingQty = 0, movements, inQty, outQty }) {
	const opening = Number(openingQty) || 0;
	let inbound = inQty === void 0 || inQty === null ? 0 : Number(inQty) || 0;
	let outbound = outQty === void 0 || outQty === null ? 0 : Number(outQty) || 0;
	if (Array.isArray(movements)) {
		inbound = 0;
		outbound = 0;
		for (const m of movements) {
			const s = splitMovement(m.actual_qty);
			inbound += s.inQty;
			outbound += s.outQty;
		}
	}
	const closing = opening + inbound - outbound;
	return {
		openingQty: opening,
		inQty: inbound,
		outQty: outbound,
		closingQty: closing
	};
}
/**
* Free stock = what is on hand minus what is already committed.
*
* `reserved_qty` is stock promised to submitted sales/stock entries and cannot
* be re-issued, so showing the balance without subtracting it overstates what
* the store can actually use. Exposed separately rather than folded in, because
* "we hold 40 but 12 are spoken for" is a different conversation from "we hold
* 40".
*/
function freeQty(closingQty, reservedQty) {
	return (Number(closingQty) || 0) - (Number(reservedQty) || 0);
}
/**
* Which way a ledger entry moved stock. Separate from `splitMovement` because
* the trail labels the row ("In"/"Out") while the summary sums magnitudes.
*
* @returns {"in"|"out"|""} empty for a zero-quantity entry, which is neither.
*/
function directionOf(actualQty) {
	const q = Number(actualQty) || 0;
	if (q > 0) return "in";
	if (q < 0) return "out";
	return "";
}
/**
* Fold a chronological ledger into rows carrying a running balance.
*
* The running balance starts at `openingQty` rather than 0 so the first row's
* balance already accounts for stock that arrived before the window -- otherwise
* the trail visibly disagrees with the summary above it.
*
* Ordering is ascending by posting time. ERPNext itself orders the ledger by
* `posting_datetime` (`stock_balance.py:395`); we rely on the server having
* done that rather than re-sorting here, because equal timestamps on the same
* day must keep their server order.
*/
function withRunningBalance(sles, openingQty = 0) {
	let running = Number(openingQty) || 0;
	return (sles || []).map((sle) => {
		const q = Number(sle.actual_qty) || 0;
		running += q;
		return {
			...sle,
			direction: directionOf(q),
			running_balance: running
		};
	});
}
/**
* Value of a balance, and the rate it implies.
*
* Only ever called with the CURRENT `Bin.valuation_rate`, which is ERPNext's
* moving average. For a historical period this is not the rate that applied
* then, so callers must leave value blank rather than pass an old date's rows
* through here -- see `isValuationAccurate`.
*/
function valueOf(qty, valuationRate) {
	return (Number(qty) || 0) * (Number(valuationRate) || 0);
}
/**
* Whether value/rate columns may be shown for a given `to_date`.
*
* `Bin.valuation_rate` is today's moving average. For `to_date` in the past it
* is a different number from the one that actually valued that stock, and
* rendering it beside an as-of-past balance produces a confident wrong answer.
* Compare against the *end of* `to_date`, not its start, so a range ending
* today is accurate.
*/
function isValuationAccurate(toDate, today) {
	if (!toDate || !today) return false;
	return String(toDate) >= String(today);
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
var D = (isEdit, docstatus) => resolveDocstatusActions({
	isEdit,
	docstatus
});
var d = D(false, void 0);
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
ok("docstatus: string \"1\" is submitted", D(true, "1").showCancel && !D(true, "1").showDelete);
ok("docstatus: string \"0\" is draft", D(true, "0").showBack && D(true, "0").showDelete);
ok("docstatus: null is treated as draft", D(true, null).showBack);
ok("docstatus: no args safe", resolveDocstatusActions().showBack === true && resolveDocstatusActions().showDelete === false);
for (const ds of [
	0,
	1,
	2
]) {
	const r = D(true, ds);
	ok(`docstatus ${ds}: Back and Cancel never compete`, !(r.showBack && r.showCancel));
	ok(`docstatus ${ds}: at most one destructive action`, [r.showCancel, r.showDelete].filter(Boolean).length <= 1);
}
ok("docstatus 0: draft offers Back and Delete together", D(true, 0).showBack && D(true, 0).showDelete);
var W = (isEdit, docstatus) => resolveDocstatusActions({
	isEdit,
	docstatus,
	hasWorkflow: true
});
var w = W(true, 1);
ok("workflow+submitted: docstatus Cancel suppressed", !w.showCancel);
ok("workflow+submitted: Back still suppressed", !w.showBack);
ok("workflow+submitted: still NOT deletable", !w.showDelete);
w = W(true, 0);
ok("workflow+draft: Back survives", w.showBack);
ok("workflow+draft: Delete survives", w.showDelete);
ok("workflow+draft: no docstatus Cancel anyway", !w.showCancel);
w = W(true, 2);
ok("workflow+cancelled: Delete survives", w.showDelete);
ok("workflow+cancelled: no docstatus Cancel", !w.showCancel);
ok("workflow: hasWorkflow defaults to false (opt-in, no silent suppression)", resolveDocstatusActions({
	isEdit: true,
	docstatus: 1
}).showCancel === true);
ok("workflow: Back/Cancel still never compete under a workflow", !W(true, 0).showBack || !W(true, 0).showCancel);
ok("workflow: at most one destructive action under a workflow", [
	0,
	1,
	2
].every((ds) => [W(true, ds).showCancel, W(true, ds).showDelete].filter(Boolean).length <= 1));
ok("docstatus 1: submitted offers Cancel alone", (() => {
	const r = D(true, 1);
	return r.showCancel && !r.showBack && !r.showDelete;
})());
ok("docstatus 2: cancelled offers Delete alone", (() => {
	const r = D(true, 2);
	return r.showDelete && !r.showBack && !r.showCancel;
})());
ok("docstatus: submitted can only be escaped via Cancel, never Delete", D(true, 1).showCancel && !D(true, 1).showDelete && D(true, 2).showDelete);
ok("gate: no workflow configured (key absent) hides the banner", resolveHrApprovalGate({ name: "HR-EMP-00001" }).showWarning === false);
ok("gate: no workflow configured -> hasGate false", resolveHrApprovalGate({ name: "HR-EMP-00001" }).hasGate === false);
ok("gate: null state hides the banner (record predates the workflow)", resolveHrApprovalGate({ workflow_state: null }).showWarning === false);
ok("gate: Pending HR Approval shows the warning", resolveHrApprovalGate({ workflow_state: "Pending HR Approval" }).showWarning === true);
ok("gate: Rejected shows the warning", resolveHrApprovalGate({ workflow_state: "Rejected" }).showWarning === true);
ok("gate: Approved hides the warning", resolveHrApprovalGate({ workflow_state: "Approved" }).showWarning === false);
ok("gate: warning shows for ANY non-Approved state (future-proof)", [
	"Pending HR Approval",
	"Rejected",
	"Something New"
].every((s) => resolveHrApprovalGate({ workflow_state: s }).showWarning === true));
ok("gate: state is echoed through for consumers", resolveHrApprovalGate({ workflow_state: "Rejected" }).state === "Rejected");
ok("gate: absent state is normalised to null, not undefined", resolveHrApprovalGate({}).state === null);
ok("gate: missing profile object does not throw", resolveHrApprovalGate(void 0).showWarning === false);
ok("gate: empty string is a real state, so it warns (not treated as absent)", resolveHrApprovalGate({ workflow_state: "" }).showWarning === true);
ok("gate: a legacy custom_hr_approved flag alone must NOT trigger the banner", resolveHrApprovalGate({ custom_hr_approved: false }).showWarning === false);
ok("gate: Approved wins even when a legacy flag disagrees", resolveHrApprovalGate({
	workflow_state: "Approved",
	custom_hr_approved: false
}).showWarning === false);
ok("no purpose writes the bare word 'Transfer'", !REQUEST_PURPOSE_KEYS.some((k) => REQUEST_PURPOSES[k].materialRequestType === "Transfer"));
ok("no purpose writes 'Material Receipt' as a REQUEST type", !REQUEST_PURPOSE_KEYS.some((k) => REQUEST_PURPOSES[k].materialRequestType === "Material Receipt"));
ok("every request purpose writes a value ERPNext actually accepts", REQUEST_PURPOSE_KEYS.every((k) => MATERIAL_REQUEST_TYPES.includes(REQUEST_PURPOSES[k].materialRequestType)), REQUEST_PURPOSE_KEYS.map((k) => REQUEST_PURPOSES[k].materialRequestType));
ok("the full ERPNext v15 type list is captured exactly", JSON.stringify(MATERIAL_REQUEST_TYPES) === JSON.stringify([
	"Purchase",
	"Material Transfer",
	"Material Issue",
	"Manufacture",
	"Customer Provided"
]), MATERIAL_REQUEST_TYPES);
ok("each MR type maps back to exactly one purpose", MATERIAL_REQUEST_TYPES.every((t) => {
	return REQUEST_PURPOSE_KEYS.filter((k) => REQUEST_PURPOSES[k].materialRequestType === t).length === 1;
}));
ok("store-fulfillable set matches ERPNext's make_stock_entry gate", JSON.stringify([...STORE_FULFILLABLE_TYPES].sort()) === JSON.stringify([
	"Customer Provided",
	"Material Issue",
	"Material Transfer"
]), STORE_FULFILLABLE_TYPES);
ok("Purchase is NOT fulfilable by the store", !STORE_FULFILLABLE_TYPES.includes("Purchase"));
ok("Manufacture is NOT fulfilable by the store", !STORE_FULFILLABLE_TYPES.includes("Manufacture"));
var SE_TYPES = Object.values(STOCK_ENTRY_PURPOSES).map((p) => p.stockEntryType);
ok("stockPurposeForType: all 9 ERPNext types map back to a purpose", SE_TYPES.length === 9 && SE_TYPES.every((t) => stockPurposeForType(t) !== ""), `types=${SE_TYPES.length}`);
ok("stockPurposeForType: unknown type yields '' rather than a wrong purpose", stockPurposeForType("Not A Real Type") === "");
ok("computeFactor: 25.4 Kg over 10 Nos = 2.54", computeFactor(10, 25.4) === 2.54, computeFactor(10, 25.4));
ok("computeFactor: unrounded -- 10/3 keeps full precision", computeFactor(3, 10) === 10 / 3);
ok("computeFactor: qty 0 returns null rather than Infinity", computeFactor(0, 25.4) === null);
ok("computeFactor: empty total returns null rather than defaulting to 1", computeFactor(10, "") === null && computeFactor(10, void 0) === null);
var KG_NOS = {
	stock_uom: "Kg",
	uoms: [{
		uom: "Kg",
		must_be_whole_number: 0
	}, {
		uom: "Nos",
		must_be_whole_number: 1
	}]
};
ok("needsMeasuredTotal: false when received UOM == stock UOM", needsMeasuredTotal(KG_NOS, "Kg") === false);
ok("needsMeasuredTotal: true when a weighed stock UOM differs from received", needsMeasuredTotal(KG_NOS, "Nos") === true);
ok("needsMeasuredTotal: false without a UOM lookup", needsMeasuredTotal(void 0, "Nos") === false && needsMeasuredTotal({ uoms: [] }, "Nos") === false);
var NOS_STOCK = {
	stock_uom: "Nos",
	uoms: [{
		uom: "Nos",
		must_be_whole_number: 1
	}, {
		uom: "Kg",
		must_be_whole_number: 0
	}]
};
ok("needsMeasuredTotal: NOT offered when the STOCK UOM counts whole pieces", needsMeasuredTotal(NOS_STOCK, "Kg") === false, "a weight cannot be stock in Nos, so the field would only book wrong quantities");
ok("needsMeasuredTotal: still offered for a weighed stock UOM", needsMeasuredTotal(KG_NOS, "Nos") === true);
var RULES_INFO = KG_NOS;
ok("wholeNumberRules: received Nos is whole-number", wholeNumberRules(RULES_INFO, "Nos").mustWholeQty === true);
ok("wholeNumberRules: stock Kg is not whole-number", wholeNumberRules(RULES_INFO, "Nos").mustWholeStock === false);
ok("wholeNumberRules: reversed item -- stock Nos IS whole-number", wholeNumberRules({
	stock_uom: "Nos",
	uoms: [{
		uom: "Nos",
		must_be_whole_number: 1
	}, {
		uom: "Kg",
		must_be_whole_number: 0
	}]
}, "Kg").mustWholeStock === true);
var WEIGHED = {
	_rid: "r1",
	qty: 10,
	uom: "Nos",
	stock_uom: "Kg"
};
var applied = applyMeasuredTotal({
	...WEIGHED,
	conversion_factor: 1
}, 25.4);
ok("applyMeasuredTotal: factor = total / qty", applied.conversion_factor === 2.54, applied.conversion_factor);
ok("applyMeasuredTotal: stock_qty is the measured total, not qty*factor", applied.stock_qty === 25.4, applied.stock_qty);
ok("applyMeasuredTotal: stock_qty has no float noise from the multiplication", applyMeasuredTotal({ ...WEIGHED }, .30000000000000004).stock_qty === .30000000000000004);
var noTotal = applyMeasuredTotal({ ...WEIGHED }, "");
ok("applyMeasuredTotal: a missing measurement never invents a silent factor", noTotal.conversion_source === "default" && noTotal.conversion_factor === 1, "the source flag is what makes the placeholder honest");
var same = applyMeasuredTotal({
	_rid: "r2",
	qty: 7,
	uom: "Nos",
	stock_uom: "Nos",
	measured_total: "99"
}, "99");
ok("applyMeasuredTotal: same UOM pins factor to 1 and ignores any total", same.conversion_factor === 1 && same.stock_qty === 7 && same.measured_total === "");
var lastVars = null;
var T = (k, vars) => {
	lastVars = vars || {};
	return k;
};
ok("validateLineRow: weighed line with no total is rejected", validateLineRow({
	qty: 10,
	uom: "Nos",
	stock_uom: "Kg",
	measured_total: ""
}, RULES_INFO, T) === "store.receipt.validation.totalRequired");
ok("validateLineRow: the missing-total message names the STOCK uom", lastVars && lastVars.uom === "Kg", JSON.stringify(lastVars));
ok("validateLineRow: fractional qty against whole-number received UOM is rejected", validateLineRow({
	qty: .5,
	uom: "Nos",
	stock_uom: "Kg",
	measured_total: "5"
}, RULES_INFO, T) === "store.receipt.validation.wholeNumberUom");
ok("validateLineRow: fractional stock qty against whole-number STOCK UOM is rejected", validateLineRow({
	qty: 10,
	uom: "Kg",
	stock_uom: "Nos",
	measured_total: "25.4",
	stock_qty: 25.4
}, NOS_STOCK, T) === "store.receipt.validation.wholeNumberUom");
ok("validateLineRow: a whole stock qty against a whole-number STOCK UOM is fine", validateLineRow({
	qty: 10,
	uom: "Kg",
	stock_uom: "Nos",
	measured_total: "25",
	stock_qty: 25
}, NOS_STOCK, T) === null);
ok("validateLineRow: a complete weighed line passes", validateLineRow({
	qty: 10,
	uom: "Nos",
	stock_uom: "Kg",
	measured_total: "25.4"
}, RULES_INFO, T) === null);
ok("validateLineRow: qty must be greater than zero", validateLineRow({
	qty: 0,
	uom: "Nos",
	stock_uom: "Kg",
	measured_total: "25.4"
}, RULES_INFO, T) === "store.validation.qtyGtZero");
ok("stockPurposeForType: round-trips every key", Object.keys(STOCK_ENTRY_PURPOSES).every((k) => stockPurposeForType(STOCK_ENTRY_PURPOSES[k].stockEntryType) === k));
for (const [k, [from, to]] of Object.entries({
	issue: [true, false],
	receipt: [false, true],
	transfer: [true, true],
	transferForManufacture: [true, true],
	consumption: [true, false],
	manufacture: [true, true],
	repack: [true, true],
	disassemble: [true, true],
	subcontractor: [true, true]
})) {
	const got = STOCK_ENTRY_PURPOSES[k];
	ok(`STOCK_ENTRY_PURPOSES.${k}: warehouse shape`, got.showFromWarehouse === from && got.showToWarehouse === to, `from=${got.showFromWarehouse} to=${got.showToWarehouse}`);
}
ok("requestPurposeForType resolves the indent purpose", requestPurposeForType("Material Issue") === "indent");
ok("requestPurposeForType returns null for an unknown type, not undefined", requestPurposeForType("Nonsense") === null);
var payload = buildStockEntryPayload("issue", {
	items: [{
		item_code: "X",
		qty: 1
	}],
	fromWarehouse: "Stores - DVPL",
	toWarehouse: "Finished Goods - DVPL",
	posting_date: "2026-01-01"
});
ok("payload sets stock_entry_type (the authoritative field)", payload.stock_entry_type === "Material Issue");
ok("payload never sends the derived `purpose`", !("purpose" in payload), payload);
ok("Material Issue sends the source warehouse", payload.from_warehouse === "Stores - DVPL");
ok("Material Issue never sends a target warehouse (server clears it anyway)", !("to_warehouse" in payload), payload);
ok("all nine ERPNext stock entry purposes are modelled", Object.keys(STOCK_ENTRY_PURPOSES).length === 9);
ok("every purpose has a group, and every group is declared", Object.values(STOCK_ENTRY_PURPOSES).every((p) => STOCK_MOVEMENT_GROUPS.includes(p.group)));
ok("every purpose declares at least one warehouse side", Object.values(STOCK_ENTRY_PURPOSES).every((p) => p.showFromWarehouse || p.showToWarehouse));
ok("stock_entry_type always equals the purpose it mirrors", Object.values(STOCK_ENTRY_PURPOSES).every((p) => p.stockEntryType === p.purpose));
ok("no two stock purposes share a stock_entry_type", new Set(Object.values(STOCK_ENTRY_PURPOSES).map((p) => p.stockEntryType)).size === 9);
ok("Material Issue shows one warehouse side only", STOCK_ENTRY_PURPOSES.issue.showFromWarehouse === true && STOCK_ENTRY_PURPOSES.issue.showToWarehouse === false);
ok("Material Receipt shows one warehouse side only", STOCK_ENTRY_PURPOSES.receipt.showFromWarehouse === false && STOCK_ENTRY_PURPOSES.receipt.showToWarehouse === true);
ok("Material Consumption shows one warehouse side only", STOCK_ENTRY_PURPOSES.consumption.showFromWarehouse === true && STOCK_ENTRY_PURPOSES.consumption.showToWarehouse === false);
ok("Material Transfer shows both sides", STOCK_ENTRY_PURPOSES.transfer.showFromWarehouse === true && STOCK_ENTRY_PURPOSES.transfer.showToWarehouse === true);
ok("both manufacturing moves demand a Work Order", STOCK_ENTRY_PURPOSES.transferForManufacture.requiresWorkOrder === true && STOCK_ENTRY_PURPOSES.consumption.requiresWorkOrder === true);
ok("plain store moves do not demand a Work Order", STOCK_ENTRY_PURPOSES.issue.requiresWorkOrder === false && STOCK_ENTRY_PURPOSES.receipt.requiresWorkOrder === false && STOCK_ENTRY_PURPOSES.transfer.requiresWorkOrder === false);
var threw = false;
try {
	buildStockEntryPayload("not-a-purpose", { items: [] });
} catch {
	threw = true;
}
ok("unknown stock movement purpose throws", threw);
ok("splitMovement: positive is all inbound", JSON.stringify(splitMovement(5)) === JSON.stringify({
	inQty: 5,
	outQty: 0
}));
ok("splitMovement: negative becomes a POSITIVE outbound magnitude", JSON.stringify(splitMovement(-5)) === JSON.stringify({
	inQty: 0,
	outQty: 5
}), "out_qty is a magnitude, never negative");
ok("splitMovement: zero is neither", JSON.stringify(splitMovement(0)) === JSON.stringify({
	inQty: 0,
	outQty: 0
}));
var r1 = reconcile({
	openingQty: 10,
	inQty: 5,
	outQty: 3
});
ok("reconcile: closing = opening + in - out", r1.closingQty === 12 && r1.openingQty === 10 && r1.inQty === 5 && r1.outQty === 3, JSON.stringify(r1));
var r2 = reconcile({
	openingQty: 0,
	movements: [{ actual_qty: 2 }, { actual_qty: 1 }]
});
ok("reconcile: two inbound movements sum to 3", r2.closingQty === 3 && r2.inQty === 3);
ok("reconcile: value is NOT the blend of the two receipts", valueOf(r2.closingQty, 3200 / 3) === 3200 && valueOf(2, 1e3) !== valueOf(2, 1200), "the two receipts must stay distinguishable in the trail");
ok("reconcile: mixed in and out from detail", reconcile({
	openingQty: 5,
	movements: [{ actual_qty: 10 }, { actual_qty: -3 }]
}).closingQty === 12);
ok("reconcile: empty movement list leaves the opening untouched", reconcile({
	openingQty: 7,
	movements: []
}).closingQty === 7);
ok("reconcile: missing everything defaults to zero", reconcile({}).closingQty === 0);
ok("freeQty: balance minus reserved", freeQty(40, 12) === 28);
ok("freeQty: over-reserved goes negative rather than clamping", freeQty(5, 12) === -7, "a negative free balance is information, not a bug");
ok("directionOf: labels each movement", directionOf(3) === "in" && directionOf(-3) === "out" && directionOf(0) === "");
var folded = withRunningBalance([{ actual_qty: 2 }, { actual_qty: 1 }], 10);
ok("withRunningBalance: starts from the window opening, not zero", folded[0].running_balance === 12 && folded[1].running_balance === 13, JSON.stringify(folded.map((f) => f.running_balance)));
ok("withRunningBalance: an outbound subtracts", withRunningBalance([{ actual_qty: 5 }, { actual_qty: -2 }], 0)[1].running_balance === 3);
ok("withRunningBalance: direction attached per row", withRunningBalance([{ actual_qty: -1 }], 0)[0].direction === "out");
ok("withRunningBalance: empty ledger is empty", withRunningBalance([], 5).length === 0);
ok("isValuationAccurate: true for a window ending today", isValuationAccurate("2026-10-13", "2026-10-13") === true);
ok("isValuationAccurate: false for a past window", isValuationAccurate("2026-09-30", "2026-10-13") === false);
ok("isValuationAccurate: false when either date is missing", isValuationAccurate("", "2026-10-13") === false && isValuationAccurate("2026-10-13", null) === false);
var API_CANDIDATES = [
	"../../../api.py",
	"../../../../api.py",
	"../../erpnext_ui/api.py"
];
var apiSource = "";
var apiPath = "";
for (const rel of API_CANDIDATES) try {
	apiSource = readFileSync(new URL(rel, import.meta.url), "utf8");
	apiPath = rel;
	break;
} catch {}
var apiLines = apiSource.split("\n");
var undecorated = [];
for (let i = 0; i < apiLines.length; i++) {
	const m = apiLines[i].match(/^def ((?:get|create)_\w+)\(/);
	if (!m) continue;
	let j = i - 1;
	while (j >= 0 && (!apiLines[j].trim() || apiLines[j].trim().startsWith("#"))) j--;
	if (!apiLines[j].trim().startsWith("@frappe.whitelist")) undecorated.push(`${m[1]} (line ${i + 1})`);
}
ok("every get_*/create_* endpoint in api.py carries @frappe.whitelist", undecorated.length === 0, `not whitelisted: ${undecorated.join(", ")} -- the SPA cannot call these`);
ok("the whitelist guard actually located and parsed api.py", apiPath !== "" && apiLines.length > 500, `path=${apiPath || "NOT FOUND"} lines=${apiLines.length}`);
var decideReturn = (item) => {
	const autoBatch = Boolean(item.has_batch_no && item.create_new_batch && item.batch_number_series);
	const autoSerial = Boolean(item.has_serial_no && item.serial_no_series);
	return {
		auto_batch: autoBatch,
		needs_batch_number: Boolean(item.has_batch_no) && !autoBatch,
		needs_serials: Boolean(item.has_serial_no) && !autoSerial
	};
};
ok("return: plain item asks neither batch nor serial", JSON.stringify(decideReturn({})) === JSON.stringify({
	auto_batch: false,
	needs_batch_number: false,
	needs_serials: false
}));
ok("return: batch item WITH create_new_batch + series auto-names it", decideReturn({
	has_batch_no: 1,
	create_new_batch: 1,
	batch_number_series: "BAT-.#####"
}).auto_batch === true);
ok("return: batch item with create_new_batch but NO series must ASK", decideReturn({
	has_batch_no: 1,
	create_new_batch: 1,
	batch_number_series: ""
}).needs_batch_number === true, "ERPNext has no series to generate from and throws at save");
ok("return: batch item without create_new_batch must ASK (select existing)", decideReturn({
	has_batch_no: 1,
	create_new_batch: 0,
	batch_number_series: "BAT-.#####"
}).needs_batch_number === true);
ok("return: serial item WITH a series generates them", decideReturn({
	has_serial_no: 1,
	serial_no_series: "SN-.#####"
}).needs_serials === false);
ok("return: serial item WITHOUT a series must ASK for each number", decideReturn({
	has_serial_no: 1,
	serial_no_series: ""
}).needs_serials === true);
ok("return: batch+serial item asks for both when neither can auto-generate", JSON.stringify(decideReturn({
	has_batch_no: 1,
	create_new_batch: 0,
	has_serial_no: 1
})) === JSON.stringify({
	auto_batch: false,
	needs_batch_number: true,
	needs_serials: true
}));
ok("return: a freshly created tracked item always needs the number typed", decideReturn({
	has_batch_no: 1,
	create_new_batch: 0
}).needs_batch_number === true && decideReturn({
	has_serial_no: 1,
	serial_no_series: ""
}).needs_serials === true);
var RETURN_CTX_KEYS = [
	"auto_batch",
	"auto_serial",
	"needs_batch_number",
	"needs_serials"
];
var dialogSrc = readFileSync(new URL("../../src/pages/Store/stock-balance/ReturnToStock.jsx", import.meta.url), "utf8");
for (const key of RETURN_CTX_KEYS) ok(`return: the dialog reads context.${key}`, dialogSrc.includes(`?.${key}`) || dialogSrc.includes(`ctx.${key}`), "unused contract key -- either the dialog or the server changed");
ok("return: the dialog renders no batch field unless the server says it is needed", /effective\?\.needs_batch_number/.test(dialogSrc));
ok("return: the dialog renders no serial field unless the server says it is needed", /effective\?\.needs_serials/.test(dialogSrc));
ok("return: the dialog offers the same-item vs new-item choice the user asked for", dialogSrc.includes("t(\"store.returnStock.useSameItem\")") && dialogSrc.includes("t(\"store.returnStock.createNewItem\")"));
var readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
var actionBarSrc = readSrc("../../src/components/ActionBar/index.jsx");
var filterFieldsSrc = readSrc("../../src/components/FilterModal/FilterFields.jsx");
var balanceSrc = readSrc("../../src/pages/Store/stock-balance/index.jsx");
ok("toolbar: inline search takes a fixed slot instead of half the row", /showInline \? "w-56 shrink-0" : "w-full sm:w-1\/2 sm:flex-none"/.test(actionBarSrc));
ok("toolbar: the action cluster yields the slack only when inline", /showInline \? "ml-auto" : "flex-1"/.test(actionBarSrc) && /"flex shrink-0 flex-wrap items-center justify-end gap-1\.5"/.test(actionBarSrc), "inline: ml-auto lets the filter row grow. NOT inline: flex-1 pins the actions right");
ok("toolbar: the result-count pill never grows", /inline-flex h-7 shrink-0 items-center/.test(actionBarSrc));
ok("toolbar: the filter row may shrink and wraps internally", /"flex min-w-0 flex-1 flex-wrap items-start gap-2"/.test(actionBarSrc));
ok("toolbar: inline filters align from the top so mixed-height labels stay level", /inline \? "flex flex-wrap items-start gap-2" : "grid grid-cols-1 gap-3"/.test(filterFieldsSrc));
var balanceFilterCount = (balanceSrc.match(/field: "/g) || []).length;
var px = (name) => Number(actionBarSrc.match(new RegExp(name + " = (\\d+)"))[1]);
var declaredNeeds = px("INLINE_SEARCH_PX") + px("INLINE_RESULT_PX") + px("INLINE_FILTER_PX") * balanceFilterCount + 140;
var realNeeds = 320 + balanceFilterCount * 168 + 120 + 32;
ok("toolbar: the inline threshold is not optimistic", balanceFilterCount === 5 && declaredNeeds >= realNeeds - 40, `declared ${declaredNeeds}px vs ~${realNeeds}px for ${balanceFilterCount} filters`);
var walk = (dir, out = []) => {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const q = `${dir}/${e.name}`;
		if (e.isDirectory()) walk(q, out);
		else if (e.name.endsWith(".jsx")) out.push(q);
	}
	return out;
};
var norm = (q) => q.replace(/\$\{[^}]*\}/g, ":p").split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
var pat = (q) => "^/" + norm(q).split("/").filter(Boolean).map((s) => s.startsWith(":") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/") + "/?$";
var appRouteSrc = readSrc("../../src/App.jsx");
var allRoutes = [...appRouteSrc.matchAll(/path="([^"]*)"/g)].map((m) => m[1]).filter((r) => r.startsWith("/"));
var allPats = allRoutes.map((r) => [r, new RegExp(pat(r))]);
var genericPats = allRoutes.filter((r) => r.includes(":doctype")).map((r) => [r, new RegExp(pat(r))]);
var specificPats = allPats.filter(([r]) => !r.includes(":doctype") && !r.includes(":hub"));
var hubWide = allRoutes.filter((r) => !norm(r).split("/").filter(Boolean)[0]?.startsWith(":")).map((r) => new RegExp(pat("/" + [":hub", ...norm(r).split("/").filter(Boolean).slice(1)].join("/"))));
var navTargets = [];
for (const file of walk(new URL("../../src", import.meta.url).pathname)) {
	if (file.endsWith("/App.jsx")) continue;
	for (const m of readFileSync(file, "utf8").matchAll(/navigate\(\s*(`[^`]*`|"[^"]*")/g)) navTargets.push([file.replace(/.*\/src\//, ""), m[1].slice(1, -1)]);
}
var knownDoctypes = new Set(Object.keys(DOCTYPE_CONFIG));
var unresolvedNav = [];
var wrongDoctypeNav = [];
for (const [file, raw] of navTargets) {
	if (!raw.startsWith("/")) continue;
	const n = norm(raw);
	if (!(n.startsWith("/:p/") ? allPats.map(([, rx]) => rx).concat(hubWide) : allPats.map(([, rx]) => rx)).some((rx) => rx.test(n))) {
		unresolvedNav.push([file, raw]);
		continue;
	}
	if (specificPats.some(([, rx]) => rx.test(n))) continue;
	const hits = genericPats.filter(([, rx]) => rx.test(n));
	if (!hits.length) continue;
	const idx = Math.min(...hits.map(([r]) => norm(r).split("/").filter(Boolean).indexOf(":doctype")));
	const val = decodeURIComponent(n.split("/")[idx + 1]);
	if (val === ":p") continue;
	if (!knownDoctypes.has(val)) wrongDoctypeNav.push([
		file,
		raw,
		val
	]);
}
ok("routes: every navigate() target resolves to a registered route", unresolvedNav.length === 0, unresolvedNav.map(([f, r]) => `${r} in ${f}`));
ok("routes: a target matched ONLY by a generic :doctype route names a real doctype", wrongDoctypeNav.length === 0, wrongDoctypeNav.map(([f, r, v]) => `${r} -> doctype ${JSON.stringify(v)} in ${f}`));
ok("routes: /store/delivery/:name is registered", /path="\/store\/delivery\/:name"/.test(appRouteSrc));
ok("routes: nothing navigates to the never-registered /quality-templates", !navTargets.some(([, r]) => norm(r) === "/quality-templates"));
ok("routes: no duplicate path= registrations", allRoutes.length === new Set(allRoutes).size, allRoutes.filter((r, i) => allRoutes.indexOf(r) !== i));
var stripJsComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
var stripPyComments = (src) => src.replace(/"""[\s\S]*?"""/, "").split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");
var checkinFn = apiSource.slice(apiSource.indexOf("def get_checkin_logs("), apiSource.indexOf("@frappe.whitelist", apiSource.indexOf("def get_checkin_logs(")));
var checkinCode = stripPyComments(checkinFn);
ok("checkin: the endpoint resolves its columns from the live meta, not literals", /meta\.has_field/.test(checkinCode) && /"time", "checkin_time"/.test(checkinCode), "a hardcoded column name is exactly what broke the client version");
ok("checkin: no reference to a field that never existed on the doctype", !/\bcheckout_time\b/.test(checkinCode), "checkout_time has never existed on Employee Checkin");
ok("checkin: the SQL is built from resolved columns, never literal field names", /\.join\(select\)/.test(checkinCode) && /order by `\{time_field\}`/.test(checkinCode), "a literal column in the f-string is the bug being fixed");
ok("checkin: it fails closed on the doctype permission", /frappe\.has_permission\("Employee Checkin", "read"\)/.test(checkinFn));
ok("checkin: it fails closed on the punch-time permlevel rather than returning blank", /get_permlevel_access/.test(checkinFn) && /permlevel/.test(checkinFn), "otherwise a missing permlevel looks exactly like 'no punches today'");
ok("checkin: the day is a bounded range when only the Datetime exists", /between %s and %s/.test(checkinFn) && /00:00:00/.test(checkinFn));
var checkinClientCode = stripJsComments(readSrc("../../src/components/CheckinLogs.jsx"));
ok("checkin: the client calls the endpoint, not the raw resource route", /method\/erpnext_ui\.api\.get_checkin_logs/.test(checkinClientCode) && !/resource\/Employee Checkin/.test(checkinClientCode));
ok("checkin: the employee's employee is optional and defaults to null", /CheckinLogs\(\{ employee = null, date[,}]/.test(checkinClientCode) && /\{ employee, date[ ,]/.test(checkinClientCode), "a required employee would force the ESS calendar to send one");
var gateStart = checkinCode.indexOf("if employee != my_employee:");
var gateEnd = checkinCode.indexOf("frappe.has_permission(\"Employee\", \"read\"", gateStart);
var employeeGate = gateStart === -1 ? "" : checkinCode.slice(gateStart, gateEnd);
ok("checkin: naming another employee passes through _get_scope", /_get_scope\(frappe\.session\.user\)/.test(checkinCode), "employee codes are guessable; an unauthorised check would expose anyone's punches");
ok("checkin: the other-employee gate really gates (throws, and consults scope)", /frappe\.throw/.test(employeeGate) && /PermissionError/.test(employeeGate) && /can_view_others/.test(employeeGate), "the gate must throw when the scope refuses, not merely exist");
ok("checkin: the gate never falls back to the caller's own employee", !/employee\s*=\s*my_employee/.test(employeeGate), "substituting would show one person's punches under another's name");
ok("checkin: the named Employee must additionally be readable", /frappe\.has_permission\("Employee", "read", employee\)/.test(checkinCode));
ok("checkin: a department-restricted scope is honoured, not just can_view_others", /allowed_departments"\] is not None/.test(employeeGate) && /department in scope\["allowed_departments"\]/.test(employeeGate), "an HOD scoped to their own departments must not see the rest");
ok("checkin: the attendance report passes its row's employee", /<CheckinLogs employee=\{selectedEmployee\} date=\{selectedDate\} \/>/.test(readSrc("../../src/pages/Reports/attendance/AttendancePage.jsx")));
ok("checkin: the report opens the log for Half Day and Late, not just Present", /\["Present", "Half Day", "Late"\]\.includes\(status\)/.test(readSrc("../../src/pages/Reports/attendance/AttendancePage.jsx")));
ok("checkin: the client renders log_type as the direction, not a checkout column", /log\.log_type/.test(checkinClientCode) && !/checkout_time/.test(checkinClientCode));
ok("checkin: a load failure is surfaced, not swallowed into an empty list", /setError/.test(checkinClientCode) && /reports\.checkinLogsError/.test(checkinClientCode), "an empty list is indistinguishable from 'you had no punches'");
var apiClientSrc = readSrc("../../src/services/api.jsx");
ok("query params: null/undefined are dropped before serialising", /v !== null && v !== undefined/.test(apiClientSrc) && /new URLSearchParams\(clean\)/.test(apiClientSrc), "URLSearchParams turns a null value into the string 'null'");
ok("query params: an empty string is still sent", /v !== null && v !== undefined/.test(apiClientSrc) && !/v !== ""/.test(apiClientSrc), "\"\" is a deliberate \"no filter\" for filter fields and must survive");
ok("checkin: the server treats a literal null/undefined/empty as no employee", /if employee in \("", "null", "undefined", "None"\):\s*\n\s*employee = None/.test(checkinFn) && /if date in \("", "null", "undefined", "None"\):\s*\n\s*date = None/.test(checkinFn), "query params arrive as strings, so 'absent' has to be detected by spelling");
ok("checkin: normalisation happens BEFORE the employee is used", checkinCode.indexOf("if employee in (\"\", \"null\"") < checkinCode.indexOf("scope = _get_scope(") && checkinCode.indexOf("if employee in (\"\", \"null\"") < checkinCode.indexOf("employee = employee or my_employee"), "normalising after the fallback has already chosen is too late");
var essAttendanceSrc = readSrc("../../src/pages/ESS/Attendance.jsx");
ok("attendance popup: the in/out summary is suppressed once the log lists punches", /dayHasPunches === false && activeDay\.att\?\.in_time/.test(essAttendanceSrc) && /dayHasPunches === false && activeDay\.att\?\.out_time/.test(essAttendanceSrc), "otherwise a half day renders its first and last punch a second time below");
ok("attendance popup: the state is tri-state so the summary cannot flash while loading", /useState\(null\)/.test(essAttendanceSrc.slice(essAttendanceSrc.indexOf("dayHasPunches"), essAttendanceSrc.indexOf("dayHasPunches") + 200)) && /setDayHasPunches\(null\)/.test(essAttendanceSrc), "a boolean renders the summary for a frame and then pulls it away");
ok("attendance popup: the log tells the parent how many punches it found", /onResult=\{\(\{ count \}\) => setDayHasPunches\(count > 0\)\}/.test(essAttendanceSrc));
ok("attendance popup: onResult is NOT a fetch dependency (refetch loop otherwise)", /}, \[employee, date\]\);/.test(checkinClientCode) && !/}, \[employee, date, onResult\]\);/.test(checkinClientCode), "an inline arrow changes identity each render: effect -> onResult -> render -> new arrow -> effect");
var workbenchCode = stripJsComments(readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptItemWorkbench.jsx"));
var lineFormSrc = readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx");
var receiptFormSrc = readSrc("../../src/pages/Store/purchase-receipt/form/index.jsx");
var receiptFormCode = stripJsComments(receiptFormSrc);
ok("receipt picker: the workbench is itself the single dialog", /<AppModal/.test(workbenchCode) && (workbenchCode.match(/<AppModal/g) || []).length === 1);
ok("receipt picker: no second dialog is opened from inside it", !/ReceiptLineDialog/.test(workbenchCode) && !/<AppModal[\s\S]*<AppModal/.test(workbenchCode), "that is the stacked-overlay bug, verbatim");
ok("receipt picker: the modal scrolls internally so the page never grows", /width="xl"/.test(workbenchCode) && /max-h-\[/.test(workbenchCode));
ok("receipt picker: the tray Edit dialog is NOT gated on the purpose", !/\{fromPo \? null : \(\s*<ReceiptLineDialog/.test(receiptFormCode), "on a PO receipt this left the Edit button setting state nothing rendered");
ok("receipt picker: the line dialog opens only while the workbench is closed", /show=\{!!editingRow && !pickerOpen\}/.test(receiptFormCode), "picking a line also sets `editing`, and that must show in the workbench pane");
ok("receipt picker: the tray Edit button opens the line dialog", /onClick=\{\(\) => setEditing\(row\._rid\)\}/.test(receiptFormCode));
ok("receipt picker: the workbench has both sections in one render", (workbenchCode.match(/<section/g) || []).length === 2, "one surface, two sections");
ok("receipt picker: split panes from md up", /md:grid-cols-\[/.test(workbenchCode));
ok("receipt picker: one pane at a time below md, via CSS not a media query", /pane === "list" \? "flex" : "hidden md:flex"/.test(workbenchCode) && /pane === "form" \? "flex" : "hidden md:flex"/.test(workbenchCode) && !/useIsMobile|matchMedia/.test(workbenchCode), "a JS breakpoint disagrees with the stylesheet after a resize");
ok("receipt picker: the Back control itself returns to the list pane", /onClick=\{\(\) => setPane\("list"\)\}/.test(workbenchCode) && /ArrowLeft/.test(workbenchCode) && /md:hidden/.test(workbenchCode), "a dead Back button strands the user on the form with no route to the list");
ok("receipt picker: choosing a line swaps to the form pane", /const choose = \(line\) => \{[\s\S]{0,160}setPane\("form"\)/.test(workbenchCode));
ok("receipt picker: the empty state asks for a pick instead of blank space", /picker\.pickFirst/.test(workbenchCode));
ok("receipt picker: the old picker is gone and nothing imports it", !existsSync(new URL("../../src/pages/Store/purchase-receipt/components/ReceiptItemPicker.jsx", import.meta.url)));
ok("receipt picker: the line form is shared, so the two entry points cannot drift", /<ReceiptLineForm/.test(workbenchCode) && /<ReceiptLineForm/.test(readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineDialog.jsx")), "two copies of the measured-total logic would drift");
ok("receipt picker: the derived factor stays read-only in the shared form", /t\("store\.receipt\.factor"\)/.test(lineFormSrc) && !/name="conversion_factor"[^]*?Input/.test(lineFormSrc));
ok("receipt picker: the workbench renders the form, not a second dialog", /<ReceiptItemWorkbench/.test(receiptFormSrc) && !/<ReceiptItemPicker/.test(receiptFormSrc));
var mrSrc = readSrc("../../src/pages/Store/material-request/form/index.jsx");
var mrCode = stripJsComments(mrSrc);
ok("material request: the production project is chosen once, on the header", /isProjectDriven = purpose === "production"/.test(mrCode) && /doctype="Project"[\s\S]{0,120}handleHeaderProjectChange/.test(mrCode), "a per-row project means transcribing one BOM once per line");
ok("material request: choosing the project fills the items from its BOM", /get_project_items/.test(mrSrc) && /bomAdded/.test(mrCode) && /outstanding_qty/.test(mrCode), "the endpoint already returns BOM lines; the form must consume them");
ok("material request: filling is additive -- existing rows and duplicates survive", /const onDoc = new Set\([\s\S]{0,140}doc\.items\.map\(\(r\) => r\.item_code\)/.test(mrCode) && /onDoc\.has\(it\.item_code\)/.test(mrCode) && /const filled = withProject\.filter\(\(r\) => r\.item_code\)/.test(mrCode), "re-picking a project must not discard a typed row or duplicate a line");
ok("material request: exactly one spare empty row is left at the end", /empties\.slice\(0, 1\)/.test(mrCode), "the user needs somewhere to add the next item");
ok("material request: quantity defaults to the OUTSTANDING gap, not the BOM qty", /outstanding > 0 \? outstanding : it\.required_qty/.test(mrCode), "re-requesting what is already pending is how duplicate indents happen");
ok("material request: the header project never reaches the server as a header field", /const \{ project: _formProject, \.\.\.payload \} = current/.test(mrCode) && /doc: payload/.test(mrCode), "Material Request has no header project column; the rows carry it");
ok("material request: an existing indent recovers its header project from the rows", /find\(\(r\) => r\.project\)\?\.project/.test(mrCode), "otherwise editing blanks every row when the empty box is cleared");
ok("material request: the per-row project is hidden where the header owns it", /\{!isProjectDriven \? \([\s\S]{0,220}projectOptional/.test(mrCode), "two controls that can disagree are worse than one");
var DASHBOARDS = [
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
	"../../src/pages/Store/index.jsx"
];
ok("dashboard: the hero component is gone", !existsSync(new URL("../../src/components/dashboard/DashboardHero.jsx", import.meta.url)));
ok("dashboard: no dashboard renders a hero", DASHBOARDS.every((rel) => {
	const src = stripJsComments(readSrc(rel));
	return !/DashboardHero/.test(src);
}), DASHBOARDS.filter((rel) => /DashboardHero/.test(stripJsComments(readSrc(rel)))));
ok("dashboard: the never-rendered quickAccess key is gone from every locale", [
	"en",
	"hi",
	"ar"
].every((l) => !/"quickAccess"/.test(readSrc(`../../src/i18n/locales/${l}/translation.json`))));
ok("dashboard: every hero subtitle is still shown by setHeader", [
	"../../src/components/Approval/index.jsx",
	"../../src/pages/Sales/index.jsx",
	"../../src/pages/Quality/index.jsx",
	"../../src/pages/Dashboard/index.jsx",
	"../../src/pages/HR/index.jsx",
	"../../src/pages/Production/index.jsx",
	"../../src/pages/Purchase/index.jsx",
	"../../src/pages/Reports/index.jsx"
].every((rel) => /subtitle:/.test(stripJsComments(readSrc(rel)))), "the hero repeated this text; deleting it must not orphan the string");
var SERIAL_INFO = {
	stock_uom: "Kg",
	has_serial_no: 1,
	serial_no_series: ""
};
var AUTO_SERIAL_INFO = {
	stock_uom: "Kg",
	has_serial_no: 1,
	serial_no_series: "SN-.#####"
};
ok("serials: the count is per STOCK unit, not per transaction unit", serialCount({
	uom: "Nos",
	stock_uom: "Kg",
	qty: 10,
	stock_qty: 13
}) === 13, "10 Nos weighing 13 Kg needs 13 serials, not 10");
ok("serials: a serialised item refuses a fractional stock qty", validateSerials({
	qty: 10,
	stock_qty: 12.5
}, SERIAL_INFO) === "store.receipt.validation.serialWholeStockQty", "12.5 Kg cannot have 12.5 serials; this is the save failure, caught early");
ok("serials: a whole stock qty passes the whole-number gate", validateSerials({
	qty: 10,
	stock_qty: 13,
	serial_no: "a\nb\nc"
}, SERIAL_INFO) === null || validateSerials({
	qty: 10,
	stock_qty: 13,
	serial_no: ""
}, SERIAL_INFO) === "store.receipt.validation.serialCountMismatch", "the count gate still applies once the qty is whole");
ok("serials: the typed list must match the expected count exactly", validateSerials({
	qty: 10,
	stock_qty: 3,
	serial_no: "a\nb"
}, SERIAL_INFO) === "store.receipt.validation.serialCountMismatch");
ok("serials: a repeated serial is rejected", validateSerials({
	qty: 2,
	stock_qty: 2,
	serial_no: "a\na"
}, SERIAL_INFO) === "store.receipt.validation.serialDuplicate");
ok("serials: a series means nothing has to be typed", serialsAreGenerated(AUTO_SERIAL_INFO) && !serialsAreGenerated(SERIAL_INFO) && validateSerials({
	qty: 10,
	stock_qty: 13,
	serial_no: ""
}, AUTO_SERIAL_INFO) === null);
ok("serials: an unserialised item is untouched by all of this", !needsSerials({ stock_uom: "Kg" }) && validateSerials({
	qty: 10,
	stock_qty: 12.5
}, { stock_uom: "Kg" }) === null, "a fractional Kg line that is not serialised is perfectly legal");
ok("serials: a missing or zero quantity is reported before the count", validateSerials({
	qty: "",
	stock_qty: ""
}, SERIAL_INFO) === "store.receipt.validation.serialNeedsQty" && validateSerials({
	qty: 1,
	stock_qty: 0
}, SERIAL_INFO) === "store.receipt.validation.serialNeedsPositiveQty");
ok("serials: parsing matches ERPNext's own newline split", parseSerials("a\n\n b \nc\n").join(",") === "a,b,c");
ok("serials: per-serial weight is 1 stock unit and the value is the row rate", perSerialFigures({
	qty: 10,
	stock_qty: 13,
	rate: 250
}).weightPerSerial === 1 && perSerialFigures({
	qty: 10,
	stock_qty: 13,
	rate: 250
}).ratePerSerial === 250, "derived, never an input -- neither doctype has a per-serial weight field");
ok("batches: required, auto, or absent, per the item flags", batchRule({ has_batch_no: 0 }) === "none" && batchRule({
	has_batch_no: 1,
	create_new_batch: 1,
	batch_number_series: "B-.####"
}) === "auto" && batchRule({
	has_batch_no: 1,
	create_new_batch: 0
}) === "required" && validateBatch({ batch_no: "" }, {
	has_batch_no: 1,
	create_new_batch: 0
}) === "store.receipt.validation.batchRequired" && validateBatch({}, {
	has_batch_no: 1,
	create_new_batch: 1,
	batch_number_series: "B-.####"
}) === null);
var uomOptionsFn = apiSource.slice(apiSource.indexOf("def get_item_uom_options("), apiSource.indexOf("@frappe.whitelist", apiSource.indexOf("def get_item_uom_options(")));
var KG_ITEM = {
	stock_uom: "Kg",
	uoms: [{
		uom: "Nos",
		must_be_whole_number: 0
	}, {
		uom: "Kg",
		must_be_whole_number: 0
	}]
};
var LTR_ITEM = {
	...KG_ITEM,
	stock_uom: "Ltr"
};
ok("conversion: Nos to Kg derives the factor from the measured weight", (() => {
	const c = conversionPreview({
		qty: 10,
		measured_total: 25.4,
		uom: "Nos"
	}, KG_ITEM, "Nos");
	return c && c.from === "Nos" && c.to === "Kg" && c.perUnit === 2.54;
})(), "10 pieces weighing 25.4 Kg is 2.54 Kg each");
ok("conversion: Nos to Ltr works the same way (not hardcoded to Kg)", (() => {
	const c = conversionPreview({
		qty: 10,
		measured_total: 4,
		uom: "Nos"
	}, LTR_ITEM, "Nos");
	return c && c.to === "Ltr" && c.perUnit === .4;
})());
ok("conversion: both units of the delivery are reported, not just the factor", (() => {
	const c = conversionPreview({
		qty: 10,
		measured_total: 25.4,
		uom: "Nos"
	}, KG_ITEM, "Nos");
	return c.thisQty === 10 && c.thisTotal === 25.4;
})());
ok("conversion: no readout when the received UOM IS the stock UOM", conversionPreview({
	qty: 10,
	uom: "Kg"
}, KG_ITEM, "Kg") === null, "'1 Kg = 1 Kg' is noise");
ok("conversion: the factor is shown before a weight is typed", (() => {
	const c = conversionPreview({
		qty: 10,
		uom: "Nos"
	}, KG_ITEM, "Nos");
	return c !== null && c.perUnit === null && c.thisTotal === null;
})(), "the relationship is the point; it should not wait for the numbers");
ok("conversion: the form shows the calculation, not just the stored factor", /conversionPreview/.test(readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx")) && /store\.receipt\.conversion/.test(readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx")));
ok("conversion: the PO UOM stays locked, because ERPNext compares it", /isPoRow \? \(\s*<div className="flex items-center gap-2">/.test(readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx")) && /uomFromPo/.test(readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx")), "purchase_receipt.py:315 puts uom in compare_fields -- changing it fails the save");
ok("serials: the endpoint reports the item's serial and batch configuration", /"has_serial_no": cint\(tracking\.get\("has_serial_no"\)\)/.test(uomOptionsFn) && /"serial_no_series": tracking\.get/.test(uomOptionsFn) && /"has_batch_no": cint\(tracking\.get\("has_batch_no"\)\)/.test(uomOptionsFn) && /"create_new_batch": cint\(tracking\.get\("create_new_batch"\)\)/.test(uomOptionsFn) && /"batch_number_series": tracking\.get/.test(uomOptionsFn), "without these the form cannot tell a serialised item from a plain one");
ok("serials: the form saves ONLY when both gates pass", /validateSerials\(row, info\)/.test(receiptFormSrc) && /validateBatch\(row, info\)/.test(receiptFormSrc), "without these the failure surfaces from ERPNext as a bundle total mismatch");
var PO_FALLBACK = {
	conversion_factor: 1e3,
	conversion_source: "purchase_order"
};
var PO_ROW = {
	uom: "Nos",
	stock_uom: "Kg",
	qty: 10,
	measured_total: "",
	conversion_factor: 1e3,
	conversion_source: "purchase_order",
	stock_qty: 1e4
};
ok("conversion: the PO factor survives when no weight is entered", applyMeasuredTotal(PO_ROW, "", PO_FALLBACK).conversion_factor === 1e3 && applyMeasuredTotal(PO_ROW, "", PO_FALLBACK).stock_qty === 1e4, "the live bug: factor 1 with the PO's stock_qty books 10 Kg");
ok("conversion: a weight overrides the ordered rate", applyMeasuredTotal(PO_ROW, 1200, PO_FALLBACK).conversion_factor === 120 && applyMeasuredTotal(PO_ROW, 1200, PO_FALLBACK).stock_qty === 1200);
ok("conversion: clearing a weight restores the ordered rate, not factor 1", (() => {
	const cleared = applyMeasuredTotal(applyMeasuredTotal(PO_ROW, 1200, PO_FALLBACK), "", PO_FALLBACK);
	return cleared.conversion_factor === 1e3 && cleared.stock_qty === 1e4;
})(), "stranding the row at 1 is the silent-under-receipt bug again");
ok("conversion: no fallback and no weight falls back to factor 1 AND says so", (() => {
	const r = applyMeasuredTotal({
		uom: "Nos",
		stock_uom: "Kg",
		qty: 10,
		measured_total: ""
	}, "", null);
	return r.conversion_factor === 1 && r.conversion_source === "default";
})());
ok("conversion: a factor of 1 is not treated as missing", hasUsableFactor({
	conversion_source: "purchase_order",
	conversion_factor: 1
}) && !hasUsableFactor({
	conversion_source: "default",
	conversion_factor: 1
}), "1 Nos = 1 Kg is a real rate for a light item; magnitude proves nothing");
ok("conversion: quantity edits recompute stock_qty from the factor", (() => {
	const r = applyQuantity(PO_ROW, 12, PO_FALLBACK);
	return r.stock_qty === 12e3 && r.conversion_factor === 1e3;
})(), "otherwise 10 -> 12 Nos still posts the old 10,000 Kg");
ok("conversion: a quantity edit keeps a measured factor", applyQuantity(applyMeasuredTotal(PO_ROW, 1200, PO_FALLBACK), 12, PO_FALLBACK).stock_qty === 1200, "weight is the numerator; it does not scale with the piece count");
ok("conversion: the basis tells the UI which number it is showing", conversionBasis({ conversion_source: "measured" }) === "measured" && conversionBasis({ conversion_source: "purchase_order" }) === "purchase_order" && conversionBasis({ conversion_source: "default" }) === "unresolved");
ok("conversion: an unweighed PO line passes validation", validateLineRow(PO_ROW, KG_ITEM, (k) => k) === null, "a delivery with no weighbridge must still be receivable");
ok("conversion: a line with no factor AND no weight is still blocked", validateLineRow({
	uom: "Nos",
	stock_uom: "Kg",
	qty: 10,
	measured_total: "",
	conversion_source: "default"
}, KG_ITEM, (k) => k) === "store.receipt.validation.totalRequired", "posting factor 1 there would book the piece count as stock");
var receiptLineFormSrc = readSrc("../../src/pages/Store/purchase-receipt/components/ReceiptLineForm.jsx");
ok("conversion: a quantity edit routes through applyQuantity", /"qty" in patch/.test(lineFormSrc) && /applyQuantity\(next, next\.qty, fallback\)/.test(lineFormSrc), "without it 10 -> 12 Nos still posts the old 10,000 Kg");
ok("conversion: the ordered rate is threaded in so clearing a weight restores it", /factor_from_po/.test(lineFormSrc) && /factor_source_po/.test(lineFormSrc) && /factor_from_po/.test(receiptFormSrc));
ok("conversion: the form keeps the mapper's factor instead of hardcoding 1", /conversion_factor: r\.conversion_factor \?\? ""/.test(receiptFormSrc) && /conversion_factor: poFactor/.test(receiptFormSrc), "the mapper already returns the PO rate");
ok("conversion: a zero or absent PO factor is not trusted", /Number\.isFinite\(poFactor\) && poFactor > 0/.test(receiptFormSrc), "TEST-KG-NOS carries 0.0 on its Nos row; a truthiness test would accept it");
var ORDERED_10 = {
	...PO_ROW,
	pending_qty: 10
};
ok("partial: one sheet out of ten takes the ordered rate", (() => {
	const r = applyQuantity(ORDERED_10, 1, PO_FALLBACK);
	return r.qty === 1 && r.conversion_factor === 1e3 && r.stock_qty === 1e3;
})(), "under-receipt is legal; the factor comes from the order");
ok("partial: that one sheet weighing 1200 instead of 1000 overrides the rate", (() => {
	const r = applyMeasuredTotal(applyQuantity(ORDERED_10, 1, PO_FALLBACK), 1200, PO_FALLBACK);
	return r.conversion_factor === 1200 && r.stock_qty === 1200;
})());
ok("partial: mixed weights still total exactly right on one line", applyMeasuredTotal({
	...PO_ROW,
	qty: 5
}, 5200, PO_FALLBACK).stock_qty === 5200, "5 sheets totalling 5200 Kg must book 5200 Kg, however they were mixed");
ok("partial: a factor of 1 on the order is not confused with an absent one", conversionDrift({
	conversion_factor: 1,
	factor_from_po: 1
}) === 1);
ok("partial: drift is null without both numbers", conversionDrift({
	conversion_factor: 1e3,
	factor_from_po: null
}) === null && conversionDrift({
	conversion_factor: null,
	factor_from_po: 1e3
}) === null);
ok("partial: ordinary variation does not warn", !conversionDriftSuspicious({
	conversion_factor: 1200,
	factor_from_po: 1e3
}) && !conversionDriftSuspicious({
	conversion_factor: 1040,
	factor_from_po: 1e3
}), "a 4% spread across mixed sheets is normal, not an error");
ok("partial: a doubling DOES warn, on the boundary", conversionDriftSuspicious({
	conversion_factor: 2e3,
	factor_from_po: 1e3
}) && conversionDriftSuspicious({
	conversion_factor: 400,
	factor_from_po: 1e3
}), "a whole delivery's weight on one line is the classic slip, and it lands exactly on 2x");
ok("partial: the UI states what is outstanding so reducing the qty is expected", /store\.receipt\.receivingOf"/.test(receiptLineFormSrc) && /store\.receipt\.receivingAll"/.test(receiptLineFormSrc) && /row\.pending_qty/.test(receiptLineFormSrc), "the row opens holding the full outstanding qty, which reads as mandatory");
ok("partial: the picked line carries the outstanding quantity through", /pending_qty: line\.pending_qty/.test(receiptFormSrc));
var indexCssSrc = readSrc("../../src/index.css");
var cursorRuleAt = indexCssSrc.indexOf("button:not(:disabled)");
var enclosingBase = null;
{
	const lastBase = indexCssSrc.lastIndexOf("@layer base {", cursorRuleAt);
	if (lastBase !== -1) {
		let depth = 1;
		for (let i = lastBase + 13; i < indexCssSrc.length; i++) if (indexCssSrc[i] === "{") depth++;
		else if (indexCssSrc[i] === "}" && --depth === 0) {
			enclosingBase = indexCssSrc.slice(lastBase, i + 1);
			break;
		}
	}
}
ok("the cursor rule lives in @layer base so Tailwind utilities still override it", cursorRuleAt !== -1 && enclosingBase !== null && enclosingBase.includes("cursor: pointer"), "button:not(:disabled) ... cursor: pointer must sit inside a @layer base block");
ok("the cursor rule covers Radix's role-based menu/listbox items, not just <button>", enclosingBase !== null && [
	"role=\"menuitem\"",
	"role=\"menuitemcheckbox\"",
	"role=\"menuitemradio\"",
	"role=\"option\""
].every((r) => enclosingBase.includes(`[${r}]`)), "every DropdownMenuItem (role=menuitem) and SelectItem (role=option) needs it");
for (const [rel, label] of [
	["../../src/components/ui/select.jsx", "SelectTrigger"],
	["../../src/components/ui/tabs.jsx", "TabsTrigger"],
	["../../src/components/ui/checkbox.jsx", "CheckboxPrimitive.Root"],
	["../../src/components/ui/switch.jsx", "SwitchPrimitive.Root"]
]) {
	const src = readSrc(rel);
	const at = src.indexOf(label);
	const region = at === -1 ? "" : src.slice(at, at + 700);
	ok(`${label} carries cursor-pointer`, region.includes("cursor-pointer"), `${rel}: no cursor-pointer near ${label}`);
}
ok("dropdown-menu.jsx no longer requests cursor-default on any item", !readSrc("../../src/components/ui/dropdown-menu.jsx").includes("cursor-default"), "every DropdownMenuItem / CheckboxItem / RadioItem / SubTrigger is clickable");
var selectSrc = readSrc("../../src/components/ui/select.jsx");
var selectItemAt = selectSrc.indexOf("function SelectItem(");
var selectDefaults = (selectSrc.match(/cursor-default/g) || []).length;
ok("select.jsx's only remaining cursor-default is the non-interactive scroll buttons", selectItemAt !== -1 && !selectSrc.slice(selectItemAt, selectItemAt + 900).includes("cursor-default") && selectDefaults === 2, `SelectItem must be clean; found ${selectDefaults} cursor-default, expected exactly 2 (scroll up/down)`);
var customReportBlock = apiSource.match(/SPA_CUSTOM_REPORTS\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || "";
var serverReportKeys = /* @__PURE__ */ new Set();
for (const m of apiSource.matchAll(/^SPA_(?:REPORT_DOCTYPES|CUSTOM_REPORTS)\s*=\s*\{([^}]*)\}/gms)) for (const key of m[1].matchAll(/["']([\w-]+)["']\s*:/g)) serverReportKeys.add(key[1]);
ok("the api.py guard actually parsed both report maps", serverReportKeys.size >= 4, `found ${serverReportKeys.size}: ${[...serverReportKeys].join(", ")}`);
var appShellSrc = readSrc("../../src/layout/AppShell.jsx");
var reportKeyUses = [...appShellSrc.matchAll(/reportKey:\s*"([^"]+)"/g), ...appRouteSrc.matchAll(/RequireReportAccess\s+reportKey="([^"]+)"/g)].map((m) => m[1]);
ok("every reportKey used in the sidebar and route guards is declared in api.py", reportKeyUses.length > 0 && reportKeyUses.every((k) => serverReportKeys.has(k)), `undeclared: ${reportKeyUses.filter((k) => !serverReportKeys.has(k)).join(", ") || "none"} -- listed: ${reportKeyUses.join(", ")}`);
var stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
var reportNames = [...customReportBlock.matchAll(/["'][\w-]+["']\s*:\s*\(\s*["']([^"']+)["']\s*,\s*["'][^"']+["']\s*\)/g)].map((m) => m[1]);
var customReportSrc = readSrc("../../src/pages/Reports/custom-report/CustomReportPage.jsx");
var srcFiles = [
	appShellSrc,
	appRouteSrc,
	readSrc("../../src/pages/Reports/index.jsx"),
	customReportSrc
].map(stripComments);
var leaked = reportNames.filter((name) => srcFiles.some((s) => s.includes(name)));
ok("no custom Report NAME appears in the SPA -- the client only ever sends keys", reportNames.length > 0 && leaked.length === 0, leaked.length ? `report name(s) leaked into src/: ${leaked.join(", ")}` : `checked ${reportNames.length} report name(s): ${reportNames.join(", ")}`);
ok("get_custom_report_data takes a report_key, never a report name", /def get_custom_report_data\(\s*report_key\s*,/.test(apiSource) && !/def get_custom_report_data\([^)]*report_name/.test(apiSource), "signature must be (report_key, filters) and resolve the name server-side");
var probeBody = apiSource.match(/def _custom_report_availability\(([\s\S]*?)\ndef /)?.[1] || "";
ok("the visibility probe checks all three gates, not just the role table", probeBody.includes("is_permitted()") && probeBody.includes("frappe.has_permission(report.ref_doctype, \"report\"") && probeBody.includes("report.disabled"), "a probe that only checks roles would offer the tile to users get_report_doc then refuses");
ok("the run itself is authorised by get_report_doc, not by the visibility probe", /report = query_report\.get_report_doc\(report_name\)/.test(apiSource), "get_custom_report_data must re-authorise via Frappe; the probe is UX only");
var explainBody = apiSource.match(/def explain_custom_report_access\(([\s\S]*?)\ndef /)?.[1] || "";
ok("explain_custom_report_access returns booleans and role names only, no report data", explainBody.includes("\"gates\": gates") && !/get_report_result|\.execute\(|get_custom_report_data\(/.test(explainBody) && /frappe\.throw\(frappe\._\("Unknown report key\."\), frappe\.PermissionError\)/.test(explainBody), "a diagnostic that runs the report would hand a blocked user the data");
var sanitiseBody = apiSource.match(/def _sanitise_report_filters\(([\s\S]*?)\ndef /)?.[1] || "";
ok("report filters are decoded from the JSON string Frappe actually delivers", /if isinstance\(raw, str\)/.test(sanitiseBody) && /frappe\.parse_json\(raw\)/.test(sanitiseBody) && /except \(TypeError, ValueError\)/.test(sanitiseBody), "parse_json raises on malformed JSON, so the decode must be guarded");
ok("report filters normalise a Check's value with cint, not truthiness", /fieldtype == "Check"[\s\S]{0,400}?cint\(value\)/.test(sanitiseBody), "the string \"0\" is truthy, so filters.get(\"include_offcuts\") would invert");
var reportLocales = [
	"en",
	"hi",
	"ar"
].map((l) => JSON.parse(readSrc(`../../src/i18n/locales/${l}/reports.json`)).reports);
ok("the batch/warehouse count keys ship plural forms in all three languages", reportLocales.every((r) => typeof r.batchCount_one === "string" && typeof r.batchCount_other === "string" && typeof r.warehouseCount_one === "string" && typeof r.warehouseCount_other === "string" && r.batchCount === void 0), "a bare {{count}} batches renders '1 batches'; Arabic also needs two/few/many");
ok("Arabic ships every Intl plural category, since item(s) cannot express them", [
	"one",
	"two",
	"few",
	"many",
	"other"
].every((c) => typeof reportLocales[2][`warehouseCount_${c}`] === "string"), "Arabic: zero/one/two/few(3-10)/many(11-99)/other");
ok("the custom report page renders from the server's filters + columns metadata", /get_custom_report_data/.test(apiSource) && /payload\.filters/.test(customReportSrc) && /payload\.columns/.test(customReportSrc), "endpoint must return filters and columns, page must consume both");
var FLOAT = {
	fieldname: "total_weight",
	fieldtype: "Float"
};
var CURRENCY = {
	fieldname: "stock_value",
	fieldtype: "Currency"
};
var INT = {
	fieldname: "plates",
	fieldtype: "Int"
};
var LINK = {
	fieldname: "item",
	fieldtype: "Link",
	options: "Item"
};
ok("formatCell: a missing value renders as an em dash, never as 0", formatCell(null, FLOAT) === "—" && formatCell(void 0, FLOAT) === "—" && formatCell("", FLOAT) === "—" && formatCell(null, LINK) === "—", `got null->${formatCell(null, FLOAT)}, ""->${formatCell("", FLOAT)} -- a blank plate weight must not read as a real zero`);
ok("formatCell: 0 stays 0, because a real zero weight IS meaningful", formatCell(0, FLOAT) === "0" && formatCell(0, INT) === "0", `got ${formatCell(0, FLOAT)}`);
ok("formatCell: a whole-number Float prints without a trailing .0", formatCell(12, FLOAT) === "12" && formatCell(12.5, FLOAT) === "12.5", `got 12 -> ${formatCell(12, FLOAT)}, 12.5 -> ${formatCell(12.5, FLOAT)}`);
ok("formatCell: Currency keeps two decimals, Float keeps three", formatCell(1234.5, CURRENCY).endsWith(".50") && formatCell(1234.5, CURRENCY).startsWith("1,234") && formatCell(1.23456, FLOAT) === "1.235", `currency -> ${formatCell(1234.5, CURRENCY)}, float -> ${formatCell(1.23456, FLOAT)}`);
ok("formatCell: a non-numeric string in a numeric column is shown verbatim", formatCell("n/a", FLOAT) === "n/a", `got ${formatCell("n/a", FLOAT)}`);
ok("formatCell: a numeric STRING in a numeric column is formatted, not printed raw", formatCell("1.23456", FLOAT) === "1.235" && formatCell("12", FLOAT) === "12", `got "1.23456" -> ${formatCell("1.23456", FLOAT)} -- an unformatted SQL string means isFinite was applied to the raw value`);
ok("isNumericColumn covers exactly the fieldtypes that get tabular alignment", isNumericColumn(FLOAT) && isNumericColumn(CURRENCY) && isNumericColumn(INT) && !isNumericColumn(LINK) && !isNumericColumn({ fieldtype: "Data" }));
ok("seedDefault: a Check's string default normalises to an int", seedDefault({
	fieldtype: "Check",
	default: "1"
}) === 1 && seedDefault({
	fieldtype: "Check",
	default: "0"
}) === 0 && seedDefault({
	fieldtype: "Check",
	default: ""
}) === void 0, `got "1"->${seedDefault({
	fieldtype: "Check",
	default: "1"
})}, "0"->${seedDefault({
	fieldtype: "Check",
	default: "0"
})}`);
ok("seedDefault: a text default passes through, an empty one seeds nothing", seedDefault({
	fieldtype: "Data",
	default: "ALL"
}) === "ALL" && seedDefault({
	fieldtype: "Data",
	default: ""
}) === void 0);
ok("parseSelectOptions splits on newlines and drops blank lines", JSON.stringify(parseSelectOptions("Draft\n\n  Submitted  \n")) === JSON.stringify([{
	value: "Draft",
	label: "Draft"
}, {
	value: "Submitted",
	label: "Submitted"
}]), `got ${JSON.stringify(parseSelectOptions("Draft\n\n  Submitted  \n"))}`);
ok("visibleColumns drops hidden columns while the row keeps the key", visibleColumns([
	{ fieldname: "item" },
	{
		fieldname: "excluded",
		hidden: 1
	},
	{ fieldname: "total_weight" }
]).map((c) => c.fieldname).join(",") === "item,total_weight", "a hidden column must not occupy a visible cell");
var G = {
	groupBy: ["item"],
	childKey: ["warehouse", "batch"],
	sum: [
		"plates",
		"total_weight",
		"stock_value"
	],
	ratio: {
		weight_per_plate: ["total_weight", "plates"],
		value_per_kg: ["stock_value", "total_weight"]
	},
	constant: [
		"thickness",
		"length",
		"width"
	],
	mixed: ["grade"],
	countFields: [{
		field: "batch",
		labelKey: "x"
	}, {
		field: "warehouse",
		labelKey: "y"
	}]
};
var ROWS = [
	{
		item: "CORE-00042",
		warehouse: "Stores-FG",
		batch: "B-31",
		heat_number: "HT-7741",
		grade: "IS 2062",
		thickness: "10mm",
		plates: 12,
		weight_per_plate: 767.5,
		total_weight: 9210,
		stock_value: 736800,
		value_per_kg: 80
	},
	{
		item: "CORE-00042",
		warehouse: "Stores-FG",
		batch: "B-32",
		heat_number: "HT-7741",
		grade: "IS 2062",
		thickness: "10mm",
		plates: 8,
		weight_per_plate: 765,
		total_weight: 6120,
		stock_value: 489600,
		value_per_kg: 80
	},
	{
		item: "CORE-00042",
		warehouse: "Stores-WIP",
		batch: "B-44",
		heat_number: "HT-7812",
		grade: "IS 2062",
		thickness: "10mm",
		plates: 4,
		weight_per_plate: 772.5,
		total_weight: 3090,
		stock_value: 247200,
		value_per_kg: 80
	},
	{
		item: "CORE-00043",
		warehouse: "Stores-FG",
		batch: "B-51",
		heat_number: "HT-7802",
		grade: "IS 304",
		thickness: "6mm",
		plates: 6,
		weight_per_plate: 480,
		total_weight: 2880,
		stock_value: 518400,
		value_per_kg: 180
	}
];
var grouped = groupRows(ROWS, G);
var g42 = grouped[0];
var g43 = grouped[1];
ok("groupRows: one group per item, children in the report's arrival order", grouped.length === 2 && g42.label === "CORE-00042" && g43.label === "CORE-00043" && g42.children.length === 3 && g42.children[0].row.batch === "B-31" && g42.children[2].row.batch === "B-44", "the report already sorts by (item, warehouse, batch); grouping must not re-sort");
ok("groupRows: summed columns are actually summed", g42.aggregate.plates === 24 && g42.aggregate.total_weight === 18420 && g42.aggregate.stock_value === 1473600, `got plates=${g42.aggregate.plates} weight=${g42.aggregate.total_weight} value=${g42.aggregate.stock_value}`);
ok("groupRows: weight_per_plate is RECOMPUTED, not the sum of the children", Math.abs(g42.aggregate.weight_per_plate - 18420 / 24) < 1e-9 && g42.aggregate.weight_per_plate !== 2305, `got ${g42.aggregate.weight_per_plate}, expected ${18420 / 24}; summing would give 2305`);
ok("groupRows: value_per_kg is RECOMPUTED, not the sum of the children", Math.abs(g42.aggregate.value_per_kg - 1473600 / 18420) < 1e-9 && g42.aggregate.value_per_kg !== 240, `got ${g42.aggregate.value_per_kg}, expected ${1473600 / 18420}; summing would give 240`);
ok("groupRows: a constant Item attribute is carried to the parent", g42.aggregate.thickness === "10mm", `got ${g42.aggregate.thickness}`);
ok("groupRows: a unanimous mixed column takes the shared value", g42.aggregate.grade === "IS 2062" && g42.mixedFlags.grade === false, `got ${g42.aggregate.grade}`);
var mixedGroup = groupRows([{
	...ROWS[0],
	grade: "IS 2062"
}, {
	...ROWS[1],
	grade: "IS 630"
}], G)[0];
ok("groupRows: a mixed column is flagged, NOT taken from the first child", mixedGroup.mixedFlags.grade === true && mixedGroup.aggregate.grade === void 0, `first child's grade leaked through as ${mixedGroup.aggregate.grade}`);
ok("groupRows: a zero denominator yields null, never NaN or Infinity", groupRows([{
	item: "X",
	plates: 0,
	total_weight: 0,
	stock_value: 0
}], G)[0].aggregate.weight_per_plate === null && groupRows([{
	item: "X",
	plates: 5,
	total_weight: 0,
	stock_value: 0
}], G)[0].aggregate.value_per_kg === null && formatCell(groupRows([{
	item: "X",
	plates: 0,
	total_weight: 0,
	stock_value: 0
}], G)[0].aggregate.weight_per_plate, FLOAT) === "—", "a divide-by-zero must render as an em dash, not NaN");
ok("groupRows: distinct counts drive the parent's batch/warehouse subtitle", g42.counts.batch === 3 && g42.counts.warehouse === 2 && g43.counts.batch === 1, `got batches=${g42.counts.batch} warehouses=${g42.counts.warehouse}`);
ok("distinctCount ignores blank values so empties are not counted as a batch", distinctCount([
	{ batch: "B-1" },
	{ batch: "" },
	{ batch: null },
	{ batch: "B-1" }
], "batch") === 1, "a batch with no value must not inflate the subtitle");
var sumParents = grouped.reduce((a, g) => a + g.aggregate.total_weight, 0);
var sumFlat = ROWS.reduce((a, r) => a + r.total_weight, 0);
ok("groupRows: parent aggregates agree with the flat sum within epsilon", Math.abs(sumParents - sumFlat) < 1e-9, `parents=${sumParents} flat=${sumFlat} -- partial sums are not associative, so never assert equality`);
ok("isBlankCell: per-batch describing columns are blank on the parent only", isBlankCell("warehouse", "parent", G) === true && isBlankCell("batch", "parent", G) === true && isBlankCell("heat_number", "parent", G) === true && isBlankCell("warehouse", "child", G) === false && isBlankCell("plates", "parent", G) === false && isBlankCell("weight_per_plate", "parent", G) === false);
ok("isBlankCell: group and constant columns are blank on children to avoid repeating", isBlankCell("item", "child", G) === true && isBlankCell("thickness", "child", G) === true && isBlankCell("item", "parent", G) === false, "every child repeats its parent's item code and thickness otherwise");
ok("groupRows: no groupBy declared yields a single group, not an exception", groupRows(ROWS, DEFAULT_GROUP_CONFIG).length === 1 && groupRows([], DEFAULT_GROUP_CONFIG).length === 0, "the second NL report may not be grouped at all");
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
//#endregion
export {};
