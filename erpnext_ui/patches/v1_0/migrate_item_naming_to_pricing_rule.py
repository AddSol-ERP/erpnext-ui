"""Preserve deployed naming settings without choosing between ambiguous rules."""

import frappe


def plan_migration(legacy, pricing):
	plan = []
	for naming in legacy:
		if not naming.get("enabled"):
			continue
		candidates = [
			rule for rule in pricing if rule["item_group"] == naming["item_group"] and rule["enabled"]
		]
		if len(candidates) != 1:
			raise ValueError(
				f'Cannot migrate Item naming for "{naming["item_group"]}": '
				"enable exactly one UI Uom Pricing Rule for this group, then retry migration. "
				"The legacy naming record is preserved."
			)
		rule = candidates[0]
		if rule.get("enable_item_code"):
			if rule.get("item_code_pattern") != naming["pattern"]:
				raise ValueError(
					f"Conflicting naming patterns for {naming['item_group']}; review both records."
				)
			continue
		plan.append((rule["name"], naming["pattern"]))
	return plan


def execute():
	# Patches run after DocType sync: new naming columns are available here.
	if not frappe.db.exists("DocType", "UI Item Code Rule"):
		return
	legacy = frappe.get_all("UI Item Code Rule", fields=["item_group", "enabled", "pattern"])
	pricing = frappe.get_all(
		"UI Uom Pricing Rule",
		fields=["name", "item_group", "enabled", "enable_item_code", "item_code_pattern"],
	)
	# Plan every change before writing anything, so a conflict leaves all data intact.
	for name, pattern in plan_migration(legacy, pricing):
		frappe.db.set_value(
			"UI Uom Pricing Rule", name, {"enable_item_code": 1, "item_code_pattern": pattern}
		)
