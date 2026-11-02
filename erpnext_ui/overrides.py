import frappe
from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice
from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import PurchaseInvoice
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice
from erpnext.buying.doctype.purchase_order.purchase_order import PurchaseOrder
from erpnext.buying.doctype.supplier_quotation.supplier_quotation import SupplierQuotation
from erpnext.selling.doctype.quotation.quotation import Quotation
from erpnext.selling.doctype.sales_order.sales_order import SalesOrder
from erpnext.stock.doctype.delivery_note.delivery_note import DeliveryNote
from erpnext.stock.doctype.material_request.material_request import MaterialRequest
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
	if doc.doctype == "Material Request" and doc.get("material_request_type") != "Purchase":
		return
	for row in doc.get("items") or []:
		item_code = row.get("item_code") if hasattr(row, "get") else getattr(row, "item_code", None)
		if not item_code:
			continue
		if not uom_pricing.get_item_pricing(item_code, side)["enabled"]:
			continue
		doc_qty = float((row.get("qty") if hasattr(row, "get") else getattr(row, "qty", 0)) or 0)
		if not doc_qty:
			continue
		# A standard piece rate must never masquerade as a pricing-UOM rate.
		per_uom_rate = None
		if hasattr(row, "get"):
			per_uom_rate = row.get("custom_rate_per_pricing_uom")
		else:
			per_uom_rate = getattr(row, "custom_rate_per_pricing_uom", None)
		per_uom_rate_entered = bool(per_uom_rate) and float(per_uom_rate) > 0
		if not per_uom_rate_entered:
			raise ValueError("Rate per UOM is required for item " + item_code)
		# User-entered chargeable qty in the pricing UOM; fall back to using
		# the calculated value (which is what happens when the field was not yet
		# added to the row form, so it stays blank).
		chargeable_override = None
		if hasattr(row, "get"):
			cq = row.get("custom_chargeable_qty")
		else:
			cq = getattr(row, "custom_chargeable_qty", None)
		if cq not in (None, "", 0, 0.0) and str(cq).strip():
			try:
				chargeable_override = float(cq)
			except (TypeError, ValueError) as exc:
				raise ValueError("Invalid chargeable quantity for item " + item_code) from exc
		try:
			pricing = uom_pricing.get_pricing_line(
				item_code,
				float(per_uom_rate or 0),
				doc_qty,
				side,
				direct_entry_value=None,
				chargeable_override=chargeable_override,
			)
		except ValueError as exc:
			raise ValueError(f"Item {item_code}: {exc}") from exc

		row.custom_estimated_chargeable_qty = pricing["calculated_chargeable_qty"]
		row.custom_estimated_pricing_amount = (
			pricing["calculated_chargeable_qty"] * float(per_uom_rate)
			if pricing["calculated_chargeable_qty"] is not None
			else None
		)
		row.custom_pricing_uom = pricing["pricing_uom"]
		row.custom_pricing_snapshot = frappe.as_json(
			{
				"pricing_uom": pricing["pricing_uom"],
				"chargeable_qty": pricing["chargeable_qty"],
				"calculated_chargeable_qty": pricing["calculated_chargeable_qty"],
				"rule": pricing["rule"],
				"params_by_symbol": uom_pricing.get_item_pricing(item_code, side)["params_by_symbol"],
			}
		)
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

		# Enforce +/- tolerance from the enabled UI Uom Pricing Rule, if configured.
		tolerance_plus = float(pricing.get("tolerance_plus") or 0)
		tolerance_minus = float(pricing.get("tolerance_minus") or 0)
		if tolerance_plus > 0 or tolerance_minus > 0:
			calc_qty = float(pricing["calculated_chargeable_qty"] or 0)
			override_qty = float(pricing["chargeable_qty"] or 0)
			if calc_qty > 0:
				ratio = override_qty / calc_qty
				too_high = tolerance_plus > 0 and ratio > (1 + tolerance_plus / 100)
				too_low = tolerance_minus > 0 and ratio < (1 - tolerance_minus / 100)
				if too_high or too_low:
					raise ValueError(
						f"Chargeable qty {override_qty} "
						f"(per {pricing['pricing_uom']}) "
						f"is outside tolerance "
						f"[{100 - tolerance_minus:.1f}% — {100 + tolerance_plus:.1f}%] "
						f"of the calculated {calc_qty} "
						f"(per {pricing['pricing_uom']}). "
						f"Please adjust or obtain approval before submit."
					)

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
			exchange = float(
				getattr(doc, "conversion_rate", None) or getattr(doc, "exchange_rate", None) or 1.0
			)
			for field, val in (
				("net_rate", new_rate),
				("base_rate", new_rate * exchange),
				("base_net_rate", new_rate * exchange),
			):
				if hasattr(row, field):
					setattr(row, field, val)
			for field, val in (
				("net_amount", new_amount),
				("base_amount", new_amount * exchange),
				("base_net_amount", new_amount * exchange),
				("taxable_value", new_amount),
			):
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
	# Material Request inherits this method through AccountsController, but its
	# schema has no currency/tax fields. Method presence is not a capability check.
	if doc.doctype != "Material Request" and hasattr(doc, "calculate_taxes_and_totals"):
		doc.calculate_taxes_and_totals()


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


class UomPricingMaterialRequest(MaterialRequest):
	"""Reprice a Purchase indent's rows from the rate per pricing UOM.

	Material Request is an unvalued requisition: it has `rate` and `amount` on
	its items but no currency/tax fields. It inherits `calculate_taxes_and_totals`
	through AccountsController, so the shared helper explicitly skips the
	totals pass for this DocType and only writes the line values. That is deliberate -- an indent
	carries the agreed rate so the Purchase Order made from it starts from the
	figure the buyer negotiated instead of zero. `_apply_uom_pricing` already
	gates on the Buying switch, so Transfer/Issue/Manufacture purposes (which
	never resolve a buying rule) are left untouched.
	"""

	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "buying")


class UomPricingSupplierQuotation(SupplierQuotation):
	def validate(self):
		super().validate()
		_apply_uom_pricing(self, "buying")
