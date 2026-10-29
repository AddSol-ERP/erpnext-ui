"""Migrate the Item UOM Pricing fields from a Section Break to a Tab Break.

An earlier version of `add_item_uom_pricing_fields` placed the fields in a
Section Break inside the Item details tab. This patch creates a dedicated
"UOM Pricing" Tab Break, moves the rule/parameter fields under it, and removes
the obsolete section break.

Idempotent.
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
	]
}


def execute() -> None:
	try:
		meta = frappe.get_meta("Item")

		# Remove any existing tab field and recreate it at the very end of the
		# form. A Tab Break inserted mid-form absorbs every subsequent field
		# into the new tab, which is why unrelated fields were leaking in.
		if meta.has_field("custom_uom_pricing_tab"):
			cf_name = frappe.db.get_value("Custom Field", {"dt": "Item", "fieldname": "custom_uom_pricing_tab"})
			if cf_name:
				frappe.delete_doc("Custom Field", cf_name, ignore_permissions=True)
			frappe.clear_cache(doctype="Item")
			meta = frappe.get_meta("Item")

		# Create the tab at the end (no insert_after => appended last).
		create_custom_fields(ITEM_UOM_PRICING_FIELDS)
		frappe.clear_cache(doctype="Item")
		meta = frappe.get_meta("Item")

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
	except Exception:
		frappe.log_error(frappe.get_traceback(), "migrate_item_uom_pricing_to_tab failed")
		raise
