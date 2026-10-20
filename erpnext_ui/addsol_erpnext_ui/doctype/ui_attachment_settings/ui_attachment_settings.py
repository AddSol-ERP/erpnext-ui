import frappe
from frappe.model.document import Document


class UIAttachmentSettings(Document):
	def validate(self):
		doctypes = [row.target_doctype for row in self.doctype_rules if row.target_doctype]
		if len(doctypes) != len(set(doctypes)):
			frappe.throw("Each DocType can have only one attachment rule.")
