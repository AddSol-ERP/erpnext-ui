"""Keep the UOM Pricing fields together after all existing Item fields.

The UOM Pricing Tab Break must be last in the Item layout. A Tab Break in the
middle of the layout makes every following field appear in that tab, even when
those fields are unrelated. This patch only repositions the UOM Pricing fields;
it does not change the placement of any other Item field.
"""

import frappe


UOM_PRICING_FIELDS = {
	"custom_uom_pricing_tab",
	"custom_uom_pricing_section",
	"custom_uom_pricing_rule",
	"custom_uom_pricing_parameters",
}


def execute() -> None:
	try:
		meta = frappe.get_meta("Item")
		if not meta.has_field("custom_uom_pricing_tab"):
			return

		# Anchor the tab after the last existing Item field, so it cannot capture
		# unrelated fields. Exclude this feature's fields when finding that anchor.
		other_fields = [df for df in meta.fields if df.fieldname not in UOM_PRICING_FIELDS]
		tab_insert_after = other_fields[-1].fieldname if other_fields else ""
		placements = {
			"custom_uom_pricing_tab": tab_insert_after,
			"custom_uom_pricing_section": "custom_uom_pricing_tab",
			"custom_uom_pricing_rule": "custom_uom_pricing_section",
			"custom_uom_pricing_parameters": "custom_uom_pricing_rule",
		}

		for fieldname, insert_after in placements.items():
			if not meta.has_field(fieldname):
				continue
			custom_field_name = frappe.db.get_value(
				"Custom Field", {"dt": "Item", "fieldname": fieldname}
			)
			if not custom_field_name:
				continue
			custom_field = frappe.get_doc("Custom Field", custom_field_name)
			if custom_field.insert_after != insert_after:
				custom_field.insert_after = insert_after
				custom_field.save(ignore_permissions=True)
				frappe.clear_cache(doctype="Item")
				meta = frappe.get_meta("Item")

		frappe.clear_cache(doctype="Item")
	except Exception:
		frappe.log_error(frappe.get_traceback(), "ensure_item_uom_pricing_tab_isolated failed")
		raise
