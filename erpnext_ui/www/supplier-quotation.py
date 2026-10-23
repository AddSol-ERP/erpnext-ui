import os

from frappe.sessions import get_csrf_token

no_cache = 1


def get_context(context):
	context.no_sidebar = True
	context.no_header = True
	context.no_footer = True
	context.csrf_token = get_csrf_token()
	return context


def get_html_content(path=None):
	path = path or "supplier-quotation"
	if not path.endswith(".html"):
		path += ".html"
	app_path = os.path.dirname(os.path.abspath(__file__))
	file_path = os.path.join(app_path, path)
	if os.path.exists(file_path):
		with open(file_path, "r", encoding="utf-8") as f:
			return f.read()
	return "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>Supplier Quotation</body></html>"
