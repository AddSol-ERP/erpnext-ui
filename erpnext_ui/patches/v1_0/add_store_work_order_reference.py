"""Keep Store work-order references separate from manufacturing calculations."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			doctype: [
				{
					"fieldname": "custom_store_work_order",
					"fieldtype": "Link",
					"label": "Store Work Order",
					"options": "Work Order",
					"insert_after": "work_order",
					"description": "Optional Work Order reference for Store requests and movements.",
				}
			]
			for doctype in ("Material Request", "Stock Entry")
		}
	)
