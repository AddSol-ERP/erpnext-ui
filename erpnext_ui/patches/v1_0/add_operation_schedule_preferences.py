import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields({"Work Order Operation": [
		{"fieldname": "custom_preferred_start", "label": "Preferred Start", "fieldtype": "Datetime",
			"insert_after": "planned_end_time", "description": "Earliest preferred start; ERPNext may schedule later."},
		{"fieldname": "custom_preferred_end", "label": "Preferred End", "fieldtype": "Datetime",
			"insert_after": "custom_preferred_start", "description": "Target completion; final timing depends on operation duration and capacity."},
	]})
	frappe.clear_cache(doctype="Work Order Operation")
