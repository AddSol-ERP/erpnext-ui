"""Seed site-specific Quality Inspection UI field configuration."""

import frappe


def setup_quality_inspection_settings():
	if not frappe.db.exists("DocType", "UI Quality Inspection Settings"):
		return
	from erpnext_ui.quality_inspection import sync_field_catalog

	settings = sync_field_catalog()
	if settings.is_new() or settings.is_dirty():
		settings.save(ignore_permissions=True)
