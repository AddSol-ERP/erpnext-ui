"""Persist who received a direct Store issue separately from its creator."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Stock Entry Detail": [
				{
					"fieldname": "custom_store_requested_by",
					"fieldtype": "Link",
					"options": "User",
					"label": "Requested User",
					"insert_after": "project",
				},
				{
					"fieldname": "custom_store_work_order",
					"fieldtype": "Link",
					"options": "Work Order",
					"label": "Store Work Order",
					"insert_after": "custom_store_requested_by",
				},
			],
			"Stock Entry": [
				{
					"fieldname": "custom_store_project",
					"fieldtype": "Link",
					"options": "Project",
					"label": "Store Project",
					"insert_after": "project",
				},
				{
					"fieldname": "custom_store_requested_by",
					"fieldtype": "Link",
					"options": "User",
					"label": "Requested User",
					"insert_after": "project",
				},
				{
					"fieldname": "custom_store_direct_issue",
					"fieldtype": "Check",
					"default": "0",
					"label": "Direct Store Issue",
					"read_only": 1,
					"insert_after": "custom_store_requested_by",
				},
			],
		}
	)
