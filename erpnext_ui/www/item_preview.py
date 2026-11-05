import frappe

from erpnext_ui.item_qr import get_public_preview

no_cache = 1


def get_context(context):
	context.no_cache = 1
	context.no_header = True
	context.no_footer = True
	context.no_sidebar = True
	context.show_title = False
	context.preview = None
	context.error = None
	# No raw IDs are accepted on the guest page. A signed label is the only key.
	try:
		context.preview = get_public_preview(frappe.form_dict.get("token"))
	except (ValueError, frappe.DoesNotExistError):
		context.error = "This item label is invalid, unavailable or its receipt was cancelled."
	frappe.local.response.setdefault("headers", {})["X-Robots-Tag"] = "noindex, nofollow"
	frappe.local.response.setdefault("headers", {})["Referrer-Policy"] = "no-referrer"
