"""Ensure `custom_rate_per_pricing_uom` shows in item grids and has a clean label."""

import frappe

ITEM_TABLES = [
	"Purchase Receipt Item",
	"Purchase Invoice Item",
	"Purchase Order Item",
	"Sales Invoice Item",
	"Sales Order Item",
	"Delivery Note Item",
	"Quotation Item",
	"Supplier Quotation Item",
	"POS Invoice Item",
]


def execute() -> None:
	try:
		for dt in ITEM_TABLES:
			cf_name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": "custom_rate_per_pricing_uom"})
			if not cf_name:
				continue
			cf = frappe.get_doc("Custom Field", cf_name)
			changed = False
			if cf.label != "Rate per UOM":
				cf.label = "Rate per UOM"
				changed = True
			if not cf.in_list_view:
				cf.in_list_view = 1
				changed = True
			if changed:
				cf.save(ignore_permissions=True)
		frappe.clear_cache()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "update_uom_pricing_rate_field_display failed")
		raise
