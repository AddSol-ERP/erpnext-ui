"""Validate the audit context of Store direct issues."""

import frappe


def validate_direct_issue(doc, method=None):
	if not doc.get("custom_store_direct_issue"):
		return
	if doc.get("purpose") != "Material Issue":
		frappe.throw("A direct Store issue must use Material Issue.")
	for row in doc.get("items") or []:
		if not row.get("s_warehouse") and not doc.get("from_warehouse"):
			frappe.throw("Select a source warehouse for every direct issue item.")
