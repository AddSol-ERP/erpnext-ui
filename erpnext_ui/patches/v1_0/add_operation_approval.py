import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	fields = [
		{"fieldname": "custom_approval_stage", "label": "Approval Required", "fieldtype": "Select", "options": "\nBefore Start\nBefore Completion", "insert_after": "operation"},
		{"fieldname": "custom_approval_role", "label": "Approval Role", "fieldtype": "Link", "options": "Role", "insert_after": "custom_approval_stage"},
		{"fieldname": "custom_approval_reason", "label": "Approval Reason", "fieldtype": "Small Text", "insert_after": "custom_approval_role"},
	]
	job_fields = [{**field, "read_only": 1, "insert_after": "operation" if index == 0 else fields[index - 1]["fieldname"]} for index, field in enumerate(fields)]
	job_fields += [
		{"fieldname": "custom_approval_by", "label": "Approved By", "fieldtype": "Link", "options": "User", "read_only": 1, "insert_after": "custom_approval_reason"},
		{"fieldname": "custom_approval_at", "label": "Approved At", "fieldtype": "Datetime", "read_only": 1, "insert_after": "custom_approval_by"},
	]
	create_custom_fields({"BOM Operation": fields, "Work Order Operation": [dict(field) for field in fields], "Job Card": job_fields})
	for doctype in ("BOM Operation", "Work Order Operation", "Job Card"):
		frappe.clear_cache(doctype=doctype)
