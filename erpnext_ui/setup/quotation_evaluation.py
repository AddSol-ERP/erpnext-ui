"""Seed the initial profile without overwriting administrator choices."""

import frappe


def setup_quotation_evaluation():
	if not frappe.db.exists("DocType", "UI Quotation Evaluation Profile"):
		return
	if frappe.db.exists("UI Quotation Evaluation Profile", "Standard"):
		return
	profile = frappe.get_doc({
		"doctype": "UI Quotation Evaluation Profile",
		"profile_name": "Standard",
		"minimum_evidence": 80,
		"criteria": [
			{"criterion": "Cost", "weight": 35},
			{"criterion": "Technical fit", "weight": 30},
			{"criterion": "Delivery", "weight": 20},
			{"criterion": "Commercial terms", "weight": 10},
			{"criterion": "Supplier performance", "weight": 5},
		],
	})
	profile.insert(ignore_permissions=True)
