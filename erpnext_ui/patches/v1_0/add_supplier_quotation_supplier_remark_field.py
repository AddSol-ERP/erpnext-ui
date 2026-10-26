"""Add a supplier-only remark field to Supplier Quotation Item.

The Material Request form labels `description` as "Remark" and requires it on
purchase requests. `make_supplier_quotation` copies that field onto the draft
Supplier Quotation, and the supplier response form deliberately shows
`description` as read-only context. Reusing it for the supplier's own comment
would overwrite the buyer's request note, so the supplier remark gets a
separate field here.

Idempotent: `create_custom_fields` skips a field that already exists on the
meta, and the field is a plain string on Supplier Quotation Item -- no new
DocType and no data migration. Existing draft quotations simply start blank.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

SUPPLIER_REMARK_FIELD = {
	"fieldname": "ui_supplier_remark",
	"fieldtype": "Small Text",
	"label": "Supplier Remark",
	"insert_after": "description",
	# A supplier response, not a buyer instruction: keep it editable and
	# optional. Administrators can make it mandatory in Supplier Quotation
	# Settings, which is where the supplier form's allowlist lives.
	"read_only": 0,
	"translatable": 0,
}


def execute() -> None:
	meta = frappe.get_meta("Supplier Quotation Item")
	if not meta.has_field("ui_supplier_remark"):
		create_custom_fields({"Supplier Quotation Item": [SUPPLIER_REMARK_FIELD]})
		frappe.clear_cache(doctype="Supplier Quotation Item")
