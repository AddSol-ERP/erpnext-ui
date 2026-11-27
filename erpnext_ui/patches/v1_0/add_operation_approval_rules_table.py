"""Install approval rule tables on the parent documents."""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	fields = {}
	for doctype, after in (("Operation", "description"), ("BOM", "operations"), ("Work Order", "operations"), ("Job Card", "operation")):
		fields[doctype] = [{"fieldname": "custom_approval_rules", "label": "Operation Approval Rules",
			"fieldtype": "Table", "options": "UI Operation Approval Rule", "insert_after": after,
			"read_only": 1 if doctype == "Job Card" else 0}]
	create_custom_fields(fields)
	for doctype in fields:
		frappe.clear_cache(doctype=doctype)
