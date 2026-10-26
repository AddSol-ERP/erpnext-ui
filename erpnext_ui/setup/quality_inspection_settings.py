"""Seed site-specific Quality Inspection UI field configuration."""

import frappe

# A site can rename or omit these warehouses, so this is only a one-time
# convenience seed. It is applied only when the known name exists, or when
# exactly one warehouse matches the prefix; an existing selection is never
# overwritten, and an ambiguous site is left for the administrator to choose in
# the settings page.
PENDING_INSPECTION_WAREHOUSE_PREFIX = "Factory Inward (Pending QC)"
PENDING_INSPECTION_WAREHOUSE_DEFAULT = "Factory Inward (Pending QC) - NLEPL"


def _seed_pending_inspection_warehouse(settings):
	if (settings.get("pending_inspection_warehouse") or "").strip():
		return False

	# The site's known warehouse wins when it exists. The prefix scan is only a
	# fallback for a renamed company abbreviation -- and it is deliberately
	# limited to a single match, because guessing between two pending-QC
	# warehouses would silently show the wrong one.
	if frappe.db.exists("Warehouse", PENDING_INSPECTION_WAREHOUSE_DEFAULT):
		if not frappe.db.get_value("Warehouse", PENDING_INSPECTION_WAREHOUSE_DEFAULT, "is_group"):
			settings.pending_inspection_warehouse = PENDING_INSPECTION_WAREHOUSE_DEFAULT
			return True

	warehouses = frappe.get_all(
		"Warehouse",
		filters={
			"is_group": 0,
			"name": ["like", f"{PENDING_INSPECTION_WAREHOUSE_PREFIX} - %"],
		},
		pluck="name",
		limit_page_length=2,
	)
	if len(warehouses) != 1:
		return False
	settings.pending_inspection_warehouse = warehouses[0]
	return True


def setup_quality_inspection_settings():
	if not frappe.db.exists("DocType", "UI Quality Inspection Settings"):
		return
	from erpnext_ui.quality_inspection import sync_field_catalog

	settings, changed = sync_field_catalog()
	changed = _seed_pending_inspection_warehouse(settings) or changed
	if settings.is_new() or changed:
		settings.save(ignore_permissions=True)
