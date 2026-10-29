import frappe
from frappe.model.document import Document


class UIUomPricingParameter(Document):
	"""A single declared formula parameter for a UOM pricing rule."""

	def validate(self):
		self.validate_row()

	def validate_row(self):
		if not (self.symbol or "").strip():
			frappe.throw("Pricing parameter symbol is required.")
