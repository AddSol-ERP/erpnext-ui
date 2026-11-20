"""Remove owner restrictions for purchasing roles without resetting other role customizations."""

import frappe


def execute():
	doctype = "UI Quotation Evaluation"
	if not frappe.db.exists("DocType", doctype):
		return
	# JSON sync updates DocPerm. Existing Role Permission Manager overrides
	# otherwise mask those defaults, so update only the requested roles there.
	if frappe.db.exists("Custom DocPerm", {"parent": doctype}):
		for role in ("Purchase User", "Purchase Manager", "System Manager"):
			rows = frappe.get_all(
				"Custom DocPerm",
				filters={"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0},
				pluck="name",
			)
			rights = dict(
				read=1,
				write=1,
				create=1,
				report=1,
				export=1,
				print=1,
				email=1,
				if_owner=0,
				delete=int(role == "System Manager"),
				share=int(role == "System Manager"),
			)
			if rows:
				for name in rows:
					frappe.db.set_value("Custom DocPerm", name, rights)
			else:
				frappe.get_doc(
					{
						"doctype": "Custom DocPerm",
						"parent": doctype,
						"parenttype": "DocType",
						"parentfield": "permissions",
						"role": role,
						"permlevel": 0,
						**rights,
					}
				).insert(ignore_permissions=True)
	frappe.clear_cache(doctype=doctype)
