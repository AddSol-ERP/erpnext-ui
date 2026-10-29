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

		new_rate = float(pricing["standard_rate"] or 0)
		new_amount = float(pricing["amount"] or 0)

		# Capture the values ERPNext already derived during super().validate()
		# (from the pre-pricing rate) so we can scale them proportionally.
		old_rate = float((row.get("rate") if hasattr(row, "get") else getattr(row, "rate", 0)) or 0)
		old_amount = float((row.get("amount") if hasattr(row, "get") else getattr(row, "amount", 0)) or 0)

		if hasattr(row, "rate"):
			row.rate = new_rate
		if hasattr(row, "amount"):
			row.amount = new_amount

		# Prevent ERPNext from auto-deriving a discount from price_list_rate
		# (which would re-introduce a discount the buyer did not ask for now that
		# the standard rate differs from the list rate) and clear any stale
		# auto-computed discount from super().validate().
		if hasattr(row, "price_list_rate"):
			row.price_list_rate = new_rate
		if hasattr(row, "discount_percentage"):
			row.discount_percentage = 0
		if hasattr(row, "discount_amount"):
			row.discount_amount = 0

		# Scale the derived currency/net/stock fields so they agree with the new
		# rate/amount instead of staying stale (which is what made Net Rate,
		# Net Amount, base_* and Taxable Value not update).
		if old_rate and old_rate != new_rate:
			factor = new_rate / old_rate
		elif old_amount and old_amount != new_amount:
			factor = new_amount / old_amount
		elif old_rate == 0 and new_rate:
			# No prior derived values to scale: seed them from the new rate.
			factor = None
		else:
			factor = 1.0

		if factor is None:
			exchange = float(getattr(doc, "conversion_rate", None) or getattr(doc, "exchange_rate", None) or 1.0)
			for field, val in (("net_rate", new_rate), ("base_rate", new_rate * exchange), ("base_net_rate", new_rate * exchange)):
				if hasattr(row, field):
					setattr(row, field, val)
			for field, val in (("net_amount", new_amount), ("base_amount", new_amount * exchange), ("base_net_amount", new_amount * exchange), ("taxable_value", new_amount)):
				if hasattr(row, field):
					setattr(row, field, val)
			if hasattr(row, "stock_uom_rate"):
				row.stock_uom_rate = new_rate

		if factor is not None:
			for field in ("net_rate", "base_rate", "base_net_rate", "stock_uom_rate"):
				if hasattr(row, field):
					old_val = float((row.get(field) if hasattr(row, "get") else getattr(row, field, 0)) or 0)
					setattr(row, field, old_val * factor)
			for field in ("net_amount", "base_amount", "base_net_amount", "taxable_value"):
				if hasattr(row, field):
					old_val = float((row.get(field) if hasattr(row, "get") else getattr(row, field, 0)) or 0)
					setattr(row, field, old_val * factor)

	# Recompute document totals/taxes from the new line amounts so priced lines
	# actually contribute to the PO/PI/etc. total (super().validate() already ran
	# with the pre-pricing amounts).
	if hasattr(doc, "calculate_taxes_and_totals"):
		try:
			doc.calculate_taxes_and_totals()
		except Exception:
			pass


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
