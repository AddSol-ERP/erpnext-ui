"""Add UOM based pricing fields to the core Item doctype.

The generic UOM pricing feature needs two pieces of per-Item state:
  - an optional override pricing rule (Link to UI Uom Pricing Rule); when blank
    the Item inherits its Item Group's rule.
  - a child table of parameter values keyed by rule + symbol, storing only
    values (and the rule reference) -- labels/formula definitions stay on the
    rule so stale values cannot leak across rule changes.

Idempotent: create_custom_fields skips fields that already exist.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ITEM_UOM_PRICING_FIELDS = {
	"Item": [
		{
			"fieldname": "custom_uom_pricing_section",
			"fieldtype": "Section Break",
			"label": "UOM Pricing",
			"insert_after": "item_group",
		},
		{
			"fieldname": "custom_uom_pricing_rule",
			"fieldtype": "Link",
			"label": "UOM Pricing Rule (override)",
			"options": "UI Uom Pricing Rule",
			"description": "Leave blank to inherit the Item Group's rule.",
			"insert_after": "custom_uom_pricing_section",
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
	if not meta.has_field("custom_uom_pricing_rule"):
		create_custom_fields(ITEM_UOM_PRICING_FIELDS)
		frappe.clear_cache(doctype="Item")
