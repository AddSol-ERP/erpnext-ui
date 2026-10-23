import os

import frappe

no_cache = 1


def get_context(context):
	context.no_sidebar = True
	context.no_header = True
	context.no_footer = True
	return context


def get_html_content(path=None):
	html = open(os.path.join(frappe.get_app_path("erpnext_ui", "www"), "supplier-quotation.html")).read()
	return html
