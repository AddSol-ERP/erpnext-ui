"""Classify existing known geometry and refresh display text without repricing."""

import frappe

from erpnext_ui.patches.v1_0.add_uom_pricing_rate_field import ITEM_TABLES
from erpnext_ui.print_dimensions import DIMENSION_FIELDS, pricing_dimensions


def execute():
	# The new checkbox defaults off. Seed existing known Item dimension fields;
	# arbitrary custom parameters must be selected explicitly by the user.
	for parameter in frappe.get_all(
		"UI Uom Pricing Parameter",
		filters={"data_source": ["in", sorted(DIMENSION_FIELDS)]},
		pluck="name",
		limit_page_length=0,
	):
		frappe.db.set_value("UI Uom Pricing Parameter", parameter, "is_dimension", 1, update_modified=False)
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
