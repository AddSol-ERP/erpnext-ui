"""Read-only supplier quotation comparison, respecting document permissions."""
import json

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
		doc.apply_fieldlevel_read_permissions()
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
			"net_total": doc.get("net_total"), "total_taxes_and_charges": doc.get("total_taxes_and_charges"),
			"terms_template": doc.get("tc_name"), "terms": doc.get("terms"),
			"payment_terms_template": doc.get("payment_terms_template"),
			"payment_schedule": [{"payment_term": row.get("payment_term"), "description": row.get("description"),
				"due_date": row.get("due_date"), "invoice_portion": row.get("invoice_portion"),
				"payment_amount": row.get("payment_amount")} for row in (doc.get("payment_schedule") or [])],
			"has_active_order": _has_active_order(doc.name),
			"items": [{"item_code": row.item_code, "item_name": row.item_name, "qty": row.qty,
				"uom": row.uom, "rate": row.rate, "amount": row.amount,
				"pricing_uom": row.get("custom_pricing_uom"),
				"rate_per_pricing_uom": row.get("custom_rate_per_pricing_uom")} for row in doc.items],
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
def save_evaluation(names, ai_request=None):
	frappe.has_permission("UI Quotation Evaluation", "create", throw=True)
	comparison = compare_quotations(names)
	quotation_names = [quote["name"] for quote in comparison["quotations"]]
	for quote in comparison["quotations"]:
		quote["modified"] = frappe.db.get_value("Supplier Quotation", quote["name"], "modified")
	ai_analysis = None
	if ai_request:
		log = frappe.get_doc("UI Quotation AI Request", ai_request)
		log.check_permission("read")
		logged = frappe.parse_json(log.request_content)
		current = dict(comparison)
		current["quotations"] = [{key: value for key, value in quote.items() if key != "modified"} for quote in comparison["quotations"]]
		current["quotations"].sort(key=lambda quote: quote["name"])
		if json.dumps(logged, sort_keys=True, default=str) != json.dumps(current, sort_keys=True, default=str):
			frappe.throw(_("Quotation data changed since the AI analysis. Run analysis again before saving it."))
		ai_analysis = log.response_content
	comparison["evaluation_date"] = nowdate()
	doc = frappe.get_doc({
		"doctype": "UI Quotation Evaluation",
		"company": comparison["company"],
		"company_currency": comparison["company_currency"],
		"evaluation_date": comparison["evaluation_date"],
		"quotation_names": frappe.as_json(quotation_names),
		"snapshot": frappe.as_json(comparison),
		"ai_request": ai_request,
		"ai_analysis": ai_analysis,
	})
	try:
		frappe.flags.creating_quotation_evaluation = True
		doc.insert()
	finally:
		frappe.flags.creating_quotation_evaluation = False
	return {"name": doc.name}


@frappe.whitelist(allow_guest=False)
def search_quotations(company=None, supplier=None, project=None, material_request=None,
		request_for_quotation=None, status=None, date_from=None, date_to=None, page=0):
	"""Find permitted parent quotations without joining child tables to paginated lists."""
	frappe.has_permission("Supplier Quotation", "read", throw=True)
	try:
		page = int(page)
	except (TypeError, ValueError):
		frappe.throw(_("Invalid page number."))
	if page < 0 or page > 10000:
		frappe.throw(_("Invalid page number."))
	parent_filters = {}
	for key, value in (("company", company), ("supplier", supplier), ("status", status)):
		if value:
			parent_filters[key] = value
	if date_from and date_to and getdate(date_from) > getdate(date_to):
		frappe.throw(_("The start date cannot be after the end date."))
	if date_from and date_to:
		parent_filters["transaction_date"] = ["between", [date_from, date_to]]
	elif date_from:
		parent_filters["transaction_date"] = [">=", date_from]
	elif date_to:
		parent_filters["transaction_date"] = ["<=", date_to]

	child_filters = {key: value for key, value in (
		("project", project), ("material_request", material_request),
		("request_for_quotation", request_for_quotation),
	) if value}
	if child_filters:
		# Restrict the candidate parent names only; get_list below enforces the
		# caller's quotation permissions before any result reaches the client.
		meta = frappe.get_meta("Supplier Quotation Item")
		if any(not meta.get_field(key) or meta.get_field(key).permlevel for key in child_filters):
			frappe.throw(_("A requested quotation filter is unavailable."))
		parents = frappe.get_all("Supplier Quotation Item", filters=child_filters,
			pluck="parent", distinct=True, limit_page_length=0)
		if not parents:
			return {"quotations": [], "has_more": False}
		parent_filters["name"] = ["in", parents]
	rows = frappe.get_list("Supplier Quotation", filters=parent_filters,
		fields=["name", "supplier", "company", "currency", "transaction_date", "valid_till", "docstatus", "grand_total"],
		order_by="modified desc, name desc", limit_start=page * 20, limit_page_length=21)
	return {"quotations": rows[:20], "has_more": len(rows) > 20}


@frappe.whitelist(allow_guest=False)
def list_evaluations(start=0):
	"""Page through the caller's snapshots, checking access to every source."""
	frappe.has_permission("UI Quotation Evaluation", "read", throw=True)
	try:
		start = int(start)
	except (TypeError, ValueError):
		frappe.throw(_("Invalid page position."))
	if start < 0 or start > 100000:
		frappe.throw(_("Invalid page position."))
	result = []
	position = start
	for _batch in range(20):
		candidates = frappe.get_all("UI Quotation Evaluation", filters={"owner": frappe.session.user},
			pluck="name", order_by="creation desc, name desc", limit_start=position, limit_page_length=50)
		for name in candidates:
			doc = frappe.get_doc("UI Quotation Evaluation", name)
			if doc.has_permission("read"):
				if len(result) == 20:
					return {"entries": result, "next_start": position}
				snapshot = frappe.parse_json(doc.snapshot)
				result.append({"name": doc.name, "company": doc.company, "evaluation_date": doc.evaluation_date,
					"quotation_count": len(frappe.parse_json(doc.quotation_names)), "has_ai_analysis": bool(doc.ai_analysis),
					"suppliers": [quote.get("supplier") for quote in snapshot.get("quotations", []) if quote.get("supplier")]})
			position += 1
		if len(candidates) < 50:
			return {"entries": result, "next_start": None}
	return {"entries": result, "next_start": position}


@frappe.whitelist(allow_guest=False)
def get_evaluation(name):
	doc = frappe.get_doc("UI Quotation Evaluation", name)
	doc.check_permission("read")
	return {"name": doc.name, "snapshot": frappe.parse_json(doc.snapshot), "analysis": doc.ai_analysis, "ai_request": doc.ai_request}
