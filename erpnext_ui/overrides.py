import frappe
from erpnext.buying.doctype.purchase_receipt.purchase_receipt import PurchaseReceipt
from erpnext.stock.doctype.quality_inspection.quality_inspection import (
	QualityInspection as StockQualityInspection,
)


class QualityInspection(StockQualityInspection):
	"""Repairs ERPNext's `inspected_by` default, which is not a User id.

	Stock ERPNext declares:

	    {"fieldname": "inspected_by", "fieldtype": "Link", "options": "User",
	     "default": "user", "reqd": 1, "oldfieldtype": "Data"}

	It used to be free text and was converted to a Link without clearing the
	default. Frappe evaluates `default` as a LITERAL, so every Quality
	Inspection is born holding `inspected_by = "user"`, and `Document.insert`
	rejects the write with:

	    LinkValidationError: Could not find Inspected By: user

	ERPNext never trips on it because the desk always builds the document
	through `make_quality_inspection`, which assigns `frappe.session.user`
	(erpnext/stock/doctype/quality_inspection/quality_inspection.py:442). That
	is the only assignment in the entire doctype. Every client that POSTs a
	Quality Inspection directly -- including our SPA, via `saveDocument` in
	pages/Quality/entry/InspectionForm -- hits this.

	WHY THIS IS A CLASS OVERRIDE AND NOT A `doc_events` HOOK
	-------------------------------------------------------
	`Document.insert` calls these in order (frappe/model/document.py:296-310):

	    self._set_defaults()            # stamps inspected_by = "user"
	    ...
	    self._validate_links()          # <-- RAISES HERE, line 302
	    self.run_method("before_insert")
	    ...
	    self.run_before_save_methods()   # before_validate / validate
	    self._validate()

	`_validate_links` is ahead of every hook. A `before_validate` or
	`before_insert` handler is therefore already too late to prevent the
	raise, and `before_validate` does not run at all on create (it is gated on
	`_action in ("save", "submit")`, and `_action` is not "save" during an
	insert). An earlier attempt at this fix registered exactly that hook and
	was correct in intent and useless in practice.

	Overriding `insert` puts the repair ahead of the raise. The field is set to
	a real user id, so the subsequent `_set_defaults()` inside `super().insert`
	leaves it alone -- `update_if_missing` only fills a field that is still
	`None`.

	Every instantiation path goes through `get_controller`, which honours
	`override_doctype_class`, so this covers the REST API, the desk, a server
	script and `frappe.new_doc` alike.
	"""

	def _repair_inspected_by(self):
		"""Replace the bogus default with the session user.

		Deliberately narrow. Only "", "user" and case/whitespace variants of it
		are replaced. An `inspected_by` naming somebody else is left alone,
		because recording an inspection performed on another person's behalf is
		legitimate, and assigning `session.user` unconditionally would quietly
		rewrite that audit field to whoever happened to save last.
		"""
		current = (self.inspected_by or "").strip()
		if current.lower() in ("", "user"):
			self.inspected_by = frappe.session.user

	def insert(self, *args, **kwargs):
		# Repaired BEFORE super() on purpose -- see the class docstring for why
		# no hook can do this.
		self._repair_inspected_by()
		return super().insert(*args, **kwargs)

	def before_validate(self):
		# Covers the update and submit paths, where `_action` is "save"/"submit"
		# and `before_validate` does run. A draft created through any path that
		# still carries "user" would otherwise fail the same link check on every
		# re-save. ERPNext does not define this method, so there is nothing to
		# call super() with.
		self._repair_inspected_by()


class UomPricingPurchaseReceipt(PurchaseReceipt):
	"""Recalculate UOM based pricing on a Purchase Receipt before it is written.

	Under UOM based pricing the accepted chargeable quantity is the pricing
	measure and the standard line rate is derived as amount / document quantity, so
	the receipt line amounts have to be recomputed from the effective pricing rule
	before the document is saved or submitted.

	The accepted measure itself comes from the configured receiving strategy; the
	calculation lives in erpnext_ui/uom_pricing.py and is reused here.
	"""

	def validate(self):
		super().validate()
		self.apply_uom_pricing()

	def apply_uom_pricing(self):
		from erpnext_ui import uom_pricing

		if not uom_pricing.is_uom_pricing_enabled("buying"):
			return
		for row in self.get("items") or []:
			item_code = row.get("item_code") or ""
			doc_qty = float(row.get("qty") or 0)
			if not item_code or not doc_qty:
				continue
			try:
				pricing = uom_pricing.get_pricing_line(item_code, float(row.get("rate") or 0), doc_qty)
			except ValueError:
				continue
			row.rate = pricing["standard_rate"]
			row.amount = pricing["amount"]


class UomPricingPurchaseInvoice(PurchaseReceipt):
	"""Recalculate UOM based pricing on a Purchase Invoice before it is written.

	Under UOM based pricing the accepted chargeable quantity is the pricing
	measure and the standard line rate is derived as amount / document quantity, so
	the invoice line amounts have to be recomputed from the effective pricing rule
	before the document is saved or submitted.

	The accepted measure itself comes from the linked Purchase Receipt; the
	calculation lives in erpnext_ui/uom_pricing.py and is reused here.
	"""

	def validate(self):
		super().validate()
		self.apply_uom_pricing()

	def apply_uom_pricing(self):
		from erpnext_ui import uom_pricing

		if not uom_pricing.is_uom_pricing_enabled("buying"):
			return
		for row in self.get("items") or []:
			item_code = row.get("item_code") or ""
			doc_qty = float(row.get("qty") or 0)
			if not item_code or not doc_qty:
				continue
			try:
				pricing = uom_pricing.get_pricing_line(item_code, float(row.get("rate") or 0), doc_qty)
			except ValueError:
				continue
			row.rate = pricing["standard_rate"]
			row.amount = pricing["amount"]


class UomPricingPurchaseOrder(PurchaseReceipt):
	"""Recalculate UOM based pricing on a Purchase Order before it is written.

	Under UOM based pricing the accepted chargeable quantity is the pricing
	measure and the standard line rate is derived as amount / document quantity, so
	the order line amounts have to be recomputed from the effective pricing rule
	before the document is saved or submitted.

	The accepted measure itself comes from the resolved pricing rule; the
	calculation lives in erpnext_ui/uom_pricing.py and is reused here.
	"""

	def validate(self):
		super().validate()
		self.apply_uom_pricing()

	def apply_uom_pricing(self):
		from erpnext_ui import uom_pricing

		if not uom_pricing.is_uom_pricing_enabled("buying"):
			return
		for row in self.get("items") or []:
			item_code = row.get("item_code") or ""
			doc_qty = float(row.get("qty") or 0)
			if not item_code or not doc_qty:
				continue
			try:
				pricing = uom_pricing.get_pricing_line(item_code, float(row.get("rate") or 0), doc_qty)
			except ValueError:
				continue
			row.rate = pricing["standard_rate"]
			row.amount = pricing["amount"]
