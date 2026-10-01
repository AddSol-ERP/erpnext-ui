"""Create/refresh the Salary Slip payslip print format and the fields it reads.

This patch is idempotent and safe to re-run:

* Custom fields are only created when they are genuinely missing from the doctype
  meta (i.e. neither a standard field nor an existing Custom Field).
* The Print Format record is upserted by name, so the existing "Salary Slip"
  record is updated in place rather than duplicated. The name is deliberately
  kept as "Salary Slip" because the frontend routes to it by that exact name
  (see frontend/src/config/doctypes.js -> printFormat: "Salary Slip").
"""

import os

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

APP_NAME = "erpnext_ui"
PRINT_FORMAT_NAME = "Salary Slip"
PRINT_FORMAT_DOCTYPE = "Salary Slip"

# Header fields referenced by the template that are not part of the standard
# Salary Slip doctype. Each is only created if it is absent.
PAYSLIP_HEADER_FIELDS = [
	{
		"fieldname": "pan_number",
		"fieldtype": "Data",
		"label": "PAN No",
		"insert_after": "bank_account_no",
		"print_hide": 1,
		"translatable": 0,
	},
	{
		"fieldname": "uan",
		"fieldtype": "Data",
		"label": "UAN No",
		"insert_after": "pan_number",
		"print_hide": 1,
		"translatable": 0,
	},
	{
		"fieldname": "pf_number",
		"fieldtype": "Data",
		"label": "PF No",
		"insert_after": "uan",
		"print_hide": 1,
		"translatable": 0,
	},
	{
		"fieldname": "esic_no",
		"fieldtype": "Data",
		"label": "ESIC No",
		"insert_after": "pf_number",
		"print_hide": 1,
		"translatable": 0,
	},
	{
		"fieldname": "client_code",
		"fieldtype": "Data",
		"label": "Client Code",
		"insert_after": "esic_no",
		"print_hide": 1,
		"translatable": 0,
	},
	{
		"fieldname": "date_of_joining",
		"fieldtype": "Date",
		"label": "Date of Joining",
		"insert_after": "client_code",
		"print_hide": 1,
		"translatable": 0,
	},
]

# Drives which earnings/deductions rows the payslip is allowed to show.
PRINTABLE_COMPONENT_FIELD = {
	"fieldname": "custom_show_in_print",
	"fieldtype": "Check",
	"label": "Show in Print",
	"insert_after": "statistical_component",
	"print_hide": 1,
	"default": "0",
	"description": "Include this component in the Salary Slip print format.",
}


def get_template_html() -> str:
	"""Read the payslip template that ships with this app."""
	template_path = frappe.get_app_path(
		APP_NAME, "templates", "print_formats", "salary_slip.html"
	)
	if not os.path.exists(template_path):
		frappe.throw(
			frappe._("Payslip template not found at {0}").format(template_path),
			title="Salary Slip Print Format",
		)
	with open(template_path) as f:
		return f.read()


def get_missing_fields(doctype: str, fields: list[dict]) -> list[dict]:
	"""Return only the fields that are not already on the doctype."""
	meta = frappe.get_meta(doctype)
	return [df for df in fields if not meta.has_field(df["fieldname"])]


def create_missing_fields() -> None:
	existing_header = get_missing_fields(PRINT_FORMAT_DOCTYPE, PAYSLIP_HEADER_FIELDS)
	if existing_header:
		create_custom_fields({PRINT_FORMAT_DOCTYPE: existing_header})
		frappe.clear_cache(doctype=PRINT_FORMAT_DOCTYPE)

	existing_component = get_missing_fields("Salary Component", [PRINTABLE_COMPONENT_FIELD])
	if existing_component:
		create_custom_fields({"Salary Component": existing_component})
		frappe.clear_cache(doctype="Salary Component")


def upsert_print_format() -> None:
	# `name` is intentionally excluded from the update payload: passing it to
	# Document.update() on an existing record would attempt a rename.
	values = {
		"doc_type": PRINT_FORMAT_DOCTYPE,
		"print_format_type": "Jinja",
		"print_format_for": "DocType",
		"custom_format": 1,
		"standard": "No",
		"disabled": 0,
		"html": get_template_html(),
		"font": "Default",
		"line_breaks": 0,
	}

	if frappe.db.exists("Print Format", PRINT_FORMAT_NAME):
		doc = frappe.get_doc("Print Format", PRINT_FORMAT_NAME)
		# Do not silently repoint a format that belongs to a different doctype.
		if doc.doc_type != PRINT_FORMAT_DOCTYPE:
			frappe.throw(
				frappe._(
					'Print Format "{0}" already exists for DocType "{1}". '
					"Rename or delete the conflicting record before migrating."
				).format(PRINT_FORMAT_NAME, doc.doc_type),
				title="Print Format Conflict",
			)
		doc.update(values)
	else:
		doc = frappe.new_doc("Print Format")
		doc.update({"doctype": "Print Format", "name": PRINT_FORMAT_NAME, **values})

	# print_format.validate() refuses to update standard formats unless
	# developer_mode / in_migrate / in_install is set.
	previous = frappe.flags.in_migrate
	frappe.flags.in_migrate = True
	try:
		doc.save(ignore_permissions=True)
	finally:
		frappe.flags.in_migrate = previous


def execute():
	create_missing_fields()
	upsert_print_format()
