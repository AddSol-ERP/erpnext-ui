import frappe
from frappe.model.document import Document


class UIItemCodeRule(Document):
	def validate(self):
		frappe.throw(
			"UI Item Code Rule is a legacy archive. Configure Item Naming on UI Uom Pricing Rule instead."
		)
