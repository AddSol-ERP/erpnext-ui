"""Seed the supplier quotation response settings without overwriting choices."""

import frappe

from erpnext_ui.supplier_quotation import (
	SETTINGS_DOCTYPE,
	validate_template_text,
)

DEFAULT_INVITATION_SUBJECT = "Request for quotation {material_request}"
DEFAULT_INVITATION_MESSAGE = (
	"Dear Supplier,\n\n"
	"Please provide your best rates for the items listed in the attached request. "
	"Open the link below to enter your response. You will receive a verification "
	"code by email before any request details are shown.\n\n"
	"{link}\n\n"
	"Regards,\nPurchase Team"
)
DEFAULT_RESPONSE_SUBJECT = "Supplier quotation received: {material_request} / {supplier}"
DEFAULT_RESPONSE_MESSAGE = (
	"A supplier quotation response has been received.\n\n"
	"Material Request: {material_request}\n"
	"Supplier: {supplier}\n"
	"Supplier Quotation: {supplier_quotation}\n\n"
	"Review it in ERPNext."
)


def setup_supplier_quotation_settings():
	"""Create the settings Single and discover Supplier Quotation fields.

	`after_migrate` runs on every deployment. A first run seeds the defaults and
	the field catalog; later runs only append metadata fields that appeared
	since the last migration, preserving every administrator choice.
	"""
	if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
		return

	settings = frappe.get_single(SETTINGS_DOCTYPE)

	if settings.is_new():
		settings.enabled = 1
		settings.brand_name = settings.brand_name or "Supplier Quotation"
		settings.invitation_subject = DEFAULT_INVITATION_SUBJECT
		settings.invitation_message = DEFAULT_INVITATION_MESSAGE
		settings.response_subject = DEFAULT_RESPONSE_SUBJECT
		settings.response_message = DEFAULT_RESPONSE_MESSAGE
	else:
		# Older installations can have an empty template after a partial setup.
		# Fill only the blank values; a configured wording is never replaced.
		if not (settings.invitation_subject or "").strip():
			settings.invitation_subject = DEFAULT_INVITATION_SUBJECT
		if not (settings.invitation_message or "").strip():
			settings.invitation_message = DEFAULT_INVITATION_MESSAGE
		if not (settings.response_subject or "").strip():
			settings.response_subject = DEFAULT_RESPONSE_SUBJECT
		if not (settings.response_message or "").strip():
			settings.response_message = DEFAULT_RESPONSE_MESSAGE

	validate_template_text(settings.invitation_subject, "Invitation Subject")
	validate_template_text(settings.invitation_message, "Invitation Message")
	validate_template_text(settings.response_subject, "Response Notification Subject")
	validate_template_text(settings.response_message, "Response Notification Message")

	from erpnext_ui.supplier_quotation import sync_supplier_quotation_field_config

	sync_supplier_quotation_field_config(settings)
