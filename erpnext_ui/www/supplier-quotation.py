import os

import frappe
from frappe.website.page_renderers.template_page import TemplatePage

no_cache = 1


class SupplierQuotationPage(TemplatePage):
	def __init__(self, path, http_status_code=None):
		self.path = path
		self.http_status_code = http_status_code or 200
		self.source = open(os.path.join(frappe.get_app_path("erpnext_ui", "www"), "supplier-quotation.html")).read()
		self.context = {}
		self.base_template_path = "templates/base.html"
		self.set_missing_values()

	def render(self):
		self.set_headers()
		return self.source


def get_context(context):
	context.no_sidebar = True
	context.no_header = True
	context.no_footer = True
	return context


def get_renderer(path, http_status_code=None):
	if path.rstrip(".html") == "supplier-quotation":
		return SupplierQuotationPage(path, http_status_code)
	return None
