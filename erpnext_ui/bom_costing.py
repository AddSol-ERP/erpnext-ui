"""Keep native BOM costing, with measured-UOM prices for Price List costing."""

import frappe
from erpnext.manufacturing.doctype.bom.bom import BOM
from erpnext.stock.get_item_details import check_packing_list, get_item_price
from frappe.utils import flt, nowdate

from erpnext_ui import uom_pricing


def apply_pricing_uom(doc, row):
	if doc.rm_cost_as_per != "Price List" or row.get("sourced_by_supplier"):
		return False
	if row.get("bom_no") and doc.get("set_rate_of_sub_assembly_item_based_on_bom"):
		return False
	if frappe.db.get_value("Item", row.item_code, "is_customer_provided_item"):
		return False
	state = uom_pricing.get_item_pricing(row.item_code, "buying")
	if not state["enabled"]:
		return False
	qty = flt(row.qty)
	factor = flt(row.get("conversion_factor")) or 1
	measure = row.get("custom_chargeable_qty") or None
	line = uom_pricing.get_pricing_line(
		row.item_code,
		0,
		qty * factor,
		"buying",
		chargeable_override=measure,
		pricing_state=state,
	)
	pricing_uom = state["pricing_uom"]
	# Exact UOM prevents a blank/stock-UOM price masquerading as a price per Kg/Ltr.
	prices = get_item_price(
		{
			"price_list": doc.buying_price_list,
			"uom": pricing_uom,
			"transaction_date": nowdate(),
		},
		row.item_code,
	)
	price = next(
		(
			entry
			for entry in prices
			if entry[2] == pricing_uom and check_packing_list(entry[0], line["chargeable_qty"], row.item_code)
		),
		None,
	)
	if price is None:
		frappe.throw(f"No valid Item Price for {row.item_code} per {pricing_uom} in {doc.buying_price_list}.")
	rate = price[1]

	rate = flt(rate) * flt(doc.get("plc_conversion_rate") or 1) / flt(doc.get("conversion_rate") or 1)
	row.custom_pricing_uom = pricing_uom
	row.custom_rate_per_pricing_uom = rate
	row.custom_calculated_chargeable_qty = line["calculated_chargeable_qty"]
	row.rate = line["chargeable_qty"] * rate / qty
	return True


class UomPricingBOM(BOM):
	def validate(self):
		from erpnext_ui.operation_approval_rules import apply_bom_defaults, validate_rules
		apply_bom_defaults(self)
		validate_rules(self)
		super().validate()

	def calculate_rm_cost(self, save=False):
		old_rates = [row.rate for row in self.get("items")]
		# Native controller owns valuation, last purchase, subassemblies and defaults.
		super().calculate_rm_cost(save=False)
		for row, old_rate in zip(self.get("items"), old_rates, strict=False):
			if row.is_stock_item and apply_pricing_uom(self, row):
				row.base_rate = flt(row.rate) * flt(self.conversion_rate)
				row.amount = flt(
					flt(row.rate, row.precision("rate")) * flt(row.qty, row.precision("qty")),
					row.precision("amount"),
				)
				row.base_amount = row.amount * flt(self.conversion_rate)
			else:
				row.custom_pricing_uom = None
				row.custom_rate_per_pricing_uom = 0
				row.custom_calculated_chargeable_qty = None
			if save and old_rate != row.rate:
				row.db_update()
		self.raw_material_cost = sum(flt(row.amount) for row in self.get("items"))
		self.base_raw_material_cost = sum(flt(row.base_amount) for row in self.get("items"))


def preview_material_rates(payload):
	data = frappe.parse_json(payload)
	if not isinstance(data, dict) or data.get("doctype") != "BOM":
		frappe.throw("Select a BOM to calculate material rates.")
	if data.get("name"):
		frappe.get_doc("BOM", data["name"]).check_permission("write")
	else:
		frappe.has_permission("BOM", "create", throw=True)
	frappe.get_doc("Company", data.get("company")).check_permission("read")
	if data.get("project"):
		project = frappe.get_doc("Project", data["project"])
		project.check_permission("read")
		if project.company != data.get("company"):
			frappe.throw("BOM company must match its project.")
	if data.get("rm_cost_as_per") == "Price List":
		frappe.has_permission("Item Price", "read", throw=True)
		frappe.get_doc("Price List", data.get("buying_price_list")).check_permission("read")
	doc = frappe.get_doc(data)
	if not doc.currency:
		doc.currency = doc.company_currency()
	if doc.rm_cost_as_per == "Price List":
		doc.price_list_currency = frappe.get_cached_value("Price List", doc.buying_price_list, "currency")
		doc.plc_conversion_rate = None
	doc.set_conversion_rate()
	doc.set_plc_conversion_rate()
	for row in doc.get("items"):
		if not row.item_code:
			continue
		frappe.get_doc("Item", row.item_code).check_permission("read")
		if row.get("bom_no"):
			frappe.get_doc("BOM", row.bom_no).check_permission("read")
		args = row.as_dict()
		args.update(company=doc.company, bom_no=row.get("bom_no") or "")
		details = doc.get_bom_material_detail(args)
		if details.get("bom_no"):
			frappe.get_doc("BOM", details["bom_no"]).check_permission("read")
		row.update(details)
		if not apply_pricing_uom(doc, row):
			row.custom_pricing_uom = None
			row.custom_rate_per_pricing_uom = 0
			row.custom_calculated_chargeable_qty = None
		row.amount = flt(row.rate) * flt(row.qty)
	return {"items": [row.as_dict() for row in doc.get("items")]}
