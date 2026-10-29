import frappe
from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice
from erpnext.buying.doctype.purchase_receipt.purchase_receipt import PurchaseReceipt
from erpnext.selling.doctype.quotation.quotation import Quotation
from erpnext.selling.doctype.sales_order.sales_order import SalesOrder
from erpnext.stock.doctype.delivery_note.delivery_note import DeliveryNote
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
		try:
			pricing = uom_pricing.get_pricing_line(
				item_code,
				float((row.get("rate") if hasattr(row, "get") else getattr(row, "rate", 0)) or 0),
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


class UomPricingPurchaseInvoice(PurchaseReceipt):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "buying")


class UomPricingPurchaseOrder(PurchaseReceipt):
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
