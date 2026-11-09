"""Resolve preserved document pricing from persisted rows, never client snapshots."""

import json

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
