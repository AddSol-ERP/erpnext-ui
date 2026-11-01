"""Persist the effective pricing basis alongside transaction quantities."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from erpnext_ui.patches.v1_0.add_uom_pricing_rate_field import ITEM_TABLES


def execute():
	create_custom_fields(
		{
			dt: [
				{
					"fieldname": "custom_pricing_uom",
					"fieldtype": "Link",
					"options": "UOM",
					"label": "Pricing UOM",
					"read_only": 1,
					"insert_after": "custom_chargeable_qty",
				},
				{
					"fieldname": "custom_pricing_snapshot",
					"fieldtype": "Long Text",
					"label": "Pricing Snapshot",
					"read_only": 1,
					"hidden": 1,
					"no_copy": 1,
					"insert_after": "custom_pricing_uom",
				},
			]
			for dt in ITEM_TABLES
		}
	)
