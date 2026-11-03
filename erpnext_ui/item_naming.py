"""Opt-in Item codes combining scalar Item fields and declared UOM parameters."""

import re
from decimal import Decimal, InvalidOperation
from string import Formatter

import frappe

RULE_DOCTYPE = "UI Item Code Rule"
FIELD_TYPES = {"Data", "Link", "Select", "Int", "Float", "Currency", "Percent", "Check", "Date", "Datetime"}
EXCLUDED_FIELDS = {"item_code", "name", "naming_series", "amended_from"}
TOKEN = re.compile(r"^(?:param\.)?[A-Za-z_][A-Za-z0-9_]*$")
CODE_FLAG = "ui_generated_item_code"


def pattern_parts(pattern):
	if not pattern or not pattern.strip():
		raise ValueError("Enter an Item code pattern.")
	try:
		parts = list(Formatter().parse(pattern))
	except ValueError as exc:
		raise ValueError("Invalid Item code pattern braces.") from exc
	for _, token, spec, conversion in parts:
		if token is not None and (not TOKEN.fullmatch(token) or spec or conversion):
			raise ValueError(
				"Use {fieldname} or {param.SYMBOL}; expressions and formatting are not supported."
			)
	return parts


def render_code(pattern, fields, params, allowed_fields, max_length=140):
	pieces = []
	for literal, token, _, _ in pattern_parts(pattern):
		pieces.append(literal)
		if token is None:
			continue
		if token.startswith("param."):
			symbol = token[6:]
			value = params.get(symbol)
		else:
			if token not in allowed_fields or token in EXCLUDED_FIELDS:
				raise ValueError(f"Item field {token} is unavailable for naming.")
			value = fields.get(token)
		if value is None or str(value).strip() == "":
			raise ValueError(f"Enter a value for {token} before generating the Item code.")
		if isinstance(value, (float, int, Decimal)):
			try:
				number = Decimal(str(value))
				if not number.is_finite():
					raise ValueError(f"Invalid numeric value for {token}.")
				value = format(number, "f")
				if "." in value:
					value = value.rstrip("0").rstrip(".")
			except InvalidOperation as exc:
				raise ValueError(f"Invalid numeric value for {token}.") from exc
		pieces.append(str(value).strip())
	code = "".join(pieces).strip()
	if not code or len(code) > max_length:
		raise ValueError(f"Item code must contain 1 to {max_length} characters.")
	if any(ch in code for ch in '<>"{}%?\\/') or any(ord(ch) < 32 or ord(ch) == 127 for ch in code):
		raise ValueError("Item code contains unsupported characters. Adjust the pattern or source values.")
	return code


def available_item_fields():
	return [
		field
		for field in frappe.get_meta("Item").fields
		if field.fieldtype in FIELD_TYPES and field.fieldname not in EXCLUDED_FIELDS
	]


def get_item_code_rule(item_group):
	if not item_group or not frappe.db.exists("DocType", RULE_DOCTYPE):
		return None
	return frappe.db.get_value(
		RULE_DOCTYPE, {"item_group": item_group, "enabled": 1}, ["name", "pattern"], as_dict=True
	)


def uses_configured_item_code(doc):
	# Cutting-generated inventory and imports already own stable external codes.
	if frappe.flags.in_import or doc.get("custom_is_offcut") or doc.get("custom_is_remainder"):
		return False
	return bool(get_item_code_rule(doc.get("item_group")))


def numeric_token(value, token):
	try:
		return Decimal(str(value))
	except InvalidOperation as exc:
		raise ValueError(f"Invalid numeric value for {token}.") from exc


def resolve_parameters(doc, rule):
	"""Use unsaved Item values, with the same effective-rule precedence as pricing."""
	if not rule:
		return {}
	stored = {}
	for row in doc.get("custom_uom_pricing_parameters") or []:
		if row.get("rule") == rule["name"] and row.get("symbol"):
			symbol = row.get("symbol")
			if symbol in stored:
				raise ValueError(f"Duplicate UOM parameter: {symbol}")
			stored[symbol] = row.get("value")
	result = {}
	for param in rule.get("params") or []:
		symbol = param.get("symbol")
		source = (param.get("data_source") or "").strip()
		value = doc.get(source) if source else None
		if value is None:
			value = stored.get(symbol)
		if value is not None:
			result[symbol] = numeric_token(value, "param." + symbol)
	return result


def effective_pricing_rule(doc):
	from erpnext_ui.uom_pricing import get_pricing_rule, get_pricing_rule_by_name

	return get_pricing_rule_by_name(doc.get("custom_uom_pricing_rule")) or get_pricing_rule(
		doc.get("item_group")
	)


def generate_item_code(doc):
	rule = get_item_code_rule(doc.get("item_group"))
	if not rule:
		return None
	# A field-only pattern must work without any UOM pricing configuration.
	needs_params = any(token and token.startswith("param.") for _, token, _, _ in pattern_parts(rule.pattern))
	params = resolve_parameters(doc, effective_pricing_rule(doc)) if needs_params else {}
	meta = frappe.get_meta("Item")
	length = meta.get_field("item_code").length or 140
	fields = available_item_fields()
	values = doc.as_dict()
	referenced = {token for _, token, _, _ in pattern_parts(rule.pattern) if token}
	for field in fields:
		value = values.get(field.fieldname)
		if field.fieldname in referenced and field.fieldtype in {
			"Int",
			"Float",
			"Currency",
			"Percent",
			"Check",
		}:
			if value is not None and str(value).strip() != "":
				values[field.fieldname] = numeric_token(value, field.fieldname)
	return render_code(rule.pattern, values, params, {field.fieldname for field in fields}, length)


def apply_item_code(doc, method=None):
	if not doc.is_new() or not uses_configured_item_code(doc):
		return
	try:
		code = doc.flags.get(CODE_FLAG) or generate_item_code(doc)
	except ValueError as exc:
		frappe.throw(str(exc))
	# Keep the first result stable through ERPNext's own naming/default stages.
	doc.flags[CODE_FLAG] = code
	doc.name = doc.item_code = code
	# Document Naming Rules can bypass autoname. Validation may reassert the
	# configured code after Frappe has already linked child rows to another name.
	if callable(getattr(doc, "set_parent_in_children", None)):
		doc.set_parent_in_children()
	if not doc.get("item_name"):
		doc.item_name = code


@frappe.whitelist(allow_guest=False)
def preview_item_code(doc):
	frappe.has_permission("Item", "create", throw=True)
	data = frappe.parse_json(doc) if isinstance(doc, str) else doc
	if data.get("doctype") != "Item":
		frappe.throw("An Item is required.")
	item = frappe.get_doc(data)
	try:
		return {"item_code": generate_item_code(item)}
	except ValueError as exc:
		frappe.throw(str(exc))


@frappe.whitelist(allow_guest=False)
def get_item_code_tokens(item_group=None):
	frappe.has_permission(RULE_DOCTYPE, "write", throw=True)
	fields = [{"token": field.fieldname, "label": field.label} for field in available_item_fields()]
	from erpnext_ui.uom_pricing import get_pricing_rule

	rule = get_pricing_rule(item_group) if item_group else None
	params = [
		{"token": "param." + row["symbol"], "label": row.get("label") or row["symbol"]}
		for row in (rule or {}).get("params", [])
	]
	return fields + params
