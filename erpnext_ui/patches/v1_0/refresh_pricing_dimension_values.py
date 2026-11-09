"""Refresh saved print display text as values and units without repricing."""

import frappe

from erpnext_ui.patches.v1_0.add_uom_pricing_rate_field import ITEM_TABLES
from erpnext_ui.print_dimensions import pricing_dimensions


def execute():
	for dt in ITEM_TABLES:
		if not all(
			frappe.db.has_column(dt, field)
			for field in ("custom_pricing_snapshot", "custom_pricing_dimensions")
		):
			continue
		for row in frappe.get_all(
			dt,
			filters={"custom_pricing_snapshot": ["is", "set"]},
			fields=["name", "custom_pricing_snapshot"],
			limit_page_length=0,
		):
			frappe.db.set_value(
				dt, row.name, "custom_pricing_dimensions", pricing_dimensions(row), update_modified=False
			)
