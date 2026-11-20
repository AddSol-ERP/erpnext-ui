"""Read-only supplier quotation comparison, respecting document permissions."""
import frappe
from frappe import _
from frappe.utils import getdate, nowdate

@frappe.whitelist(allow_guest=False)
def compare_quotations(names):
	if isinstance(names, str):
		names = frappe.parse_json(names)
	if not isinstance(names, list) or not 2 <= len(names) <= 20:
		frappe.throw(_("Select between 2 and 20 supplier quotations."))
	if any(not isinstance(name, str) or not name for name in names) or len(set(names)) != len(names):
		frappe.throw(_("Select distinct supplier quotations."))
	quotations = []
	company = None
	for name in names:
		doc = frappe.get_doc("Supplier Quotation", name)
		doc.check_permission("read")
		if company and doc.company != company:
			frappe.throw(_("All quotations must belong to the same company."))
		company = doc.company
		quotations.append(doc)
	company_doc = frappe.get_doc("Company", company)
	company_doc.check_permission("read")
	result = []
	for doc in quotations:
		warnings = []
		if doc.docstatus != 1:
			warnings.append(_("This quotation is not submitted."))
		if doc.get("valid_till") and getdate(doc.valid_till) < getdate(nowdate()):
			warnings.append(_("This quotation has expired."))
		if doc.currency != company_doc.default_currency and not doc.get("conversion_rate"):
			warnings.append(_("The quotation has no exchange rate."))
		result.append({
			"name": doc.name, "supplier": doc.supplier, "currency": doc.currency,
			"transaction_date": doc.transaction_date, "valid_till": doc.get("valid_till"),
			"docstatus": doc.docstatus, "grand_total": doc.grand_total,
			"base_grand_total": doc.base_grand_total if doc.currency == company_doc.default_currency or doc.get("conversion_rate") else None,
			"conversion_rate": doc.get("conversion_rate"), "warnings": warnings,
			"has_active_order": _has_active_order(doc.name),
			"items": [{"item_code": row.item_code, "item_name": row.item_name, "qty": row.qty,
				"uom": row.uom, "rate": row.rate, "amount": row.amount} for row in doc.items],
		})
	return {"company": company, "company_currency": company_doc.default_currency, "quotations": result}


def _has_active_order(name):
	return bool(frappe.db.exists("Purchase Order Item", {"supplier_quotation": name, "docstatus": ["<", 2]}))


@frappe.whitelist(allow_guest=False)
def quotation_order_status(names):
	if isinstance(names, str):
		names = frappe.parse_json(names)
	if not isinstance(names, list) or len(names) > 20 or any(not isinstance(name, str) or not name for name in names):
		frappe.throw(_("Invalid quotation selection."))
	result = {}
	for name in set(names):
		doc = frappe.get_doc("Supplier Quotation", name)
		doc.check_permission("read")
		result[name] = _has_active_order(name)
	return result


@frappe.whitelist(allow_guest=False, methods=["POST"])
def create_purchase_order(quotation):
	if not isinstance(quotation, str) or not quotation:
		frappe.throw(_("Select a supplier quotation."))
	frappe.has_permission("Purchase Order", "create", throw=True)
	# Lock the source before checking and inserting so concurrent requests cannot
	# both create an order through this action for the same quotation.
	frappe.db.sql("select name from `tabSupplier Quotation` where name = %s for update", quotation)
	doc = frappe.get_doc("Supplier Quotation", quotation)
	doc.check_permission("read")
	if doc.docstatus != 1 or doc.status in ("Stopped", "Cancelled", "Expired"):
		frappe.throw(_("Only active submitted quotations can be ordered."))
	if doc.get("valid_till") and getdate(doc.valid_till) < getdate(nowdate()):
		frappe.throw(_("This quotation has expired."))
	if _has_active_order(quotation):
		frappe.throw(_("An active purchase order already references this quotation."))
	from erpnext.buying.doctype.supplier_quotation.supplier_quotation import make_purchase_order

	order = make_purchase_order(quotation)
	order.insert()
	return {"name": order.name}


@frappe.whitelist(allow_guest=False, methods=["POST"])
def save_evaluation(names):
	frappe.has_permission("UI Quotation Evaluation", "create", throw=True)
	comparison = compare_quotations(names)
	quotation_names = [quote["name"] for quote in comparison["quotations"]]
	for quote in comparison["quotations"]:
		quote["modified"] = frappe.db.get_value("Supplier Quotation", quote["name"], "modified")
	comparison["evaluation_date"] = nowdate()
	doc = frappe.get_doc({
		"doctype": "UI Quotation Evaluation",
		"company": comparison["company"],
		"company_currency": comparison["company_currency"],
		"evaluation_date": comparison["evaluation_date"],
		"quotation_names": frappe.as_json(quotation_names),
		"snapshot": frappe.as_json(comparison),
	})
	try:
		frappe.flags.creating_quotation_evaluation = True
		doc.insert()
	finally:
		frappe.flags.creating_quotation_evaluation = False
	return {"name": doc.name}
