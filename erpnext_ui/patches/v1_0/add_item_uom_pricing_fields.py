"""Add UOM based pricing fields to the core Item doctype.

The generic UOM pricing feature needs two pieces of per-Item state:
  - an optional override pricing rule (Link to UI Uom Pricing Rule); when blank
    the Item inherits its Item Group's rule.
  - a child table of parameter values keyed by rule + symbol, storing only
    values (and the rule reference) -- labels/formula definitions stay on the
    rule so stale values cannot leak across rule changes.

The configuration lives in its own "UOM Pricing" tab (Tab Break), not in the
Item details section.

Idempotent: creates missing fields and repairs insert_after ordering on
existing ones. Removes the obsolete `custom_uom_pricing_section` field created
by an earlier version of this patch.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ITEM_UOM_PRICING_FIELDS = {
	"Item": [
		{
			"fieldname": "custom_uom_pricing_tab",
			"fieldtype": "Tab Break",
			"label": "UOM Pricing",
			"insert_after": "item_group",
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
	meta = frappe.get_meta("Item")
	if not meta.has_field("custom_uom_pricing_tab"):
		create_custom_fields(ITEM_UOM_PRICING_FIELDS)
		frappe.clear_cache(doctype="Item")
		meta = frappe.get_meta("Item")

	# Repair insert_after ordering on fields that already existed from an earlier
	# version of this patch (create_custom_fields skips them, so they would
	# otherwise stay pinned to the old section break).
	updates = {
		"custom_uom_pricing_rule": "custom_uom_pricing_tab",
		"custom_uom_pricing_parameters": "custom_uom_pricing_rule",
	}
	for fieldname, insert_after in updates.items():
		if meta.has_field(fieldname):
			cf = frappe.get_doc("Custom Field", {"dt": "Item", "fieldname": fieldname})
			if cf.insert_after != insert_after:
				cf.insert_after = insert_after
				cf.save(ignore_permissions=True)

	# Remove the obsolete section break from the earlier patch version.
	if meta.has_field("custom_uom_pricing_section"):
		frappe.delete_doc("Custom Field", {"dt": "Item", "fieldname": "custom_uom_pricing_section"}, ignore_permissions=True)

	frappe.clear_cache(doctype="Item")
