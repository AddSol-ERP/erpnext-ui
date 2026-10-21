"""Add UI configuration and per-reading remarks to existing quality doctypes.

The SPA stores the same versioned response configuration on the parameter
master, template child row, and inspection reading row. This lets a parameter
provide defaults, a template override those defaults, and an inspection retain
the exact criteria used even if its template changes later. No new DocTypes are
created.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

RESPONSE_CONFIG_FIELD = {
	"fieldname": "custom_response_config",
	"fieldtype": "Long Text",
	"label": "Quality Response Configuration",
	"hidden": 1,
	"print_hide": 1,
	"translatable": 0,
}

PARAMETER_REMARK_FIELD = {
	"fieldname": "custom_parameter_remarks",
	"fieldtype": "Small Text",
	"label": "Parameter Remarks",
	"print_hide": 0,
	"translatable": 0,
}


def execute() -> None:
	"""Create missing fields idempotently on ERPNext doctypes."""
	fields_by_doctype = {
		"Quality Inspection Parameter": [RESPONSE_CONFIG_FIELD],
		"Item Quality Inspection Parameter": [RESPONSE_CONFIG_FIELD],
		"Quality Inspection Reading": [RESPONSE_CONFIG_FIELD, PARAMETER_REMARK_FIELD],
	}

	for doctype, fields in fields_by_doctype.items():
		if not frappe.db.exists("DocType", doctype):
			continue

		meta = frappe.get_meta(doctype)
		missing_fields = [field for field in fields if not meta.has_field(field["fieldname"])]
		if missing_fields:
			create_custom_fields({doctype: missing_fields})
			frappe.clear_cache(doctype=doctype)
