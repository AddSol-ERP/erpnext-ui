"""Resolve preserved document pricing from persisted rows, never client snapshots."""

import json
import math

import frappe

LINKS = {
	"Purchase Order": [("Supplier Quotation Item", "supplier_quotation_item")],
	"Purchase Receipt": [("Purchase Order Item", "purchase_order_item")],
	"Purchase Invoice": [("Purchase Receipt Item", "pr_detail"), ("Purchase Order Item", "po_detail")],
}


def preserved_contract(doc, row):
	candidates = []
	if row.get("name") and doc.get("name"):
		candidates.append((doc.doctype + " Item", {"name": row.name, "parent": doc.name}, False))
	for doctype, field in LINKS.get(doc.doctype, []):
		if row.get(field):
			candidates.append((doctype, {"name": row.get(field), "docstatus": 1}, True))
	for doctype, filters, linked in candidates:
		source = frappe.db.get_value(
			doctype,
			filters,
			[
				"item_code",
				"qty",
				"custom_rate_per_pricing_uom",
				"custom_chargeable_qty",
				"custom_pricing_snapshot",
			],
			as_dict=True,
		)
		if (
			not source
			or source.item_code != row.get("item_code")
			or not source.get("custom_pricing_snapshot")
		):
			continue
		snapshot = json.loads(source.custom_pricing_snapshot)
		if not snapshot.get("preserve_contract"):
			continue
		return {"snapshot": snapshot, "source": source, "linked": linked}
	return None


def contract_state(contract):
	snapshot = contract["snapshot"]
	return {
		"enabled": True,
		"feature_enabled": True,
		"item_group": snapshot.get("item_group"),
		"pricing_uom": snapshot["pricing_uom"],
		"rule": snapshot["rule"],
		"params_by_symbol": snapshot["params_by_symbol"],
		"parameter_uoms": snapshot.get("parameter_uoms", {}),
		"tolerance_plus": snapshot["rule"].get("tolerance_plus", 0),
		"tolerance_minus": snapshot["rule"].get("tolerance_minus", 0),
	}


def contract_measure(contract, row):
	"""A mapped source's total is prorated to a partial receipt/invoice quantity."""
	source = contract["source"]
	entered = row.get("custom_chargeable_qty")
	if contract["linked"] and (
		entered in (None, "", 0, 0.0) or float(entered) == float(source.custom_chargeable_qty or 0)
	):
		return float(source.custom_chargeable_qty) * float(row.get("qty")) / float(source.qty)
	return entered


def purchase_order_measure(doc, row, entered):
	"""Scale an unchanged PO total when its ordered quantity changes.

	Use persisted values rather than client snapshots. A newly mapped quotation
	line may still carry its source total, while an edited draft PO carries its
	previous saved total. A different entered value is an explicit override.
	"""
	if doc.doctype != "Purchase Order" or entered in (None, "", 0, 0.0):
		return entered, False
	candidates = []
	if row.get("name") and doc.get("name"):
		candidates.append(("Purchase Order Item", {"name": row.name, "parent": doc.name}))
	if row.get("supplier_quotation_item"):
		candidates.append(("Supplier Quotation Item", {"name": row.supplier_quotation_item, "docstatus": 1}))
	for doctype, filters in candidates:
		source = frappe.db.get_value(
			doctype, filters, ["item_code", "qty", "custom_chargeable_qty"], as_dict=True
		)
		if not source or source.item_code != row.get("item_code"):
			continue
		try:
			old_qty = float(source.qty or 0)
			new_qty = float(row.get("qty") or 0)
			old_measure = float(source.custom_chargeable_qty or 0)
			current_measure = float(entered)
		except (TypeError, ValueError):
			return entered, False
		if not all(math.isfinite(value) and value > 0 for value in (old_qty, new_qty, old_measure, current_measure)):
			return entered, False
		if math.isclose(current_measure, old_measure, rel_tol=1e-9, abs_tol=1e-9) and old_qty != new_qty:
			return old_measure * new_qty / old_qty, True
		# A persisted PO row takes precedence over its upstream quotation.
		return entered, False
	return entered, False
