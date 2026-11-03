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
	try:
		settings = frappe.get_single(UOM_PRICING_SETTINGS_DOCTYPE)
	except (frappe.DoesNotExistError, ImportError):
		# Pricing is opt-in. A site that has not synced this app's DocTypes yet
		# must continue using standard ERPNext behavior instead of failing saves.
		return {
			"enable_uom_pricing": False,
			"enable_buying": False,
			"enable_selling": False,
		}
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
	try:
		value, pos = _eval_tokens(tokens, 0, params)
	except (IndexError, ZeroDivisionError, TypeError, OverflowError) as exc:
		raise ValueError("Invalid pricing formula or parameter values.") from exc
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


def get_pricing_estimate(item_code, doc_qty, side=None):
	"""The Item configuration's baseline, independent of any measured override."""
	pricing = get_item_pricing(item_code, side)
	if not pricing["enabled"]:
		return {"enabled": False}
	if not pricing["pricing_uom"]:
		raise ValueError("The pricing rule needs a pricing UOM.")
	qty = float(doc_qty)
	if not math.isfinite(qty) or qty <= 0:
		raise ValueError("Document quantity must be positive and finite.")
	baseline = None
	if pricing["rule"].get("formula_mode") != "Direct Entry":
		baseline = calculate_chargeable_quantity(pricing["rule"], pricing["params_by_symbol"]) * qty
	return {
		"enabled": True,
		"pricing_uom": pricing["pricing_uom"],
		"calculated_chargeable_qty": baseline,
		"formula_mode": pricing["rule"].get("formula_mode"),
	}


def get_pricing_preview(item_code, rate_per_uom, doc_qty, side=None, chargeable_qty=None):
	"""Incomplete editor rows have no price yet; saved lines remain strict."""
	if doc_qty is None or not str(doc_qty).strip() or float(doc_qty) == 0:
		return {
			"pending": True,
			"reason": "quantity_required",
			"calculated_chargeable_qty": None,
			"chargeable_qty": None,
			"standard_rate": None,
			"amount": None,
		}
	return get_pricing_line(item_code, rate_per_uom, doc_qty, side, direct_entry_value=chargeable_qty)


def get_pricing_line(
	item_code, rate_per_uom, doc_qty, side=None, direct_entry_value=None, chargeable_override=None
):
	"""Resolve the effective pricing and compute the line pricing outcome.

	For formula mode the chargeable quantity is derived from the Item's
	parameters; for direct entry mode `direct_entry_value` is used (the quantity
	the user measured). Direct Entry requires a positive measurement.

	A value the user typed wins in EITHER mode via `chargeable_override`: the
	calculated weight is exactly what can differ from what actually arrived, so a
	formula rule must be overridable too. Both are line TOTALS in the pricing UOM
	and are never multiplied by the document quantity.

	Args:
		item_code (str): Item code to price.
		rate_per_uom (float): Configured rate per pricing UOM.
		doc_qty (float): Document quantity the standard rate is derived from.
		side (str): "buying" or "selling".
		direct_entry_value (float): Measured quantity for direct entry mode.
		chargeable_override (float): User-entered chargeable qty for the line.

	Returns:
		dict: item, rule, chargeable_qty, calculated_chargeable_qty,
		rate_per_uom, doc_qty, amount, standard_rate.

	Raises:
		ValueError: When no pricing rule is resolved or the quantity is invalid.
	"""
	pricing = get_item_pricing(item_code, side)
	rule = pricing["rule"]
	if not rule:
		raise ValueError("No UOM pricing rule is resolved for this item.")
	params = pricing["params_by_symbol"]

	# The rule's own answer, before any human input: the baseline the +/- tolerance
	# is measured against. It is None for a Direct Entry rule, which calculates
	# nothing -- the measurement IS the quantity -- so such a line can never be
	# "out of tolerance" against itself.
	if not pricing["enabled"]:
		raise ValueError("UOM pricing is disabled for this item.")
	if not pricing["pricing_uom"]:
		raise ValueError("The pricing rule needs a pricing UOM.")
	doc_qty = float(doc_qty)
	rate_per_uom = float(rate_per_uom)
	if not math.isfinite(doc_qty) or doc_qty <= 0:
		raise ValueError("Document quantity must be positive and finite.")
	if not math.isfinite(rate_per_uom) or rate_per_uom < 0:
		raise ValueError("Rate per UOM must be non-negative and finite.")
	# Direct entry has no theoretical baseline. Formula errors must surface;
	# a piece count is never a substitute for missing metres, area or weight.
	baseline = None
	if rule.get("formula_mode") != "Direct Entry":
		baseline = calculate_chargeable_quantity(rule, params, None) * doc_qty

	user_value = chargeable_override if chargeable_override is not None else direct_entry_value
	qty = None
	if user_value is not None and str(user_value).strip():
		# A blank measurement is "not entered" -- the same as a None one -- so it
		# must fall through to the calculated baseline / document quantity below
		# rather than reach float(). The strip() guard is load bearing: the RPC
		# estimate path (`calculate_uom_pricing_line`) forwards the caller's
		# Chargeable Qty verbatim, and an unentered value used to pass the
		# `is not None` check as-is, reach `float("")`, and die with a raw
		# `ValueError: could not convert string to float: ''` before the fallback
		# could run -- taking the whole line pricing down with it.
		try:
			qty = float(user_value)
		except (TypeError, ValueError):
			qty = None
		if qty is None or not math.isfinite(qty) or qty <= 0:
			raise ValueError("Chargeable quantity must be positive and finite.")
	if qty is None:
		if baseline is not None and float(baseline) > 0:
			qty = float(baseline)
		else:
			raise ValueError("Enter the measured chargeable quantity in the pricing UOM.")

	amount_info = calculate_pricing_line(qty, float(rate_per_uom or 0), float(doc_qty or 0))
	return {
		"item_code": item_code,
		"item_group": pricing["item_group"],
		"rule": rule,
		"feature_enabled": pricing["feature_enabled"],
		"enabled": pricing["enabled"],
		"pricing_uom": pricing["pricing_uom"],
		"chargeable_qty": qty,
		"calculated_chargeable_qty": baseline,
		"rate_per_uom": rate_per_uom,
		"doc_qty": doc_qty,
		"amount": amount_info["amount"],
		"standard_rate": amount_info["standard_rate"],
		# Flattened from `pricing` (see `get_item_pricing`) so `_apply_uom_pricing`'s
		# submit-time enforcement and the SPA's live preview can read tolerance
		# without reaching into `rule`. This was missing, which is why tolerance
		# was never actually enforced: `overrides.py` read `pricing.get(
		# "tolerance_plus")` off THIS dict, not off `rule`.
		"tolerance_plus": pricing["tolerance_plus"],
		"tolerance_minus": pricing["tolerance_minus"],
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


def validate_single_enabled_rule(item_group, exclude_name=None, lock=False):
	"""Serialize rule activation on the group; also reject legacy ambiguity on reads."""
	if not item_group:
		return
	if lock:
		# Two different UOM rules can be enabled concurrently. Lock their common
		# group row so both cannot pass validation before either transaction commits.
		frappe.db.sql("select name from `tabItem Group` where name=%s for update", (item_group,))
	filters = {"item_group": item_group, "enabled": 1}
	if exclude_name:
		filters["name"] = ["!=", exclude_name]
	if lock:
		# Use a current locking read: a plain SELECT under REPEATABLE READ may
		# still see a snapshot from before a concurrent activation committed.
		query = "select name from `tabUI Uom Pricing Rule` where item_group=%s and enabled=1"
		values = [item_group]
		if exclude_name:
			query += " and name!=%s"
			values.append(exclude_name)
		rules = [row[0] for row in frappe.db.sql(query + " limit 2 for update", tuple(values))]
	else:
		rules = frappe.get_all("UI Uom Pricing Rule", filters=filters, pluck="name", limit_page_length=2)
	if (exclude_name and rules) or len(rules) > 1:
		raise ValueError(
			f'Item Group "{item_group}" already has enabled pricing rule(s): {", ".join(rules)}. '
			"Only one rule may be enabled per Item Group. Disable the other rule(s) first."
		)


def get_pricing_rule(item_group):
	"""Return the enabled UOM pricing rule for an Item Group, if one exists."""
	if not item_group:
		return None
	validate_single_enabled_rule(item_group)
	fields = [
		"name",
		"item_group",
		"pricing_uom",
		"formula_mode",
		"formula_expression",
		"receiving_strategy",
	]
	if frappe.get_meta("UI Uom Pricing Rule").has_field("enable_item_code"):
		fields += ["enable_item_code", "item_code_pattern"]
	# The tolerance columns arrive with `add_chargeable_qty_field`'s sibling
	# doctype sync. Asking a site that has not migrated yet for them would fail
	# the WHOLE query and take pricing down with it, so add them only when the
	# meta says they exist; a missing column then reads as "not configured".
	if frappe.get_meta("UI Uom Pricing Rule").has_field("tolerance_plus"):
		fields += ["tolerance_plus", "tolerance_minus"]
	rules = frappe.get_all(
		"UI Uom Pricing Rule",
		filters={"item_group": item_group, "enabled": 1},
		fields=fields,
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
		"tolerance_plus": rule.get("tolerance_plus") or 0,
		"tolerance_minus": rule.get("tolerance_minus") or 0,
		"enable_item_code": rule.get("enable_item_code") or 0,
		"item_code_pattern": rule.get("item_code_pattern") or "",
		"params": params,
	}


def get_pricing_rule_by_name(rule_name):
	"""Return a pricing rule by its document name, or None."""
	if not rule_name:
		return None
	try:
		rule_doc = frappe.get_doc("UI Uom Pricing Rule", rule_name)
	except Exception:
		return None
	if not getattr(rule_doc, "enabled", 0):
		return None
	validate_single_enabled_rule(rule_doc.item_group)
	params = frappe.get_all(
		"UI Uom Pricing Parameter",
		filters={"parent": rule_name},
		fields=["symbol", "label", "data_source", "display_order", "required", "uom"],
		ignore_permissions=True,
	)
	return {
		"name": rule_doc.name,
		"item_group": getattr(rule_doc, "item_group", None),
		"pricing_uom": getattr(rule_doc, "pricing_uom", None),
		"formula_mode": getattr(rule_doc, "formula_mode", None),
		"formula_expression": getattr(rule_doc, "formula_expression", None),
		"receiving_strategy": getattr(rule_doc, "receiving_strategy", None),
		# `getattr` default covers a site that has not run the doctype sync yet:
		# an absent column reads as "not configured", never as an error.
		"tolerance_plus": getattr(rule_doc, "tolerance_plus", None) or 0,
		"tolerance_minus": getattr(rule_doc, "tolerance_minus", None) or 0,
		"enable_item_code": getattr(rule_doc, "enable_item_code", 0) or 0,
		"item_code_pattern": getattr(rule_doc, "item_code_pattern", "") or "",
		"params": params,
	}


def get_item_pricing(item_code, side=None):
	"""Resolve the effective UOM pricing state for an Item.

	Resolution order for the rule:
	  1. An explicit Item-level override (`custom_uom_pricing_rule`), if set.
	  2. Otherwise the Item Group's enabled rule.

	Parameter values come from the Item's `custom_uom_pricing_parameters` child
	table (keyed by rule + symbol). A parameter whose `data_source` names a
	native Item field takes that field's value instead, so dimensions already
	stored on the Item are not re-entered. Stored values for symbols not present
	in the effective rule are ignored, so a rule change cannot leak stale values.

	Args:
		item_code (str): Item code to resolve pricing for.
		side (str): "buying" or "selling"; defaults to the buying side here.

	Returns:
		dict: effective pricing state (rule, pricing uom, formula, strategy, params).
	"""
	item_group = frappe.db.get_value("Item", item_code, "item_group") or ""
	override_rule_name = None
	try:
		override_rule_name = frappe.db.get_value("Item", item_code, "custom_uom_pricing_rule")
	except Exception:
		override_rule_name = None

	rule = None
	if override_rule_name:
		rule = get_pricing_rule_by_name(override_rule_name)
	if rule is None:
		rule = get_pricing_rule(item_group)

	feature_enabled = is_uom_pricing_enabled(side)

	# Stored parameter values for this Item + effective rule.
	stored = {}
	if rule:
		try:
			rows = frappe.get_all(
				"UI Uom Pricing Item Parameter",
				filters={"parent": item_code, "rule": rule["name"]},
				fields=["symbol", "value"],
				ignore_permissions=True,
			)
			for r in rows or []:
				if r.get("symbol"):
					stored[r["symbol"]] = r.get("value")
		except Exception:
			stored = {}

	# Resolve data_source against native Item fields where declared.
	params_by_symbol = {}
	item_doc = None
	try:
		item_doc = frappe.get_doc("Item", item_code)
	except Exception:
		item_doc = None
	for p in rule.get("params") or [] if rule else []:
		symbol = p.get("symbol")
		if not symbol:
			continue
		data_source = (p.get("data_source") or "").strip()
		value = None
		if data_source and item_doc is not None and hasattr(item_doc, data_source):
			try:
				value = getattr(item_doc, data_source, None)
			except Exception:
				value = None
		if value is None:
			value = stored.get(symbol)
		if value is None:
			continue
		try:
			params_by_symbol[symbol] = float(value)
		except (TypeError, ValueError):
			continue

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
		# Flattened from `rule` so callers (both `_apply_uom_pricing`'s submit-time
		# enforcement and the SPA's live validation) can read tolerance without
		# reaching into the nested `rule` dict -- the same convention already
		# followed for `pricing_uom`/`formula_mode`/etc. above. Omitting this was
		# the bug: both enforcement paths read `pricing.get("tolerance_plus")`,
		# which always came back `None` -> 0, so tolerance was silently never
		# enforced anywhere despite the Rule doctype and the check logic both
		# being correct.
		"tolerance_plus": (rule.get("tolerance_plus") or 0) if rule else 0,
		"tolerance_minus": (rule.get("tolerance_minus") or 0) if rule else 0,
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


def _calculate_pricing_lines(docname, doctype, accepted_measurements=None, side=None):
	"""Calculate UOM pricing for the lines of a transaction document.

	Args:
		docname (str): Document name to price.
		doctype (str): Document doctype.
		accepted_measurements (dict): item_code to accepted chargeable quantity.
		side (str): "buying" or "selling" for feature resolution.

	Returns:
		dict: {"name": docname, "lines": [...]} pricing per line.

	Raises:
		ValueError: When the document cannot be read.
	"""
	doc = frappe.get_doc(doctype, docname)
	doc.check_permission("read")
	side = side or "buying"
	accepted_measurements = (
		frappe.parse_json(accepted_measurements)
		if isinstance(accepted_measurements, str)
		else accepted_measurements
	)
	lines = []
	for row in doc.get("items") or []:
		item_code = row.item_code or ""
		# A row name disambiguates two lots of the same Item. Keep item-code
		# input as a compatibility fallback for existing callers.
		accepted = (accepted_measurements or {}).get(
			row.name, (accepted_measurements or {}).get(item_code, row.get("custom_chargeable_qty"))
		)
		if accepted in (None, "", 0, 0.0):
			accepted = None
		pricing = None
		if get_item_pricing(item_code, side)["enabled"]:
			rate = float(row.get("custom_rate_per_pricing_uom") or 0)
			if not math.isfinite(rate) or rate <= 0:
				raise ValueError("Rate per UOM is required for item " + item_code)
			pricing = get_pricing_line(
				item_code, rate, row.get("qty"), side=side, chargeable_override=accepted
			)
		lines.append(
			{
				"row_name": row.name,
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


def calculate_selling_pricing(document_name, doctype, accepted_measurements=None):
	"""Calculate UOM pricing for the lines of a selling transaction document.

	Args:
		document_name (str): Document name to price.
		doctype (str): Selling doctype (Quotation / Sales Order / Delivery Note / Sales Invoice).
		accepted_measurements (dict): item_code to accepted chargeable quantity.

	Returns:
		dict: {"name": document_name, "lines": [...]} pricing per line.
	"""
	return _calculate_pricing_lines(document_name, doctype, accepted_measurements, side="selling")


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
