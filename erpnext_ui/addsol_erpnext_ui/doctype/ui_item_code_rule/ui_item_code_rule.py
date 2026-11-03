import frappe
from frappe.model.document import Document

from erpnext_ui.item_naming import EXCLUDED_FIELDS, available_item_fields, pattern_parts


class UIItemCodeRule(Document):
	def validate(self):
		try:
			parts = pattern_parts(self.pattern)
			allowed = {field.fieldname for field in available_item_fields()}
			for _, token, _, _ in parts:
				if (
					token
					and not token.startswith("param.")
					and (token not in allowed or token in EXCLUDED_FIELDS)
				):
					raise ValueError(f"Item field {token} is unavailable for naming.")
		except ValueError as exc:
			frappe.throw(str(exc))
