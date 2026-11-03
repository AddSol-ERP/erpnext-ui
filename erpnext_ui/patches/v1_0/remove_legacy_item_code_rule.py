"""Remove the obsolete DocType after the earlier naming-transfer patch."""

import frappe


def execute():
	if not frappe.db.exists("DocType", "UI Item Code Rule"):
		return
	# Only remove metadata after the preceding patch has transferred settings.
	# Frappe handles the DocType's fields/permissions and cache invalidation.
	frappe.delete_doc("DocType", "UI Item Code Rule", force=1, ignore_permissions=True)
