import frappe
from frappe.model.document import Document


class UIUomPricingRule(Document):
	"""Pricing rule for a measured quantity pricing UOM.

	Attached to an Item Group; an Item may override the group rule with its own
	values later. The rule is inert until enabled and until the site level feature
	switches allow it.
	"""

	def validate(self):
		self.validate_rule()

	def validate_rule(self):
		if not self.enabled:
			return
		if not self.pricing_uom:
			frappe.throw("Pricing UOM is required when the pricing rule is enabled.")
		if (self.formula_mode or "") == "Formula" and not (self.formula_expression or "").strip():
			frappe.throw("Formula expression is required when the formula mode is Formula.")
