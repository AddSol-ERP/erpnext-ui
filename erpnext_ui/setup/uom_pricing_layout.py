"""Shared Desk Pricing Details layout for every per-UOM transaction item table."""

import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from erpnext_ui.patches.v1_0.add_uom_pricing_rate_field import ITEM_TABLES

SECTION = "custom_uom_pricing_details"
COLUMN = "custom_uom_pricing_column"
LEFT = ["rate", "custom_rate_per_pricing_uom", "custom_estimated_pricing_amount", "amount"]
RIGHT = [
	"custom_pricing_uom",
	"custom_chargeable_qty",
	"custom_pricing_dimensions",
	"custom_estimated_chargeable_qty",
	"custom_pricing_snapshot",
]


def pricing_field_order(fields):
	"""Move only pricing fields to a two-column section, preserving other blocks."""
	order = [field.fieldname for field in fields if field.fieldname]
	types = {field.fieldname: field.fieldtype for field in fields}
	pricing = {SECTION, COLUMN, *LEFT, *RIGHT}
	# Anchor at the end of the native quantity/rate section. Reapplication uses
	# our section's position so it cannot drift with each bench migrate.
	placed = (
		SECTION in order and order.index(SECTION) + 1 < len(order) and order[order.index(SECTION) + 1] in LEFT
	)
	anchor = (
		order.index(SECTION)
		if placed
		else next((index for index, name in enumerate(order) if name == "rate"), len(order))
	)
	if not placed:
		anchor = next(
			(
				index
				for index in range(anchor + 1, len(order))
				if types.get(order[index]) in ("Section Break", "Tab Break")
			),
			len(order),
		)
	before = [name for name in order[:anchor] if name not in pricing]
	after = [name for name in order[anchor:] if name not in pricing]
	block = [
		SECTION,
		*[name for name in LEFT if name in order],
		COLUMN,
		*[name for name in RIGHT if name in order],
	]
	return before + block + after


def execute():
	create_custom_fields(
		{
			dt: [
				{"fieldname": SECTION, "fieldtype": "Section Break", "label": "Pricing Details"},
				{"fieldname": COLUMN, "fieldtype": "Column Break", "insert_after": SECTION},
			]
			for dt in ITEM_TABLES
		}
	)
	for dt in ITEM_TABLES:
		# Grid display only; retain existing permissions and native rate behavior.
		for name, properties in {
			"custom_pricing_dimensions": {"in_list_view": 1, "columns": 2},
			"custom_rate_per_pricing_uom": {"in_list_view": 1},
		}.items():
			custom_field = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": name})
			if custom_field:
				frappe.db.set_value("Custom Field", custom_field, properties, update_modified=False)
		frappe.clear_cache(doctype=dt)
		meta = frappe.get_meta(dt)
		order = pricing_field_order(meta.fields)
		if order != [field.fieldname for field in meta.fields if field.fieldname]:
			frappe.make_property_setter(
				{
					"doctype": dt,
					"doctype_or_field": "DocType",
					"fieldname": None,
					"property": "field_order",
					"value": json.dumps(order),
					"property_type": "Data",
				},
				validate_fields_for_doctype=False,
			)
		frappe.clear_cache(doctype=dt)
