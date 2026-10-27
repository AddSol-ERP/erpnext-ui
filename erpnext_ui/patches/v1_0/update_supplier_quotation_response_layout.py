import frappe


def execute():
	settings = frappe.get_single("UI Supplier Quotation Settings")
	if not settings:
		return

	changed = False
	for row in settings.get("field_config") or []:
		fieldname = (row.fieldname or "").strip()
		scope = (row.scope or "").strip()
		if scope == "Item":
			if fieldname == "item_code":
				if row.enabled or row.supplier_editable or row.mandatory:
					row.enabled = 0
					row.supplier_editable = 0
					row.mandatory = 0
					changed = True
			if fieldname in ("rate_per_kg", "custom_rate_per_kg") or (getattr(row, "label") or "").strip().lower() == "rate per kg":
				if row.enabled or row.supplier_editable or row.mandatory:
					row.enabled = 0
					row.supplier_editable = 0
					row.mandatory = 0
					changed = True
		if scope == "Document":
			if fieldname == "terms":
				if not row.enabled or not row.supplier_editable:
					row.enabled = 1
					row.supplier_editable = 1
					row.mandatory = 0
					changed = True
			if fieldname == "incoterm":
				if not row.enabled or not row.supplier_editable:
					row.enabled = 1
					row.supplier_editable = 1
					row.mandatory = 0
					changed = True
			if fieldname == "ui_supplier_remark":
				if not row.enabled:
					row.enabled = 1
					changed = True
			if fieldname == "remarks":
				# keep existing choice
				pass

	if changed:
		settings.save(ignore_permissions=True)
	else:
		# Ensure rows exist for new defaults
		try:
			from erpnext_ui.supplier_quotation import sync_supplier_quotation_field_config

			sync_supplier_quotation_field_config(settings)
		except Exception:
			pass
