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
		from erpnext_ui.uom_pricing import validate_single_enabled_rule

		try:
			validate_single_enabled_rule(self.item_group, self.name or "__new__", lock=True)
			if self.enable_item_code:
				from erpnext_ui.item_naming import validate_naming_pattern

				validate_naming_pattern(self.item_code_pattern, {row.symbol for row in self.params})
		except ValueError as exc:
			frappe.throw(str(exc))
		if not self.pricing_uom:
			frappe.throw("Pricing UOM is required when the pricing rule is enabled.")
		if (self.formula_mode or "") == "Formula" and not (self.formula_expression or "").strip():
			frappe.throw("Formula expression is required when the formula mode is Formula.")
