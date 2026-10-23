import frappe
from frappe import _
from frappe.model.document import Document


class UISupplierQuotationInvitation(Document):
	def validate(self):
		from frappe.utils import validate_email_address

		if self.recipient_email:
			validate_email_address(self.recipient_email, throw=True)
		if self.state == "Responded" and not self.responded_on:
			frappe.throw(_("A responded invitation must carry a response timestamp."))

	def on_trash(self):
		if self.state == "Responded":
			frappe.throw(_("A responded invitation cannot be deleted; revoke it instead."))
