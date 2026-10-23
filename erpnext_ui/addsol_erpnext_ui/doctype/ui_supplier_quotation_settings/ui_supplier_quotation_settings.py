import frappe
from frappe import _
from frappe.model.document import Document


class UISupplierQuotationSettings(Document):
	def validate(self):
		self.validate_limits()
		self.validate_recipients()
		self.validate_templates()

		from erpnext_ui.supplier_quotation import validate_field_config_rows

		validate_field_config_rows(self.field_config)

	def validate_limits(self):
		bounds = {
			"otp_expiry_minutes": (1, 120),
			"otp_max_attempts": (1, 20),
			"otp_resend_throttle_minutes": (0, 1440),
			"invitation_expiry_days": (1, 365),
			"response_session_minutes": (5, 240),
			"max_suppliers_per_request": (1, 200),
		}
		for fieldname, (minimum, maximum) in bounds.items():
			value = self.get(fieldname)
			if value is None:
				continue
			value = int(value)
			if value < minimum or value > maximum:
				frappe.throw(
					_("{0} must be between {1} and {2}.").format(
						self.meta.get_label(fieldname), minimum, maximum
					)
				)

	def validate_recipients(self):
		from frappe.utils import validate_email_address

		seen = set()
		for row in self.response_recipients:
			email = (row.email or "").strip()
			if not email:
				continue
			validate_email_address(email, throw=True)
			key = email.lower()
			if key in seen:
				frappe.throw(_("Duplicate response recipient: {0}").format(email))
			seen.add(key)
			row.email = email

	def validate_templates(self):
		from erpnext_ui.supplier_quotation import validate_template_text

		if not (self.invitation_subject or "").strip():
			frappe.throw(_("Invitation Subject is required."))
		if not (self.invitation_message or "").strip():
			frappe.throw(_("Invitation Message is required."))
		if len(self.invitation_subject or "") > 140:
			frappe.throw(_("Invitation Subject cannot exceed 140 characters."))
		validate_template_text(self.invitation_subject, _("Invitation Subject"))
		validate_template_text(self.invitation_message, _("Invitation Message"))
		validate_template_text(self.response_subject, _("Response Notification Subject"))
		validate_template_text(self.response_message, _("Response Notification Message"))
