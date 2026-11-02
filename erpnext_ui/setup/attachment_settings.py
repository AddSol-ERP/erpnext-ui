"""Create initial attachment policy rows without overwriting admin choices."""

import frappe

from erpnext_ui.ui_documents import DOCUMENT_ATTACHMENT_CONFIG


def setup_attachment_settings():
	if not frappe.db.exists("DocType", "UI Attachment Settings"):
		return

	settings = frappe.get_single("UI Attachment Settings")
	existing = {row.target_doctype for row in settings.doctype_rules}
	changed = False
	for doctype in DOCUMENT_ATTACHMENT_CONFIG:
		# Optional customer apps may not be installed; saving a Link to their
		# missing DocType makes after_migrate fail link validation for the site.
		if doctype in existing or not frappe.db.exists("DocType", doctype):
			continue
		settings.append(
			"doctype_rules",
			{"target_doctype": doctype, "enabled": 1, "require_on_save": 0, "require_on_submit": 0},
		)
		changed = True
	if changed:
		settings.save(ignore_permissions=True)
