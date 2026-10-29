"""Add UOM based pricing fields to the core Item doctype.

The configuration lives in its own "UOM Pricing" tab (Tab Break), not in the
Item details section.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ITEM_UOM_PRICING_FIELDS = {
	"Item": [
		{
			"fieldname": "custom_uom_pricing_tab",
			"fieldtype": "Tab Break",
			"label": "UOM Pricing",
		},
		{
			"fieldname": "custom_uom_pricing_rule",
			"fieldtype": "Link",
			"label": "UOM Pricing Rule (override)",
			"options": "UI Uom Pricing Rule",
			"description": "Leave blank to inherit the Item Group's rule.",
			"insert_after": "custom_uom_pricing_tab",
		},
		{
			"fieldname": "custom_uom_pricing_parameters",
			"fieldtype": "Table",
			"label": "UOM Pricing Parameters",
			"options": "UI Uom Pricing Item Parameter",
			"insert_after": "custom_uom_pricing_rule",
		},
	]
}


def execute() -> None:
	try:
		meta = frappe.get_meta("Item")
		if not meta.has_field("custom_uom_pricing_tab"):
			create_custom_fields(ITEM_UOM_PRICING_FIELDS)
			frappe.clear_cache(doctype="Item")
			meta = frappe.get_meta("Item")

		# Move the tab to the end of the form so it does not absorb the fields
		# of the tab it was inserted into.
		if meta.has_field("custom_uom_pricing_tab"):
			cf_name = frappe.db.get_value("Custom Field", {"dt": "Item", "fieldname": "custom_uom_pricing_tab"})
			if cf_name:
				cf = frappe.get_doc("Custom Field", cf_name)
				if cf.insert_after:
					cf.insert_after = ""
					cf.save(ignore_permissions=True)

		updates = {
			"custom_uom_pricing_rule": "custom_uom_pricing_tab",
			"custom_uom_pricing_parameters": "custom_uom_pricing_rule",
		}
		for fieldname, insert_after in updates.items():
			if meta.has_field(fieldname):
				cf_name = frappe.db.get_value("Custom Field", {"dt": "Item", "fieldname": fieldname})
				if cf_name:
					cf = frappe.get_doc("Custom Field", cf_name)
					if cf.insert_after != insert_after:
						cf.insert_after = insert_after
						cf.save(ignore_permissions=True)

		if meta.has_field("custom_uom_pricing_section"):
			cf_name = frappe.db.get_value("Custom Field", {"dt": "Item", "fieldname": "custom_uom_pricing_section"})
			if cf_name:
				frappe.delete_doc("Custom Field", cf_name, ignore_permissions=True)

		frappe.clear_cache(doctype="Item")
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "add_item_uom_pricing_fields failed")
		raise
