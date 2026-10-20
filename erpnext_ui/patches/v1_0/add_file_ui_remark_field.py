"""Add the attachment remark field to the core File doctype.

The attach panel's per-file remark first SELECTed `File.description` -- a
field this Frappe version does not have on File -- so every
list_document_attachments call died with OperationalError 1054
("Unknown column 'description' in 'SELECT'") on the deployed site. File has
no free-text column to borrow, and this app adds no custom DocTypes, so the
remark rides a Custom Field on the core File doctype, created here.

Idempotent: `create_custom_fields` skips a field that already exists on the
meta. ui_documents.py also guards on the column's physical presence
(`frappe.db.has_column`), so a site that has deployed the code but not yet
run `bench migrate` keeps attaching files -- minus the remark -- rather than
500ing on every list and upload.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

FILE_REMARK_FIELD = {
	"fieldname": "ui_remark",
	"fieldtype": "Data",
	"label": "UI Remark",
	"length": 140,
	# Set only through upload_document. read_only keeps it out of desk edits
	# that nothing would sync back from; print_hide keeps it off prints.
	"read_only": 1,
	"print_hide": 1,
	"translatable": 0,
}


def execute() -> None:
	meta = frappe.get_meta("File")
	if not meta.has_field("ui_remark"):
		create_custom_fields({"File": [FILE_REMARK_FIELD]})
		frappe.clear_cache(doctype="File")
