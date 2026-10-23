import frappe
from frappe.model.document import Document


class UISupplierQuotationField(Document):
	def validate(self):
		from erpnext_ui.supplier_quotation import normalise_field_row

		normalise_field_row(self, throw=True)
