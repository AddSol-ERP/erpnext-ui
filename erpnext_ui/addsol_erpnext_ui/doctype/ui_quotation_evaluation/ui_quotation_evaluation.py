import frappe
from frappe.model.document import Document


class UIQuotationEvaluation(Document):
	def validate(self):
		# Initial snapshots come only from the comparison service. Subsequent
		# edits may change decision notes, never forge historical quote/AI data.
		if self.is_new():
			if not frappe.flags.get("creating_quotation_evaluation"):
				frappe.throw("Evaluation snapshots can only be created by the comparison service.")
			return
		original = self.get_doc_before_save()
		if not original:
			frappe.throw("The original evaluation could not be verified.")
		for field in (
			"company",
			"company_currency",
			"evaluation_date",
			"quotation_names",
			"snapshot",
			"ai_request",
			"ai_analysis",
		):
			if self.get(field) != original.get(field):
				frappe.throw("Saved comparison data cannot be changed. Create a new comparison instead.")


def has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	if not doc or user == "Guest":
		return False
	try:
		roles = set(frappe.get_roles(user))
		if doc.doctype == "UI Quotation AI Request":
			# Shared saved comparisons do not grant access to another user's raw AI requests.
			if doc.owner != user:
				return False
		elif user == "Administrator" or "System Manager" in roles:
			return True
		elif not roles.intersection({"Purchase Manager", "Purchase User"}):
			return False
		elif ptype and ptype not in {
			"read",
			"write",
			"create",
			"report",
			"export",
			"print",
			"email",
			"select",
		}:
			return False
		names = frappe.parse_json(doc.quotation_names)
		return (
			isinstance(names, list)
			and bool(names)
			and all(
				frappe.has_permission(
					"Supplier Quotation", "read", doc=frappe.get_doc("Supplier Quotation", name), user=user
				)
				for name in names
			)
			and frappe.has_permission(
				"Company", "read", doc=frappe.get_doc("Company", doc.company), user=user
			)
		)
	except Exception:
		return False


def permission_query_conditions(user=None):
	"""Allow shared saved comparisons while enforcing the reader's source permissions."""
	user = user or frappe.session.user
	try:
		names = frappe.get_all("UI Quotation Evaluation", pluck="name", limit_page_length=0)
		permitted = [
			name
			for name in names
			if has_permission(frappe.get_doc("UI Quotation Evaluation", name), user=user)
		]
		if not permitted:
			return "1=0"
		escaped = ", ".join(frappe.db.escape(name) for name in permitted)
		return f"`tabUI Quotation Evaluation`.`name` in ({escaped})"
	except Exception:
		# A permission or database failure must not disclose saved comparisons.
		return "1=0"


def ai_request_query_conditions(user=None):
	# AI request payloads remain available only through explicitly checked documents.
	return "1=0"
