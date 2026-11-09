"""Persist a compact snapshot display for Print Format Builder columns."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from erpnext_ui.patches.v1_0.add_uom_pricing_rate_field import ITEM_TABLES
from erpnext_ui.print_dimensions import pricing_dimensions


def execute():
	create_custom_fields(
		{
			dt: [
				{
					"fieldname": "custom_pricing_dimensions",
					"fieldtype": "Small Text",
					"label": "Dimensions",
					"read_only": 1,
					"no_copy": 1,
					"insert_after": "custom_pricing_snapshot",
				}
			]
			for dt in ITEM_TABLES
		}
	)
	for dt in ITEM_TABLES:
		if not frappe.db.has_column(dt, "custom_pricing_snapshot"):
			continue
		if not frappe.db.has_column(dt, "custom_pricing_dimensions"):
			frappe.db.updatedb(dt)
		for row in frappe.get_all(
			dt,
			filters={"custom_pricing_snapshot": ["is", "set"]},
			fields=["name", "custom_pricing_snapshot"],
			limit_page_length=0,
		):
			frappe.db.set_value(
				dt, row.name, "custom_pricing_dimensions", pricing_dimensions(row), update_modified=False
			)
