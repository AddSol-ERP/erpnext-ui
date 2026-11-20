import frappe
from frappe.model.document import Document


class UIQuotationAIRequest(Document):
	def validate(self):
		if not frappe.flags.get("creating_quotation_ai_request") or not self.is_new():
			frappe.throw("AI request records can only be created by the evaluation service.")
