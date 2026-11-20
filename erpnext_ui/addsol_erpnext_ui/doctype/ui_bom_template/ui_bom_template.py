import math

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class UIBOMTemplate(Document):
	def validate(self):
		frappe.get_doc("Company", self.company).check_permission("read")
		if not math.isfinite(flt(self.quantity)) or flt(self.quantity) <= 0:
			frappe.throw("Finished quantity must be positive.")
		for row in self.items:
			if not math.isfinite(flt(row.qty)) or flt(row.qty) <= 0:
				frappe.throw("Raw material quantities must be positive.")
			if not math.isfinite(flt(row.conversion_factor)) or flt(row.conversion_factor) <= 0:
				frappe.throw("Raw material conversion factors must be positive.")
		if self.routing:
			frappe.get_doc("Routing", self.routing).check_permission("read")
		if self.operations or self.routing:
			self.with_operations = 1
