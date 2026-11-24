"""Extend ERPNext's submitted purchase order item update with UOM pricing."""

import json
import math

import frappe
from frappe import _

from erpnext_ui import uom_pricing
from erpnext_ui.pricing_contracts import contract_state, preserved_contract


@frappe.whitelist()
def update_items(parent_doctype_name, trans_items):
	from erpnext.controllers.accounts_controller import update_child_qty_rate

	order = frappe.get_doc("Purchase Order", parent_doctype_name)
	order.check_permission("write")
	if order.docstatus != 1:
		frappe.throw(_("Only submitted Purchase Orders can be updated here."))
	items = json.loads(trans_items) if isinstance(trans_items, str) else trans_items
	if not isinstance(items, list):
		frappe.throw(_("Invalid item list."))
	sources = {row.name: row for row in order.get("items")}
	updates = []
	seen = set()
	for item in items:
		name = item.get("docname")
		if name:
			if name not in sources or name in seen or item.get("item_code") != sources[name].item_code:
				frappe.throw(_("Invalid Purchase Order item."))
			seen.add(name)
		rate = item.get("custom_rate_per_pricing_uom")
		if rate in (None, "", 0, "0", 0.0):
			if name and sources[name].get("custom_rate_per_pricing_uom"):
				frappe.throw(_("Rate per UOM is required for item {0}.").format(item.get("item_code")))
			continue
		if not name:
			frappe.throw(_("Add the new item first, then update its rate per UOM."))
		try:
			rate = float(rate)
			qty = float(item.get("qty") or 0)
		except (TypeError, ValueError):
			frappe.throw(_("Enter a valid quantity and rate per UOM."))
		if not math.isfinite(rate) or rate <= 0 or not math.isfinite(qty) or qty <= 0:
			frappe.throw(_("Quantity and rate per UOM must be positive."))
		source = sources[name]
		contract = preserved_contract(order, source)
		state = contract_state(contract) if contract else uom_pricing.get_item_pricing(source.item_code, "buying")
		if not state.get("enabled"):
			frappe.throw(_("Per-UOM pricing is not enabled for item {0}.").format(source.item_code))
		measure = float(source.get("custom_chargeable_qty") or 0)
		if measure and float(source.qty or 0) != qty:
			measure *= qty / float(source.qty)
		priced = uom_pricing.get_pricing_line(source.item_code, rate, qty, "buying", chargeable_override=measure or None, pricing_state=state)
		baseline = priced["calculated_chargeable_qty"]
		actual = priced["chargeable_qty"]
		if baseline:
			ratio = actual / baseline
			plus, minus = float(priced.get("tolerance_plus") or 0), float(priced.get("tolerance_minus") or 0)
			if (plus and ratio > 1 + plus / 100) or (minus and ratio < 1 - minus / 100):
				frappe.throw(_("Chargeable quantity is outside the configured tolerance for item {0}.").format(source.item_code))
		snapshot = dict(contract["snapshot"]) if contract else {}
		snapshot.update({"pricing_uom": priced["pricing_uom"], "chargeable_qty": actual, "calculated_chargeable_qty": baseline, "rule": priced["rule"], "params_by_symbol": state["params_by_symbol"], "parameter_uoms": state.get("parameter_uoms", {}), "preserve_contract": bool(contract), "baseline_per_unit": baseline / qty if baseline is not None else None, "actual_per_unit": actual / qty})
		item["rate"] = priced["standard_rate"]
		updates.append((name, {"custom_rate_per_pricing_uom": rate, "custom_pricing_uom": priced["pricing_uom"], "custom_chargeable_qty": measure or 0, "custom_estimated_chargeable_qty": baseline, "custom_estimated_pricing_amount": baseline * rate if baseline is not None else None, "custom_pricing_snapshot": frappe.as_json(snapshot)}))
	update_child_qty_rate("Purchase Order", json.dumps(items), order.name, "items")
	for name, values in updates:
		frappe.db.set_value("Purchase Order Item", name, values, update_modified=False)
