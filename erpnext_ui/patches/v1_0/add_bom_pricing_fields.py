import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"BOM Item": [
				{
					"fieldname": "custom_pricing_uom",
					"label": "Pricing UOM",
					"fieldtype": "Link",
					"options": "UOM",
					"read_only": 1,
					"insert_after": "rate",
				},
				{
					"fieldname": "custom_rate_per_pricing_uom",
					"label": "Rate per Pricing UOM",
					"fieldtype": "Currency",
					"read_only": 1,
					"insert_after": "custom_pricing_uom",
				},
				{
					"fieldname": "custom_chargeable_qty",
					"label": "Chargeable Qty (Pricing UOM)",
					"fieldtype": "Float",
					"description": "Measured line total in the pricing UOM. Required for Direct Entry rules; leave blank to use the configured formula.",
					"insert_after": "custom_rate_per_pricing_uom",
				},
				{
					"fieldname": "custom_calculated_chargeable_qty",
					"label": "Calculated Pricing Qty",
					"fieldtype": "Float",
					"read_only": 1,
					"insert_after": "custom_chargeable_qty",
				},
			]
		}
	)
	frappe.clear_cache(doctype="BOM Item")
