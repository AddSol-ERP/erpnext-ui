import frappe
from frappe import _
from frappe.model.document import Document


class UISupplierQuotationRecipient(Document):
	def validate(self):
		from frappe.utils import validate_email_address

		email = (self.email or "").strip()
		if not email:
			return
		validate_email_address(email, throw=True)
		self.email = email
