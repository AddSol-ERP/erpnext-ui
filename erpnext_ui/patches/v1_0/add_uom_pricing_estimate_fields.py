"""Separate the configured baseline from the operator's measured quantity."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from erpnext_ui.patches.v1_0.add_uom_pricing_rate_field import ITEM_TABLES
from erpnext_ui.uom_pricing import calculate_chargeable_quantity


def execute():
	create_custom_fields(
		{
			dt: [
				{
					"fieldname": "custom_estimated_chargeable_qty",
					"fieldtype": "Float",
					"precision": "6",
					"label": "Estimated Chargeable Qty",
					"read_only": 1,
					"in_list_view": 1,
					"insert_after": "custom_chargeable_qty",
					"depends_on": "eval:doc.custom_estimated_chargeable_qty > 0",
					"description": "Item formula estimate before any actual chargeable quantity override, in Pricing UOM.",
				},
				{
					"fieldname": "custom_estimated_pricing_amount",
					"fieldtype": "Currency",
					"options": "currency",
					"label": "Estimated Amount",
					"read_only": 1,
					"insert_after": "custom_estimated_chargeable_qty",
					"depends_on": "eval:doc.custom_estimated_chargeable_qty > 0",
					"description": "Estimated Chargeable Qty multiplied by Rate per UOM; for comparison only.",
				},
			]
			for dt in ITEM_TABLES
		}
	)
	# Old snapshots contain the original rule and parameter values. Use those,
	# never today's Item configuration, to populate historical display fields.
	for dt in ITEM_TABLES:
		for row in frappe.get_all(
			dt,
			filters={"custom_pricing_snapshot": ["is", "set"]},
			fields=["name", "qty", "custom_rate_per_pricing_uom", "custom_pricing_snapshot"],
		):
			try:
				snapshot = frappe.parse_json(row.custom_pricing_snapshot)
				if not isinstance(snapshot, dict) or not isinstance(snapshot.get("rule"), dict):
					continue
				if snapshot["rule"].get("formula_mode") == "Direct Entry" or float(row.qty or 0) <= 0:
					continue
				baseline = calculate_chargeable_quantity(
					snapshot["rule"], snapshot.get("params_by_symbol") or {}
				) * float(row.qty)
			except (KeyError, TypeError, ValueError):
				continue  # Leave unresolvable history empty; don't invent a baseline.
			snapshot["calculated_chargeable_qty"] = baseline
			frappe.db.set_value(
				dt,
				row.name,
				{
					"custom_estimated_chargeable_qty": baseline,
					"custom_estimated_pricing_amount": baseline * float(row.custom_rate_per_pricing_uom or 0),
					"custom_pricing_snapshot": frappe.as_json(snapshot),
				},
				update_modified=False,
			)
