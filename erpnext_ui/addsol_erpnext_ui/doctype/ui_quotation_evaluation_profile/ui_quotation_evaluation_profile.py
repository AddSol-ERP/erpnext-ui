import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class UIQuotationEvaluationProfile(Document):
	def validate(self):
		if not 0 <= flt(self.minimum_evidence) <= 100:
			frappe.throw(_("Minimum evidence must be between 0 and 100 percent."))
		if any(flt(row.weight) < 0 for row in self.criteria):
			frappe.throw(_("Criterion weights cannot be negative."))
		if abs(sum(flt(row.weight) for row in self.criteria) - 100) > 0.001:
			frappe.throw(_("Criterion weights must total 100 percent."))
		names = [(row.criterion or "").strip().casefold() for row in self.criteria]
		if not all(names) or len(names) != len(set(names)):
			frappe.throw(_("Criteria must have distinct names."))
