import os

import frappe

no_cache = 1


def get_context(context):
	context.no_sidebar = True
	context.no_header = True
	context.no_footer = True
	return context


def get_html_content(path=None):
	path = path or "supplier-quotation"
	if not path.endswith(".html"):
		path += ".html"
	file_path = os.path.join(frappe.get_app_path("erpnext_ui", "www"), path)
	if os.path.exists(file_path):
		with open(file_path, "r", encoding="utf-8") as f:
			return f.read()
	return "<html><body>Not found</body></html>"
