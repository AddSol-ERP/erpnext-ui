"""Add the information-only flag to Frappe's standard ToDo DocType."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

TODO_INFORMATION_FIELD = {
	"fieldname": "custom_for_information_only",
	"fieldtype": "Check",
	"label": "For Information Only",
	"default": "0",
	"insert_after": "color",
	"in_standard_filter": 1,
	"description": "Show this ToDo as information for the assignee, rather than an action to complete.",
}


def setup_todo_fields():
	"""Create the ToDo flag idempotently without adding a custom DocType."""
	if not frappe.db.exists("DocType", "ToDo"):
		return

	if not frappe.get_meta("ToDo").has_field(TODO_INFORMATION_FIELD["fieldname"]):
		create_custom_fields({"ToDo": [TODO_INFORMATION_FIELD]})
		frappe.clear_cache(doctype="ToDo")

	# Check-field defaults apply to new documents; older ToDos can stay NULL after
	# the custom column is added. Treat those as Action Needed and normalize them
	# so category filters do not make existing assigned tasks disappear.
	if frappe.db.has_column("ToDo", TODO_INFORMATION_FIELD["fieldname"]):
		frappe.db.sql(
			f"""UPDATE `tabToDo`
			SET `{TODO_INFORMATION_FIELD['fieldname']}` = 0
			WHERE `{TODO_INFORMATION_FIELD['fieldname']}` IS NULL"""
		)
