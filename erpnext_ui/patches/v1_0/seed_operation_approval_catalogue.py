"""Seed examples without overwriting an administrator's catalogue."""

import frappe


def execute():
	for name in ("Customer", "Quality", "Production", "Safety", "Engineering"):
		if not frappe.db.exists("UI Operation Approval Perspective", name):
			frappe.get_doc({"doctype": "UI Operation Approval Perspective", "perspective_name": name, "enabled": 1}).insert(ignore_permissions=True)
	for name, perspective, point in (
		("Approve drawing", "Customer", "Before Start"),
		("Approve material", "Customer", "Before Start"),
		("Approve finished product", "Customer", "After Work"),
		("Witness inspection", "Customer", "After Work"),
		("Verify material certificate", "Quality", "Before Start"),
		("Approve inspection plan", "Quality", "Before Start"),
		("Inspect weld", "Quality", "After Work"),
		("Verify dimensions", "Quality", "After Work"),
		("Review test results", "Quality", "After Work"),
		("Approve work permit", "Safety", "Before Start"),
		("Verify safety measures", "Safety", "Before Start"),
	):
		if not frappe.db.exists("UI Operation Approval Instruction", name):
			frappe.get_doc({"doctype": "UI Operation Approval Instruction", "instruction_name": name,
				"perspective": perspective, "approval_point": point, "enabled": 1}).insert(ignore_permissions=True)
