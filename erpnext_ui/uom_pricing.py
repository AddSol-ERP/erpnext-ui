"""Generic UOM based transaction pricing for the Addsol ERPNext UI shell.

The feature is opt in and configuration driven. A site turns it on through the
`UI Uom Pricing Settings` master switch plus the Buying and Selling sub switches,
and then attaches a pricing rule to an Item Group or overrides it on an Item.

Until the effective state allows it, documents use standard ERPNext quantity and
rate behaviour, so unconfigured sites are never repriced.

This module owns the pure pricing arithmetic shared by the server side metadata
and transaction endpoints: safe formula evaluation, chargeable quantity derived
from a formula or direct entry, and the line amount and standard rate translation.
"""

import math

import frappe

UOM_PRICING_SETTINGS_DOCTYPE = "UI UOM Pricing Settings"


def get_uom_pricing_settings():
	"""Read the site level UOM pricing switches.

	Returns:
		dict: enable_uom_pricing / enable_buying / enable_selling booleans.
	"""
	settings = frappe.get_single(UOM_PRICING_SETTINGS_DOCTYPE)
	return {
		"enable_uom_pricing": bool(getattr(settings, "enable_uom_pricing", None)),
		"enable_buying": bool(getattr(settings, "enable_buying", None)),
		"enable_selling": bool(getattr(settings, "enable_selling", None)),
	}


def is_uom_pricing_enabled(side=None):
	"""Return whether measured quantity pricing is allowed for a side.

	Args:
		side (str): "buying", "selling" or None for the master only check.

	Returns:
		bool: True when the master switch and the relevant side switch are on.
	"""
	settings = get_uom_pricing_settings()
	if not settings["enable_uom_pricing"]:
		return False
	if side == "buying":
		return settings["enable_buying"]
	if side == "selling":
		return settings["enable_selling"]
	return True


def evaluate_formula(expression, params):
	"""Safely evaluate a declared symbol arithmetic pricing formula.

	Only numbers, + - * /, parentheses and identifiers mapped to declared parameter
	symbols are accepted. There is no eval, no functions, no attribute access and no
	imports, so a formula cannot escape its parameter namespace.

	Args:
		expression (str): Formula text over declared parameter symbols.
		params (dict): symbol to numeric value.

	Returns:
		float: The evaluated quantity.

	Raises:
		ValueError: On unsupported syntax, unknown symbols or non finite results.
	"""
	tokens = _tokenize(expression)
	if not tokens:
		raise ValueError("Pricing formula is empty.")
	value, pos = _eval_tokens(tokens, 0, params)
	if pos != len(tokens):
		raise ValueError("Pricing formula has trailing tokens.")
	if not math.isfinite(value):
		raise ValueError("Pricing formula did not produce a finite quantity.")
	return value


def calculate_line_amount(chargeable_qty, rate_per_uom):
	"""Calculate a line amount from the chargeable quantity and rate per UOM.

	The amount is the chargeable quantity multiplied by the rate per pricing UOM.
	ERPNext's ordinary line rate is then derived as amount / document quantity so
	the standard amount, base net, tax and total calculations stay authoritative.
	"""
	return float(chargeable_qty or 0) * float(rate_per_uom or 0)


def standard_line_rate(amount, doc_qty):
	"""Translate a calculated line amount into ERPNext's standard line rate.

	ERPNext expects the standard transaction UOM rate so its own amount, base net,
	tax and total calculations stay authoritative.
	"""
	if not doc_qty:
		return 0.0
	return float(amount) / float(doc_qty)


def get_pricing_line(item_code, rate_per_uom, doc_qty, side=None):
	"""Resolve the effective pricing and compute the line pricing outcome.

	Args:
		item_code (str): Item code to price.
		rate_per_uom (float): Configured rate per pricing UOM.
		doc_qty (float): Document quantity the standard rate is derived from.
		side (str): "buying" or "selling".

	Returns:
		dict: item, rule, chargeable_qty, rate_per_uom, doc_qty, amount, standard_rate.

	Raises:
		ValueError: When no pricing rule is resolved or the quantity is invalid.
	"""
	pricing = get_item_pricing(item_code, side)
	rule = pricing["rule"]
	if not rule:
		raise ValueError("No UOM pricing rule is resolved for this item.")
	qty = calculate_chargeable_quantity(rule, pricing["params_by_symbol"], None)
	amount_info = calculate_pricing_line(qty, float(rate_per_uom or 0), float(doc_qty or 0))
	return {
		"item_code": item_code,
		"item_group": pricing["item_group"],
		"rule": rule,
		"feature_enabled": pricing["feature_enabled"],
		"enabled": pricing["enabled"],
		"pricing_uom": pricing["pricing_uom"],
		"chargeable_qty": qty,
		"rate_per_uom": rate_per_uom,
		"doc_qty": doc_qty,
		"amount": amount_info["amount"],
		"standard_rate": amount_info["standard_rate"],
	}


def calculate_pricing_line(chargeable_qty, rate_per_uom, doc_qty):
	"""Compute the pricing outcome for one transaction line.

	Amount = chargeable quantity * rate per pricing UOM; ERPNext's standard line
	rate is then derived as amount / document quantity so its own amount, base net,
	tax and total calculations stay authoritative.

	Args:
		chargeable_qty (float): accepted chargeable quantity in the pricing UOM.
		rate_per_uom (float): configured rate per pricing UOM.
		doc_qty (float): the document quantity the standard rate is divided by.

	Returns:
		dict: chargeable_qty, rate_per_uom, amount and standard_rate.
	"""
	amount = calculate_line_amount(chargeable_qty, rate_per_uom)
	return {
		"chargeable_qty": chargeable_qty,
		"rate_per_uom": rate_per_uom,
		"amount": amount,
		"standard_rate": standard_line_rate(amount, doc_qty),
	}


def get_pricing_rule(item_group):
	"""Return the enabled UOM pricing rule for an Item Group, if one exists."""
	if not item_group:
		return None
	rules = frappe.get_all(
		"UI Uom Pricing Rule",
		filters={"item_group": item_group, "enabled": 1},
		fields=[
			"name",
			"item_group",
			"pricing_uom",
			"formula_mode",
			"formula_expression",
			"receiving_strategy",
		],
		limit=1,
		ignore_permissions=True,
	)
	if not rules:
		return None
	rule = rules[0]
	params = frappe.get_all(
		"UI Uom Pricing Parameter",
		filters={"parent": rule["name"]},
		fields=["symbol", "label", "data_source", "display_order", "required", "uom"],
		ignore_permissions=True,
	)
	return {
		"name": rule["name"],
		"item_group": rule["item_group"],
		"pricing_uom": rule["pricing_uom"],
		"formula_mode": rule["formula_mode"],
		"formula_expression": rule["formula_expression"],
		"receiving_strategy": rule["receiving_strategy"],
		"params": params,
	}


def get_item_pricing(item_code, side=None):
	"""Resolve the effective UOM pricing state for an Item.

	Args:
		item_code (str): Item code to resolve pricing for.
		side (str): "buying" or "selling"; defaults to the buying side here.

	Returns:
		dict: effective pricing state (rule, pricing uom, formula, strategy, params).
	"""
	item_group = frappe.db.get_value("Item", item_code, "item_group") or ""
	rule = get_pricing_rule(item_group)
	feature_enabled = is_uom_pricing_enabled(side)
	params_by_symbol = {}
	for p in rule.get("params") or [] if rule else []:
		symbol = p.get("symbol")
		if symbol:
			params_by_symbol[symbol] = float(p.get("value") or 0)
	return {
		"item_code": item_code,
		"item_group": item_group,
		"rule": rule,
		"feature_enabled": feature_enabled,
		"enabled": bool(rule) and feature_enabled,
		"pricing_uom": rule["pricing_uom"] if rule else None,
		"formula_mode": rule["formula_mode"] if rule else None,
		"formula_expression": rule["formula_expression"] if rule else None,
		"receiving_strategy": rule["receiving_strategy"] if rule else None,
		"params": rule["params"] if rule else [],
		"params_by_symbol": params_by_symbol,
	}


def calculate_chargeable_quantity(rule, params_by_symbol, direct_entry_value=None):
	"""Calculate the chargeable quantity for a resolved pricing rule.

	Formula mode evaluates the declared symbol arithmetic; direct entry mode uses
	the measured quantity supplied by the caller. The quantity must be positive and
	finite when the rule requires a measured quantity.

	Args:
		rule (dict): resolved pricing rule (formula mode/expression or direct entry).
		params_by_symbol (dict): declared symbol to numeric parameter value.
		direct_entry_value (float): measured quantity for direct entry mode.

	Returns:
		float: chargeable quantity in the pricing UOM.

	Raises:
		ValueError: When no rule is resolved or the quantity is not positive/finite.
	"""
	if not rule:
		raise ValueError("No UOM pricing rule is resolved.")
	if (rule.get("formula_mode") or "") == "Direct Entry":
		qty = float(direct_entry_value or 0)
	else:
		qty = float(evaluate_formula(rule.get("formula_expression") or "", params_by_symbol or {}))
	if not math.isfinite(qty) or qty <= 0:
		raise ValueError("Chargeable quantity must be positive and finite.")
	return qty


def _calculate_pricing_lines(docname, doctype, accepted_measurements=None):
	"""Calculate UOM pricing for the lines of a buying transaction document.

	Args:
		docname (str): Document name to price.
		doctype (str): Document doctype (Purchase Receipt / Purchase Invoice).
		accepted_measurements (dict): item_code to accepted chargeable quantity.

	Returns:
		dict: {"name": docname, "lines": [...]} pricing per line.

	Raises:
		ValueError: When the document cannot be read.
	"""
	doc = frappe.get_doc(doctype, docname)
	lines = []
	for row in doc.get("items") or []:
		item_code = row.item_code or ""
		accepted = None
		if accepted_measurements and item_code in accepted_measurements:
			accepted = float(accepted_measurements[item_code] or 0)
		pricing = None
		if accepted and accepted > 0:
			try:
				pricing = get_pricing_line(item_code, float(row.get("rate") or 0), float(row.get("qty") or 0))
				pricing["chargeable_qty"] = accepted
				pricing["amount"] = calculate_line_amount(accepted, float(pricing["rate_per_uom"] or 0))
				pricing["standard_rate"] = standard_line_rate(pricing["amount"], float(row.get("qty") or 0))
			except ValueError:
				pricing = None
		lines.append(
			{
				"item_code": item_code,
				"accepted_chargeable_qty": accepted,
				"pricing": pricing,
			}
		)
	return {"name": docname, "lines": lines}


def calculate_receipt_pricing(receipt_name, accepted_measurements=None):
	"""Calculate UOM pricing for the lines of a Purchase Receipt.

	Args:
		receipt_name (str): Purchase Receipt to price.
		accepted_measurements (dict): item_code to accepted chargeable quantity.

	Returns:
		dict: {"name": receipt_name, "lines": [...]} pricing per line.
	"""
	return _calculate_pricing_lines(receipt_name, "Purchase Receipt", accepted_measurements)


def calculate_invoice_pricing(invoice_name, receipt_accepted_measurements=None):
	"""Calculate UOM pricing for the lines of a Purchase Invoice.

	Args:
		invoice_name (str): Purchase Invoice to price.
		receipt_accepted_measurements (dict): item_code to accepted chargeable quantity.

	Returns:
		dict: {"name": invoice_name, "lines": [...]} pricing per line.
	"""
	return _calculate_pricing_lines(invoice_name, "Purchase Invoice", receipt_accepted_measurements)


def calculate_purchase_order_pricing(po_name, quotation_accepted_measurements=None):
	"""Calculate UOM pricing for the lines of a Purchase Order.

	Args:
		po_name (str): Purchase Order to price.
		quotation_accepted_measurements (dict): item_code to accepted chargeable quantity.

	Returns:
		dict: {"name": po_name, "lines": [...]} pricing per line.
	"""
	return _calculate_pricing_lines(po_name, "Purchase Order", quotation_accepted_measurements)


def _tokenize(expression):
	tokens = []
	text = str(expression or "").strip()
	i = 0
	while i < len(text):
		ch = text[i]
		if ch.isspace():
			i += 1
			continue
		if ch.isdigit() or ch == ".":
			j = i
			while j < len(text) and (text[j].isdigit() or text[j] == "."):
				j += 1
			tokens.append(("num", float(text[i:j])))
			i = j
			continue
		if ch.isalpha() or ch == "_":
			j = i
			while j < len(text) and (text[j].isalnum() or text[j] == "_"):
				j += 1
			tokens.append(("sym", text[i:j]))
			i = j
			continue
		if ch in "+-*/()":
			tokens.append(("op", ch))
			i += 1
			continue
		raise ValueError("Unsupported character in pricing formula: " + ch)
	return tokens


def _eval_tokens(tokens, pos, params):
	value, pos = _eval_term(tokens, pos, params)
	while pos < len(tokens) and tokens[pos][0] == "op" and tokens[pos][1] in ("+", "-"):
		op = tokens[pos][1]
		rhs, pos = _eval_term(tokens, pos + 1, params)
		value = value + rhs if op == "+" else value - rhs
	return value, pos


def _eval_term(tokens, pos, params):
	value, pos = _eval_factor(tokens, pos, params)
	while pos < len(tokens) and tokens[pos][0] == "op" and tokens[pos][1] in ("*", "/"):
		op = tokens[pos][1]
		rhs, pos = _eval_factor(tokens, pos + 1, params)
		value = value * rhs if op == "*" else value / rhs
	return value, pos


def _eval_factor(tokens, pos, params):
	token = tokens[pos]
	if token[0] == "num":
		return token[1], pos + 1
	if token[0] == "sym":
		name = token[1]
		if name not in params:
			raise ValueError("Unknown pricing formula symbol: " + name)
		value = float(params[name])
		if not math.isfinite(value):
			raise ValueError("Pricing formula symbol is not finite: " + name)
		return value, pos + 1
	if token == ("op", "("):
		value, pos = _eval_tokens(tokens, pos + 1, params)
		if tokens[pos] != ("op", ")"):
			raise ValueError("Pricing formula is missing a closing parenthesis.")
		return value, pos + 1
	raise ValueError("Invalid pricing formula.")
