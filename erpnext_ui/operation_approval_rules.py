"""Validation and enforcement of optional operation approvals."""

import frappe

RULE_FIELDS = ("custom_approval_stage", "custom_approval_role", "custom_approval_reason")
AUDIT_FIELDS = ("custom_approval_by", "custom_approval_at")
STAGES = ("Before Start", "Before Completion")
COPY_FIELDS = ("approval_point", "perspective", "instruction", "instruction_snapshot", "approval_role", "note")


def validate_operation(doc, method=None):
	validate_rules(doc)


def apply_bom_defaults(doc):
	"""Copy defaults once for each newly added BOM operation row."""
	before = doc.get_doc_before_save()
	old_names = {row.name for row in (before.get("operations") or [])} if before else set()
	configured = {row.get("operation_row") for row in doc.get("custom_approval_rules") or []}
	configured_codes = {row.get("operation") for row in doc.get("custom_approval_rules") or [] if not row.get("operation_row")}
	for row in doc.get("operations") or []:
		if row.name in old_names or row.name in configured or row.get("operation") in configured_codes or not row.get("operation"):
			continue
		operation = frappe.get_doc("Operation", row.operation)
		for rule in operation.get("custom_approval_rules") or []:
			values = {field: rule.get(field) for field in COPY_FIELDS}
			values.update(operation=row.operation, operation_row=row.name)
			doc.append("custom_approval_rules", values)


def validate_rules(doc):
	operation_rows = {row.get("name"): row for row in doc.get("operations") or [] if row.get("name")}
	before = doc.get_doc_before_save() if hasattr(doc, "get_doc_before_save") else None
	previous_rules = {row.name: row for row in (before.get("custom_approval_rules") or [])} if before else {}
	for rule in doc.get("custom_approval_rules") or []:
		if doc.doctype == "Operation":
			rule.operation = doc.name
		if doc.doctype in ("BOM", "Work Order"):
			matched = operation_rows.get(rule.get("operation_row"))
			if not matched:
				matches = [row for row in operation_rows.values() if row.get("operation") == rule.get("operation")]
				if len(matches) != 1:
					frappe.throw("Select the specific operation for each approval rule.")
				matched = matches[0]
				rule.operation_row = matched.name
			if rule.get("operation") and matched.get("operation") != rule.get("operation"):
				frappe.throw("The selected operation does not match the operation row.")
			rule.operation = matched.get("operation")
		if rule.get("approval_point") not in ("Before Start", "After Work") or not rule.get("perspective") or not rule.get("instruction") or not rule.get("approval_role"):
			frappe.throw("Each approval rule requires an approval point, perspective, instruction and role.")
		if rule.get("approved_by") or rule.get("approved_at"):
			frappe.throw("Approval status can only be recorded on a job card.")
		previous = previous_rules.get(rule.get("name"))
		if previous and all(previous.get(field) == rule.get(field) for field in ("instruction", "perspective", "approval_point")):
			rule.instruction_snapshot = previous.get("instruction_snapshot")
		else:
			instruction = frappe.db.get_value("UI Operation Approval Instruction", rule.get("instruction"), ["instruction_name", "perspective", "approval_point", "enabled"], as_dict=True)
			if not instruction or not instruction.enabled or instruction.perspective != rule.get("perspective") or instruction.approval_point != rule.get("approval_point"):
				frappe.throw("Select an enabled instruction matching the perspective and approval point.")
			rule.instruction_snapshot = instruction.instruction_name
	for row in doc.get("operations") or []:
		stage = row.get(RULE_FIELDS[0])
		role = row.get(RULE_FIELDS[1])
		reason = (row.get(RULE_FIELDS[2]) or "").strip()
		if stage and (stage not in STAGES or not role or not reason):
			frappe.throw(f"Operation row {row.idx}: select an approval role and enter a reason.")
		if not stage and (role or reason):
			frappe.throw(f"Operation row {row.idx}: select an approval stage or clear the approval details.")


def pending_rules(rules, action):
	"""Return unsatisfied rules relevant to a transaction boundary.

	After-work approval gates release, not recording the work. All rules at a
	boundary must be approved independently before the boundary can be crossed.
	"""
	points = {"start": {"Before Start"}, "release": {"Before Start", "After Work"}}
	return [row for row in rules or [] if row.get("approval_point") in points.get(action, set())
		and not row.get("approved_by")]


def work_recorded(card):
	logs = card.get("time_logs") or []
	if not logs or any(not row.get("to_time") for row in logs):
		return False
	completed = sum(float(row.get("completed_qty") or 0) for row in logs)
	return completed + float(card.get("process_loss_qty") or 0) >= float(card.get("for_quantity") or 0)


def assert_allowed(card, action):
	rules = pending_rules(card.get("custom_approval_rules"), action)
	if action == "start" and work_recorded(card):
		rules += [row for row in card.get("custom_approval_rules") or [] if row.get("approval_point") == "After Work" and not row.get("approved_by")]
	if rules:
		rule = rules[0]
		instruction = rule.get("instruction_snapshot") or rule.get("instruction") or "Approval required"
		frappe.throw(f"Approval required before {action}: {instruction} (role: {rule.get('approval_role')}).")
	stage = card.get(RULE_FIELDS[0])
	if stage and not card.get(AUDIT_FIELDS[0]) and (
		stage == "Before Start" or (stage == "Before Completion" and action == "complete")
	):
		frappe.throw(f"Approval required before {action}: {card.get(RULE_FIELDS[2])} (role: {card.get(RULE_FIELDS[1])}).")
