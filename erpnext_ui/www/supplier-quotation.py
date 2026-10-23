import frappe

no_cache = 1


def get_context(context):
	context.no_sidebar = True
	context.no_header = True
	context.no_footer = True
	try:
		context.brand_name = (
			frappe.db.get_single_value("UI Supplier Quotation Settings", "brand_name")
			or "Supplier Quotation"
		)
	except Exception:
		# The page can be reached before `bench migrate` has created the
		# settings Single; the JavaScript then falls back to the same label.
		context.brand_name = "Supplier Quotation"
	# The page is served to a guest session. Frappe validates the CSRF token on
	# unsafe methods, and a website page is the only place it can be handed to
	# that session safely. The token itself is not a secret from this browser.
	context.csrf_token = getattr(frappe.session, "csrf_token", "") or ""
	return context
