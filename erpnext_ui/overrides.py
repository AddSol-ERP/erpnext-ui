import frappe
from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice
from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import PurchaseInvoice
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice
from erpnext.buying.doctype.purchase_order.purchase_order import PurchaseOrder
from erpnext.selling.doctype.quotation.quotation import Quotation
from erpnext.selling.doctype.sales_order.sales_order import SalesOrder
from erpnext.stock.doctype.delivery_note.delivery_note import DeliveryNote
from erpnext.stock.doctype.purchase_receipt.purchase_receipt import PurchaseReceipt
from erpnext.stock.doctype.quality_inspection.quality_inspection import (
	QualityInspection as StockQualityInspection,
)


class QualityInspection(StockQualityInspection):
	def _repair_inspected_by(self):
		current = (self.inspected_by or "").strip()
		if current.lower() in ("", "user"):
			self.inspected_by = frappe.session.user

	def insert(self, *args, **kwargs):
		self._repair_inspected_by()
		return super().insert(*args, **kwargs)

	def before_validate(self):
		self._repair_inspected_by()


def _apply_uom_pricing(doc, side):
	from erpnext_ui import uom_pricing

	# Returns (credit/debit notes) must reverse the original transaction's pricing
	# UOM, rate and measure snapshot. ERPNext's return creation already copies the
	# original line values, so re-resolving the Item rule here could silently
	# reprice against a (possibly changed) configuration. Skip entirely.
	if getattr(doc, "is_return", 0):
		return
	if not uom_pricing.is_uom_pricing_enabled(side):
		return
	for row in doc.get("items") or []:
		item_code = row.get("item_code") if hasattr(row, "get") else getattr(row, "item_code", None)
		if not item_code:
			continue
		doc_qty = float((row.get("qty") if hasattr(row, "get") else getattr(row, "qty", 0)) or 0)
		if not doc_qty:
			continue
		# Prefer the dedicated per-UOM rate field; fall back to `rate` for
		# documents created before the field existed or when pricing is off.
		per_uom_rate = None
		if hasattr(row, "get"):
			per_uom_rate = row.get("custom_rate_per_pricing_uom")
		else:
			per_uom_rate = getattr(row, "custom_rate_per_pricing_uom", None)
		if not per_uom_rate:
			per_uom_rate = row.get("rate") if hasattr(row, "get") else getattr(row, "rate", 0)
		try:
			pricing = uom_pricing.get_pricing_line(
				item_code,
				float(per_uom_rate or 0),
				doc_qty,
				side,
			)
		except ValueError:
			continue
		if hasattr(row, "rate"):
			row.rate = pricing["standard_rate"]
		if hasattr(row, "amount"):
			row.amount = pricing["amount"]


class UomPricingPurchaseReceipt(PurchaseReceipt):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "buying")


class UomPricingPurchaseInvoice(PurchaseInvoice):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "buying")


class UomPricingPurchaseOrder(PurchaseOrder):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "buying")


class UomPricingSalesQuotation(Quotation):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "selling")


class UomPricingSalesOrder(SalesOrder):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "selling")


class UomPricingDeliveryNote(DeliveryNote):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "selling")


class UomPricingSalesInvoice(SalesInvoice):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "selling")


class UomPricingPOSInvoice(POSInvoice):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "selling")
