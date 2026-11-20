import frappe
from frappe import _
from frappe.model.document import Document


class UIQuotationAISettings(Document):
	def validate(self):
		if not 1 <= (self.timeout_seconds or 0) <= 300:
			frappe.throw(_("Timeout must be between 1 and 300 seconds."))
		if not 0 <= (self.max_retries or 0) <= 5:
			frappe.throw(_("Maximum retries must be between 0 and 5."))
		if self.enabled and not (self.provider and self.model and (self.get("api_key") or self.get_password("api_key", raise_exception=False))):
			frappe.throw(_("Provider, model and API key are required when AI evaluation is enabled."))
