"""Seed the supplier quotation response settings without overwriting choices."""

import frappe

from erpnext_ui.supplier_quotation import (
	ACKNOWLEDGEMENT_TEMPLATE_KEYS,
	DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_MESSAGE,
	DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_PRINT_FORMAT,
	DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_SUBJECT,
	DEFAULT_SUPPLIER_QUOTATION_EMAIL_MESSAGE,
	DEFAULT_SUPPLIER_QUOTATION_EMAIL_SUBJECT,
	SETTINGS_DOCTYPE,
	SUPPLIER_QUOTATION_EMAIL_TEMPLATE_KEYS,
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
	"The response is recorded and ready for review."
)
LEGACY_DEFAULT_RESPONSE_MESSAGE = DEFAULT_RESPONSE_MESSAGE.replace(
	"The response is recorded and ready for review.", "Review it in ERPNext."
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
	settings_changed = False

	if settings.is_new():
		settings_changed = True
		settings.enabled = 1
		settings.brand_name = settings.brand_name or "Supplier Quotation"
		settings.invitation_subject = DEFAULT_INVITATION_SUBJECT
		settings.invitation_message = DEFAULT_INVITATION_MESSAGE
		settings.response_subject = DEFAULT_RESPONSE_SUBJECT
		settings.response_message = DEFAULT_RESPONSE_MESSAGE
		settings.supplier_acknowledgement_subject = DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_SUBJECT
		settings.supplier_acknowledgement_message = DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_MESSAGE
		settings.supplier_quotation_email_subject = DEFAULT_SUPPLIER_QUOTATION_EMAIL_SUBJECT
		settings.supplier_quotation_email_message = DEFAULT_SUPPLIER_QUOTATION_EMAIL_MESSAGE
		settings.supplier_acknowledgement_print_format = DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_PRINT_FORMAT
	else:
		# Older installations can have an empty template after a partial setup.
		# Fill only the blank values; a configured wording is never replaced.
		if not (settings.invitation_subject or "").strip():
			settings.invitation_subject = DEFAULT_INVITATION_SUBJECT
			settings_changed = True
		if not (settings.invitation_message or "").strip():
			settings.invitation_message = DEFAULT_INVITATION_MESSAGE
			settings_changed = True
		if not (settings.response_subject or "").strip():
			settings.response_subject = DEFAULT_RESPONSE_SUBJECT
			settings_changed = True
		if not (settings.response_message or "").strip():
			settings.response_message = DEFAULT_RESPONSE_MESSAGE
			settings_changed = True
		elif settings.response_message.strip() == LEGACY_DEFAULT_RESPONSE_MESSAGE:
			# Replace only our old seed value; preserve administrator wording.
			settings.response_message = DEFAULT_RESPONSE_MESSAGE
			settings_changed = True
		if not (settings.supplier_acknowledgement_subject or "").strip():
			settings.supplier_acknowledgement_subject = DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_SUBJECT
			settings_changed = True
		if not (settings.supplier_acknowledgement_message or "").strip():
			settings.supplier_acknowledgement_message = DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_MESSAGE
			settings_changed = True
		if not (settings.supplier_quotation_email_subject or "").strip():
			settings.supplier_quotation_email_subject = DEFAULT_SUPPLIER_QUOTATION_EMAIL_SUBJECT
			settings_changed = True
		if not (settings.supplier_quotation_email_message or "").strip():
			settings.supplier_quotation_email_message = DEFAULT_SUPPLIER_QUOTATION_EMAIL_MESSAGE
			settings_changed = True
		if not (settings.supplier_acknowledgement_print_format or "").strip():
			settings.supplier_acknowledgement_print_format = DEFAULT_SUPPLIER_ACKNOWLEDGEMENT_PRINT_FORMAT
			settings_changed = True

	validate_template_text(settings.invitation_subject, "Invitation Subject")
	validate_template_text(settings.invitation_message, "Invitation Message")
	validate_template_text(settings.response_subject, "Response Notification Subject")
	validate_template_text(settings.response_message, "Response Notification Message")
	validate_template_text(
		settings.supplier_acknowledgement_subject,
		"Supplier Acknowledgement Subject",
		ACKNOWLEDGEMENT_TEMPLATE_KEYS,
	)
	validate_template_text(
		settings.supplier_acknowledgement_message,
		"Supplier Acknowledgement Message",
		ACKNOWLEDGEMENT_TEMPLATE_KEYS,
	)
	validate_template_text(
		settings.supplier_quotation_email_subject,
		"Supplier Quotation Email Subject",
		SUPPLIER_QUOTATION_EMAIL_TEMPLATE_KEYS,
	)
	validate_template_text(
		settings.supplier_quotation_email_message,
		"Supplier Quotation Email Message",
		SUPPLIER_QUOTATION_EMAIL_TEMPLATE_KEYS,
	)

	from erpnext_ui.supplier_quotation import sync_supplier_quotation_field_config

	# Populate the field catalog *before* saving the scalar defaults. A new
	# Single has no field_config rows yet, and `validate_field_config_rows`
	# refuses an empty set, so saving first would make the first migrate fail.
	sync_supplier_quotation_field_config(settings)

	# `sync_supplier_quotation_field_config` saves only when the *catalog*
	# changed. An existing site whose catalog is already current would otherwise
	# discard these backfills: the fields would read blank on every migrate.
	if settings_changed:
		settings.save(ignore_permissions=True)
