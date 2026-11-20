"""Keep BOM row files attached to their permission-checked parent BOM."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	if not frappe.get_meta("File").has_field("ui_bom_item"):
		create_custom_fields(
			{
				"File": [
					{
						"fieldname": "ui_bom_item",
						"label": "BOM Item Reference",
						"fieldtype": "Data",
						"read_only": 1,
						"print_hide": 1,
						"no_copy": 1,
					}
				]
			}
		)
		frappe.clear_cache(doctype="File")
