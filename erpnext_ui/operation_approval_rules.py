"""Validation and enforcement of optional operation approvals."""

import frappe

RULE_FIELDS = ("custom_approval_stage", "custom_approval_role", "custom_approval_reason")
AUDIT_FIELDS = ("custom_approval_by", "custom_approval_at")
STAGES = ("Before Start", "Before Completion")


def validate_rules(doc):
	for row in doc.get("operations") or []:
		stage = row.get(RULE_FIELDS[0])
		role = row.get(RULE_FIELDS[1])
		reason = (row.get(RULE_FIELDS[2]) or "").strip()
		if stage and (stage not in STAGES or not role or not reason):
			frappe.throw(f"Operation row {row.idx}: select an approval role and enter a reason.")
		if not stage and (role or reason):
			frappe.throw(f"Operation row {row.idx}: select an approval stage or clear the approval details.")


def assert_allowed(card, action):
	stage = card.get(RULE_FIELDS[0])
	if stage and not card.get(AUDIT_FIELDS[0]) and (
		stage == "Before Start" or (stage == "Before Completion" and action == "complete")
	):
		frappe.throw(f"Approval required before {action}: {card.get(RULE_FIELDS[2])} (role: {card.get(RULE_FIELDS[1])}).")
