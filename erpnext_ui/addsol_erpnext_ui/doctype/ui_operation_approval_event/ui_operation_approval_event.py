import frappe
from frappe.model.document import Document


class UIOperationApprovalEvent(Document):
	def validate(self):
		if not self.is_new():
			frappe.throw("Approval transactions cannot be modified.")

	def on_trash(self):
		frappe.throw("Approval transactions cannot be deleted.")
