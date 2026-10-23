import frappe
from frappe import _
from frappe.website.page_renderers.template_page import TemplatePage

no_cache = 1


class SupplierQuotationPage(TemplatePage):
	def __init__(self, path, http_status_code=None):
		self.path = path
		self.http_status_code = http_status_code
		self.source = frappe.read_file(frappe.get_app_path("erpnext_ui", "www", "supplier-quotation.html"))
		self.set_missing_values()

	def render(self):
		# Serve as-is without Jinja rendering to avoid template validation issues
		self.set_headers()
		return self.source


def get_context(context):
	context.no_sidebar = True
	context.no_header = True
	context.no_footer = True
	return context


def get_renderer(path):
	if path == "supplier-quotation":
		return SupplierQuotationPage(path)
	return None
