"""Site-configurable additional fields on Quality Inspection forms."""

import frappe
from frappe import _
from frappe.utils import cint


SETTINGS_DOCTYPE = "UI Quality Inspection Settings"
FIELD_CONFIG_DOCTYPE = "UI Quality Inspection Field"
ALLOWED_FIELD_TYPES = {
	"Check",
	"Currency",
	"Data",
	"Date",
	"Datetime",
	"Float",
	"Int",
	"Link",
	"Percent",
	"Select",
	"Small Text",
	"Text",
	"Time",
}


def get_field_catalog():
	"""Return editable custom fields available on this site's Quality Inspection."""
	if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
		return []

	fields = frappe.get_all(
		"Custom Field",
		filters={"dt": "Quality Inspection", "hidden": 0},
		fields=["fieldname", "label", "fieldtype", "options", "reqd", "read_only", "idx"],
		order_by="idx asc",
		limit_page_length=0,
	)
	return [
		{
			"fieldname": row.fieldname,
			"label": row.label or row.fieldname,
			"fieldtype": row.fieldtype,
			"options": row.options or "",
			"required_by_doctype": bool(row.reqd),
		}
		for row in fields
		if row.fieldtype in ALLOWED_FIELD_TYPES and not row.read_only
	]


def sync_field_catalog(settings=None):
	"""Add newly-created Quality Inspection custom fields without changing choices."""
	settings = settings or frappe.get_single(SETTINGS_DOCTYPE)
	existing = {row.fieldname: row for row in settings.get("additional_fields", [])}
	for field in get_field_catalog():
		row = existing.get(field["fieldname"])
		if row:
			row.label = field["label"]
			row.fieldtype = field["fieldtype"]
			row.options = field["options"]
		else:
			settings.append(
				"additional_fields",
				{
					"fieldname": field["fieldname"],
					"label": field["label"],
					"fieldtype": field["fieldtype"],
					"options": field["options"],
					"enabled": 0,
					"mandatory": 0,
					"display_order": len(existing) + 1,
				},
			)
			existing[field["fieldname"]] = settings.additional_fields[-1]
	return settings


@frappe.whitelist(allow_guest=False)
def get_quality_inspection_field_config():
	"""Return configured fields and the available custom-field catalog."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please sign in to access Quality Inspection fields."), frappe.PermissionError)

	settings = sync_field_catalog()
	if settings.is_new() or settings.is_dirty():
		settings.save(ignore_permissions=True)
	configured = {row.fieldname: row for row in settings.get("additional_fields", [])}
	result = []
	for field in get_field_catalog():
		row = configured.get(field["fieldname"])
		if not row:
			continue
		result.append(
			{
				**field,
				"enabled": bool(row.enabled),
				"mandatory": bool(row.mandatory),
				"display_order": row.display_order or 0,
			}
		)
	return {"catalog": result}


@frappe.whitelist(allow_guest=False)
def save_quality_inspection_field_config(payload=None):
	"""Save field visibility and requiredness; metadata is always server-derived."""
	if not {"System Manager", "Administrator"}.intersection(frappe.get_roles()):
		frappe.throw(_("Only System Managers can change Quality Inspection UI settings."), frappe.PermissionError)

	if isinstance(payload, str):
		payload = frappe.parse_json(payload)
	if not isinstance(payload, list):
		frappe.throw(_("Field configuration must be a list."))

	catalog = {field["fieldname"]: field for field in get_field_catalog()}
	seen = set()
	settings = frappe.get_single(SETTINGS_DOCTYPE)
	settings.set("additional_fields", [])
	for row in payload:
		if not isinstance(row, dict):
			frappe.throw(_("Each field configuration must be an object."))
		fieldname = str(row.get("fieldname") or "")
		field = catalog.get(fieldname)
		if not field:
			frappe.throw(_("Field {0} is no longer available on Quality Inspection.").format(fieldname))
		if fieldname in seen:
			frappe.throw(_("Duplicate field configuration: {0}.").format(fieldname))
		seen.add(fieldname)
		settings.append(
			"additional_fields",
			{
				**field,
				"enabled": cint(row.get("enabled")),
				"mandatory": cint(row.get("mandatory")) and not field["required_by_doctype"],
				"display_order": cint(row.get("display_order")),
			},
		)
	settings.save()
	return {"ok": True}
