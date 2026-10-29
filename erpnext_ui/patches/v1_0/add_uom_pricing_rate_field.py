"""Add a dedicated `custom_rate_per_pricing_uom` field to buying/selling item tables.

Storing the rate per pricing UOM separately (instead of overloading `rate`) lets
the standard ERPNext `rate`/`amount`/`net_*` fields hold the converted standard
rate, so they stay correct and update live while the user types the per-UOM rate.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

RATE_FIELD = {
	"fieldname": "custom_rate_per_pricing_uom",
	"fieldtype": "Float",
	"label": "Rate per UOM",
	"in_list_view": 1,
	"description": "Rate per the configured pricing UOM. Standard rate/amount are derived from this.",
}

ITEM_TABLES = [
	"Purchase Receipt Item",
	"Purchase Invoice Item",
	"Purchase Order Item",
	"Sales Invoice Item",
	"Sales Order Item",
	"Delivery Note Item",
	"Quotation Item",
]

FIELDS = {dt: [dict(RATE_FIELD)] for dt in ITEM_TABLES}


def execute() -> None:
	try:
		create_custom_fields(FIELDS)
		frappe.clear_cache()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "add_uom_pricing_rate_field failed")
		raise
