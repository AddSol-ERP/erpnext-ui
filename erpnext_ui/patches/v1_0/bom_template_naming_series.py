"""Populate the series selector on existing templates without renaming them."""

import frappe


def execute():
	if not frappe.db.exists("DocType", "UI BOM Template"):
		return
	frappe.db.sql(
		"""UPDATE `tabUI BOM Template` SET naming_series = %s
		WHERE naming_series IS NULL OR naming_series = ''""",
		("BOM-TPL-.YYYY.-.#####",),
	)
