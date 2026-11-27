"""Give approval rules their own visible section in Desk and effective metadata."""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	fields = {}
	for doctype, after in (("Operation", "description"), ("BOM", "operations"), ("Work Order", "operations")):
		fields[doctype] = [
			{"fieldname": "custom_approval_rules_section", "label": "Operation Approval Rules", "fieldtype": "Section Break", "insert_after": after},
			{"fieldname": "custom_approval_rules", "label": "Approval Rules", "fieldtype": "Table", "options": "UI Operation Approval Rule", "insert_after": "custom_approval_rules_section"},
		]
	create_custom_fields(fields, update=True)
	for doctype in fields:
		frappe.clear_cache(doctype=doctype)
