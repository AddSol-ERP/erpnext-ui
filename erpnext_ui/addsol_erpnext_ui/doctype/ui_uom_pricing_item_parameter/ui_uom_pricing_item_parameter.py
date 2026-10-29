import frappe
from frappe.model.document import Document


class UIUomPricingItemParameter(Document):
	def validate(self):
		if not self.symbol:
			frappe.throw("Symbol is required.")
		if not self.rule:
			frappe.throw("Pricing Rule is required.")
