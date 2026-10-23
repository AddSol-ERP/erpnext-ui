"""Supplier quotation response flow.

A supplier receives a tokenised link, verifies an OTP sent to the invited email,
and fills a metadata-driven form. The response is written only to that
supplier's own draft Supplier Quotation.

Security model (see MEMORY.md §3.12):
- the browser never supplies a doctype, supplier, quotation or field list that
  is trusted as authority;
- the invitation is the only bridge between the token/session and the SQ;
- raw tokens, OTPs and response sessions are never stored or logged.
"""

import hashlib
from html import escape
import hmac
import math
import re
import secrets
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import (
	add_to_date,
	cint,
	escape_html,
	flt,
	get_datetime,
	get_url,
	getdate,
	now_datetime,
	nowdate,
	strip_html,
	validate_email_address,
)

SETTINGS_DOCTYPE = "UI Supplier Quotation Settings"
FIELD_DOCTYPE = "UI Supplier Quotation Field"
INVITATION_DOCTYPE = "UI Supplier Quotation Invitation"
INVITATION_ITEM_DOCTYPE = "UI Supplier Quotation Invitation Item"
INVITATION_EVENT_DOCTYPE = "UI Supplier Quotation Invitation Event"

INTERNAL_ROLES = {
	"Purchase User",
	"Purchase Manager",
	"Store Manager",
	"Stock User",
	"Stock Manager",
	"System Manager",
	"Administrator",
}

RATE_LIMIT_ERROR = getattr(frappe, "RateLimitExceededError", frappe.ValidationError)

SYSTEM_FIELDS = {
	"name",
	"owner",
	"creation",
	"modified",
	"modified_by",
	"docstatus",
	"idx",
	"parent",
	"parentfield",
	"parenttype",
	"amended_from",
	"naming_series",
	"doctype",
	"__islocal",
	"__unsaved",
	"_user_tags",
	"_comments",
	"_assign",
	"_liked_by",
}

# These are context, never an input. `item_code`, `uom` and `qty` are also
# guarded by ERPNext's validate_with_previous_doc, so offering them as inputs
# can only produce a save failure.
PROTECTED_FIELDS = {
	"item_code",
	"item_name",
	"description",
	"qty",
	"uom",
	"stock_uom",
	"stock_qty",
	"conversion_factor",
	"material_request",
	"material_request_item",
	"request_for_quotation",
	"request_for_quotation_item",
	"prevdoc_docname",
	"prevdoc_detail_docname",
	"sales_order",
	"sales_order_item",
	"purchase_order",
	"purchase_order_item",
	"parent",
	"idx",
}

# Values ERPNext calculates. Letting a supplier write these would bypass the
# buying controller.
SERVER_DERIVED_FIELDS = {
	"amount",
	"net_rate",
	"net_amount",
	"base_rate",
	"base_amount",
	"base_net_rate",
	"base_net_amount",
	"base_price_list_rate",
	"price_list_rate",
	"pricing_rules",
	"weight_per_unit",
	"total_weight",
	"weight_uom",
	"total",
	"net_total",
	"base_total",
	"base_net_total",
	"total_qty",
	"total_net_weight",
	"grand_total",
	"base_grand_total",
	"rounded_total",
	"base_rounded_total",
	"in_words",
	"base_in_words",
	"total_taxes_and_charges",
	"base_total_taxes_and_charges",
	"taxes_and_charges_added",
	"taxes_and_charges_deducted",
	"base_taxes_and_charges_added",
	"base_taxes_and_charges_deducted",
	"discount_amount",
	"base_discount_amount",
	"additional_discount_percentage",
	"other_charges_calculation",
	"base_rounding_adjustment",
	"rounding_adjustment",
}

SAFE_FIELD_TYPES = {
	"Data",
	"Int",
	"Float",
	"Currency",
	"Percent",
	"Date",
	"Datetime",
	"Select",
	"Check",
	"Small Text",
	"Text",
	"Long Text",
	"Link",
	"Email",
	"Phone",
}

# Layout, child-table, file and computed widgets never belong on a supplier
# form. Text Editor is allowed as read-only context (description) only.
UNSUPPORTED_FIELD_TYPES = {
	"Section Break",
	"Column Break",
	"Tab Break",
	"Fold",
	"Heading",
	"Button",
	"HTML",
	"Table",
	"Table MultiSelect",
	"Image",
	"Attach",
	"Attach Image",
	"Geolocation",
	"Signature",
	"Password",
	"Dynamic Link",
	"Read Only",
	"Barcode",
	"Code",
	"JSON",
	"Color",
	"Icon",
	"Rating",
}

ALLOWED_TEMPLATE_KEYS = {
	"material_request",
	"supplier",
	"supplier_name",
	"supplier_quotation",
	"company",
	"contact",
	"brand",
	"link",
	"material_request_link",
	"supplier_quotation_link",
}

DEFAULT_ITEM_FIELDS = {
	"item_code": {"enabled": 1, "editable": 0, "mandatory": 0, "order": 10},
	"item_name": {"enabled": 1, "editable": 0, "mandatory": 0, "order": 20},
	"description": {"enabled": 1, "editable": 0, "mandatory": 0, "order": 30},
	"qty": {"enabled": 1, "editable": 0, "mandatory": 0, "order": 40},
	"uom": {"enabled": 1, "editable": 0, "mandatory": 0, "order": 50},
	"rate": {"enabled": 1, "editable": 1, "mandatory": 1, "order": 60},
	"delivery_date": {"enabled": 1, "editable": 1, "mandatory": 0, "order": 70},
	"lead_time_days": {"enabled": 1, "editable": 1, "mandatory": 0, "order": 75},
	"supplier_part_no": {"enabled": 0, "editable": 1, "mandatory": 0, "order": 80},
}

DEFAULT_DOCUMENT_FIELDS = {
	"valid_till": {"enabled": 1, "editable": 1, "mandatory": 0, "order": 10},
	"remarks": {"enabled": 1, "editable": 1, "mandatory": 0, "order": 20},
}


# ---------------------------------------------------------------------------
# Settings and metadata
# ---------------------------------------------------------------------------


def get_settings(require_enabled=True):
	# Deliberately not get_cached_doc: settings are read a handful of times per
	# request, and a stale cached Single would keep serving an old allowlist
	# after an administrator edited it.
	settings = frappe.get_single(SETTINGS_DOCTYPE)
	if require_enabled and not settings.enabled:
		frappe.throw(_("Supplier quotation responses are not enabled."))
	return settings


def _scope_doctype(scope):
	if scope == "Item":
		return "Supplier Quotation Item"
	if scope == "Document":
		return "Supplier Quotation"
	frappe.throw(_("Unknown field scope: {0}").format(scope))


def _scope_meta(scope):
	return frappe.get_meta(_scope_doctype(scope))


def _field_meta(row):
	return _scope_meta(row.scope).get_field(row.fieldname)


def _defaults_for(scope, fieldname):
	source = DEFAULT_ITEM_FIELDS if scope == "Item" else DEFAULT_DOCUMENT_FIELDS
	return source.get(fieldname) or {}


def _is_excluded_fieldname(fieldname):
	return fieldname in SYSTEM_FIELDS


def _catalog_entry(scope, df):
	defaults = _defaults_for(scope, df.fieldname)
	base_ineligible = (
		_is_excluded_fieldname(df.fieldname)
		or cint(df.permlevel) > 0
		or bool(df.hidden)
		or df.fieldtype in UNSUPPORTED_FIELD_TYPES
	)
	context_eligible = not base_ineligible
	editable_eligible = (
		not base_ineligible
		and not cint(df.read_only)
		and df.fieldtype in SAFE_FIELD_TYPES
		and df.fieldname not in PROTECTED_FIELDS
		and df.fieldname not in SERVER_DERIVED_FIELDS
	)
	return {
		"scope": scope,
		"fieldname": df.fieldname,
		"label": df.label or df.fieldname,
		"fieldtype": df.fieldtype,
		"options": df.options or "",
		"length": cint(df.length),
		"precision": cint(df.precision),
		"reqd": cint(df.reqd),
		"read_only": cint(df.read_only),
		"custom": cint(getattr(df, "is_custom_field", 0)),
		"context_eligible": context_eligible,
		"editable_eligible": editable_eligible,
		"default_enabled": cint(defaults.get("enabled")),
		"default_editable": cint(defaults.get("editable")),
		"default_mandatory": cint(defaults.get("mandatory")),
		"default_order": cint(defaults.get("order")),
	}


def get_field_catalog():
	def entries(scope):
		result = []
		for df in _scope_meta(scope).fields:
			entry = _catalog_entry(scope, df)
			# A field that is neither safe context nor a safe input has no
			# business appearing in the settings screen at all.
			if entry["context_eligible"] or entry["editable_eligible"]:
				result.append(entry)
		return result

	return {"item": entries("Item"), "document": entries("Document")}


def normalise_field_row(row, throw=False):
	"""Refresh metadata-derived values and reject unsafe configurations.

	Returns False for a row whose field no longer exists while the row is
	disabled, so removing a customer app's custom field does not break migrate.
	"""
	scope = row.scope or "Item"
	fieldname = (row.fieldname or "").strip()
	if not fieldname:
		if throw:
			frappe.throw(_("Field configuration rows must name a field."))
		return False

	df = _scope_meta(scope).get_field(fieldname)
	if not df:
		if throw and (row.enabled or row.supplier_editable):
			frappe.throw(_("{0} does not exist on {1}.").format(fieldname, _scope_doctype(scope)))
		return False

	if _is_excluded_fieldname(fieldname) or cint(df.permlevel) > 0 or df.hidden:
		if throw:
			frappe.throw(_("{0} cannot be exposed to suppliers.").format(df.label or fieldname))
		return False

	if df.fieldtype in UNSUPPORTED_FIELD_TYPES:
		if throw:
			frappe.throw(_("{0} is not a supported supplier field type.").format(df.label or fieldname))
		return False

	row.scope = scope
	row.fieldname = fieldname
	row.label = df.label or fieldname
	row.fieldtype = df.fieldtype
	row.options = df.options or ""
	row.length = cint(df.length)
	row.precision = cint(df.precision)

	if row.supplier_editable:
		if cint(df.read_only):
			if throw:
				frappe.throw(
					_("{0} is read-only in ERPNext and cannot be supplier-editable.").format(row.label)
				)
			return False
		if fieldname in PROTECTED_FIELDS:
			if throw:
				frappe.throw(_("{0} is read-only context and cannot be supplier-editable.").format(row.label))
			return False
		if fieldname in SERVER_DERIVED_FIELDS:
			if throw:
				frappe.throw(
					_("{0} is calculated by ERPNext and cannot be supplier-editable.").format(row.label)
				)
			return False
		if df.fieldtype not in SAFE_FIELD_TYPES:
			if throw:
				frappe.throw(_("{0} is not a supported supplier input type.").format(row.label))
			return False

	if row.mandatory and not row.supplier_editable:
		if throw:
			frappe.throw(_("{0} cannot be mandatory unless it is supplier-editable.").format(row.label))
		return False

	return True


def validate_field_config_rows(rows):
	"""Settings-level validation. The server re-reads this list on every write."""
	seen = set()
	has_editable = False
	for row in rows:
		if not normalise_field_row(row, throw=False):
			if row.enabled or row.supplier_editable:
				frappe.throw(
					_("{0} / {1} is no longer a valid supplier field.").format(row.scope, row.fieldname)
				)
			continue
		key = (row.scope, row.fieldname)
		if key in seen:
			frappe.throw(_("Duplicate supplier field: {0} / {1}").format(row.scope, row.fieldname))
		seen.add(key)
		if row.enabled and row.supplier_editable:
			has_editable = True
	if not has_editable:
		frappe.throw(_("Enable at least one supplier-editable field."))


def get_configured_fields(settings, scope=None, editable_only=False):
	rows = []
	for row in settings.field_config:
		if not row.enabled:
			continue
		if scope and row.scope != scope:
			continue
		if editable_only and not row.supplier_editable:
			continue
		if normalise_field_row(row, throw=False):
			rows.append(row)
	return sorted(rows, key=lambda row: (cint(row.display_order), cint(row.idx)))


def sync_supplier_quotation_field_config(settings=None):
	"""Add newly discovered metadata fields and refresh their snapshots.

	Existing enable/editable/mandatory choices are deliberately preserved.
	"""
	settings = settings or frappe.get_single(SETTINGS_DOCTYPE)
	catalog = get_field_catalog()
	existing = {(row.scope, row.fieldname): row for row in settings.field_config}
	changed = False
	added = 0
	updated = 0

	for scope in ("Item", "Document"):
		for entry in catalog["item" if scope == "Item" else "document"]:
			if not entry["context_eligible"] and not entry["editable_eligible"]:
				continue
			key = (scope, entry["fieldname"])
			row = existing.get(key)
			if row:
				before = (row.label, row.fieldtype, row.options, row.length, row.precision)
				normalise_field_row(row, throw=False)
				after = (row.label, row.fieldtype, row.options, row.length, row.precision)
				if before != after:
					changed = True
					updated += 1
				continue

			defaults = _defaults_for(scope, entry["fieldname"])
			row = settings.append(
				"field_config",
				{
					"scope": scope,
					"fieldname": entry["fieldname"],
					"label": entry["label"],
					"fieldtype": entry["fieldtype"],
					"options": entry["options"],
					"length": entry["length"],
					"precision": entry["precision"],
					"enabled": cint(defaults.get("enabled")),
					"supplier_editable": cint(defaults.get("editable")),
					"mandatory": cint(defaults.get("mandatory")),
					"display_order": cint(defaults.get("order")),
				},
			)
			normalise_field_row(row, throw=False)
			changed = True
			added += 1

	if changed:
		settings.save(ignore_permissions=True)
	return {"added": added, "updated": updated}


def validate_template_text(value, label):
	for key in re.findall(r"\{([a-zA-Z0-9_]+)\}", value or ""):
		if key not in ALLOWED_TEMPLATE_KEYS:
			frappe.throw(_("Unknown placeholder {0} in {1}.").format("{" + key + "}", label))


# ---------------------------------------------------------------------------
# Token / OTP helpers
# ---------------------------------------------------------------------------


def _now():
	return now_datetime()


def _as_iso(value):
	if value is None:
		return None
	if hasattr(value, "isoformat"):
		return value.isoformat()
	return str(value)


def _hash_token(token):
	return hashlib.sha256((token or "").encode()).hexdigest()


def _hash_otp(token_hash, otp):
	# A 6-digit code is low entropy. Keying the digest with the (high-entropy)
	# token hash means a stolen database cannot offline-brute-force it.
	return hmac.new((token_hash or "").encode(), (otp or "").encode(), hashlib.sha256).hexdigest()


def _new_token():
	return secrets.token_urlsafe(32)


def _new_otp():
	return f"{secrets.randbelow(1_000_000):06d}"


def _constant_time_equal(left, right):
	return hmac.compare_digest((left or "").encode(), (right or "").encode())


def _mask_email(email):
	email = (email or "").strip()
	if "@" not in email:
		return "***"
	local, domain = email.rsplit("@", 1)
	if len(local) <= 2:
		return f"***@{domain}"
	return f"{local[0]}***@{domain}"


def _public_ip():
	return getattr(frappe.local, "request_ip", None) or frappe.get_request_header("X-Forwarded-For") or ""


def _rate_limit(key, limit, seconds):
	cache = frappe.cache()
	cache_key = f"erpnext_ui:supplier_quotation:{key}"
	count = cint(cache.get_value(cache_key) or 0)
	if count >= limit:
		frappe.throw(_("Too many attempts. Please try again later."), RATE_LIMIT_ERROR)
	cache.set_value(cache_key, count + 1, expires_in_sec=seconds)


def _get_invitation_by_token(token):
	token = (token or "").strip() if isinstance(token, str) else ""
	if not token or len(token) > 256:
		frappe.throw(_("This link is invalid or has expired."), frappe.PermissionError)
	name = frappe.db.get_value(INVITATION_DOCTYPE, {"token_hash": _hash_token(token)}, "name")
	if not name:
		frappe.throw(_("This link is invalid or has expired."), frappe.PermissionError)
	return frappe.get_doc(INVITATION_DOCTYPE, name)


def _get_invitation_by_session(session):
	session = (session or "").strip() if isinstance(session, str) else ""
	if not session or len(session) > 256:
		frappe.throw(
			_("Your response session is invalid. Please verify your email again."), frappe.PermissionError
		)
	name = frappe.db.get_value(INVITATION_DOCTYPE, {"response_session_hash": _hash_token(session)}, "name")
	if not name:
		frappe.throw(
			_("Your response session is invalid. Please verify your email again."), frappe.PermissionError
		)
	return frappe.get_doc(INVITATION_DOCTYPE, name)


def _append_event(inv, event, actor=None, detail=None, ip=None):
	inv.append(
		"events",
		{
			"event_on": _now(),
			"event": event,
			"actor": actor or frappe.session.user,
			"detail": (detail or "")[:500] or None,
			"ip": ip,
		},
	)


def _save_public_doc(doc):
	"""Save a document on behalf of an anonymous supplier.

	The invitation binding and field allowlist are the authority; this helper
	only supplies the ERPNext permission context and keeps `modified_by` from
	being recorded as Guest.
	"""
	original_user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		doc.save(ignore_permissions=True)
	finally:
		frappe.set_user(original_user)


def _rotate_token(inv, settings):
	token = _new_token()
	inv.token_hash = _hash_token(token)
	inv.token_created_on = _now()
	inv.invitation_expires_on = add_to_date(_now(), days=cint(settings.invitation_expiry_days) or 14)
	inv.otp_hash = None
	inv.otp_expires_on = None
	inv.otp_attempts = 0
	inv.response_session_hash = None
	inv.response_session_expires_on = None
	return token


def _invitation_link(token):
	# The token rides in the fragment, not the query string: browsers never send
	# it to the server with the page request, so it cannot appear in access logs.
	return get_url(f"/supplier-quotation#token={token}")


# ---------------------------------------------------------------------------
# Template rendering
# ---------------------------------------------------------------------------


def _plain_context(inv, settings):
	return {
		"material_request": inv.material_request,
		"supplier": inv.supplier,
		"supplier_name": inv.supplier_name or inv.supplier,
		"supplier_quotation": inv.supplier_quotation,
		"company": inv.company or "",
		"contact": inv.recipient_email,
		"brand": settings.brand_name or "Supplier Quotation",
	}


def _html_context(inv, settings, link=None):
	context = _plain_context(inv, settings)
	if link:
		safe_link = escape_html(link)
		anchor = f'<a href="{safe_link}">{safe_link}</a>'
		context["link"] = anchor
		context["link_html"] = anchor
	context["material_request_link"] = (
		f'<a href="{escape_html(get_url_to_form("Material Request", inv.material_request))}">{escape_html(inv.material_request)}</a>'
	)
	context["supplier_quotation_link"] = (
		f'<a href="{escape_html(get_url_to_form("Supplier Quotation", inv.supplier_quotation))}">{escape_html(inv.supplier_quotation)}</a>'
	)
	return context


def _render_plain(template, context):
	def replace(match):
		return str(context.get(match.group(1), match.group(0)))

	return re.sub(r"\{([a-zA-Z0-9_]+)\}", replace, template or "")


def _render_html(template, context):
	rendered = escape_html(template or "").replace("\n", "<br>")
	html_keys = {"link", "link_html", "material_request_link", "supplier_quotation_link"}
	for key, value in context.items():
		placeholder = "{" + key + "}"
		if placeholder not in rendered:
			continue
		replacement = str(value) if key in html_keys else escape_html(str(value))
		rendered = rendered.replace(placeholder, replacement)
	# Only fall back to appending the link when the message had no link
	# placeholder at all. Checking both spellings matters: an admin who writes
	# {link_html} would otherwise get the anchor twice.
	has_link_placeholder = "{link}" in (template or "") or "{link_html}" in (template or "")
	if context.get("link_html") and not has_link_placeholder:
		rendered += "<br><br>" + context["link_html"]
	return rendered


def get_url_to_form(doctype, name):
	from frappe.utils import get_url_to_form as _get_url_to_form

	return _get_url_to_form(doctype, name)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _has_value(value):
	return value is not None and str(value).strip() not in ("", "0", "False", "false")


def _validate_value(df, value):
	if value is None:
		return None
	if isinstance(value, str):
		value = value.strip()
	if value is None or value == "":
		return None

	fieldtype = df.fieldtype
	if fieldtype == "Data":
		if df.options == "Email":
			validate_email_address(value, throw=True)
		max_length = cint(df.length) or 1000
		if len(value) > max_length:
			frappe.throw(_("{0} cannot exceed {1} characters.").format(df.label or df.fieldname, max_length))
		return value

	if fieldtype in ("Small Text", "Text", "Long Text"):
		text = strip_html(value).strip()
		max_length = cint(df.length) or (5000 if fieldtype == "Small Text" else 20000)
		if len(text) > max_length:
			frappe.throw(_("{0} is too long.").format(df.label or df.fieldname))
		return text

	if fieldtype == "Int":
		try:
			return int(str(value))
		except (TypeError, ValueError):
			frappe.throw(_("{0} must be a whole number.").format(df.label or df.fieldname))

	if fieldtype in ("Float", "Currency", "Percent"):
		try:
			number = float(str(value))
		except (TypeError, ValueError):
			frappe.throw(_("{0} must be a number.").format(df.label or df.fieldname))
		if not math.isfinite(number):
			frappe.throw(_("{0} must be a finite number.").format(df.label or df.fieldname))
		return number

	if fieldtype in ("Date", "Datetime"):
		try:
			parsed = getdate(value) if fieldtype == "Date" else get_datetime(value)
		except Exception:
			frappe.throw(_("{0} must be a valid date.").format(df.label or df.fieldname))
		return str(parsed)

	if fieldtype == "Select":
		options = [option.strip() for option in (df.options or "").split("\n") if option.strip()]
		if value not in options:
			frappe.throw(_("{0} has an invalid selection.").format(df.label or df.fieldname))
		return value

	if fieldtype == "Check":
		return 1 if str(value).lower() in ("1", "true", "yes", "on") else 0

	if fieldtype == "Link":
		doctype = (df.options or "").strip()
		if not doctype:
			frappe.throw(_("{0} has no link target configured.").format(df.label or df.fieldname))
		if not frappe.db.exists(doctype, value):
			frappe.throw(_("{0} does not exist.").format(value))
		return value

	if fieldtype == "Email":
		validate_email_address(value, throw=True)
		return value

	if fieldtype == "Phone":
		max_length = cint(df.length) or 40
		if len(value) > max_length:
			frappe.throw(_("{0} is too long.").format(df.label or df.fieldname))
		return value

	frappe.throw(_("{0} cannot be supplied through this form.").format(df.label or df.fieldname))


def _field_payload(row, value, editable):
	df = _field_meta(row)
	return {
		"fieldname": row.fieldname,
		"label": row.label or df.label or row.fieldname,
		"fieldtype": df.fieldtype,
		"options": df.options or "",
		"mandatory": cint(row.mandatory),
		"help_text": row.help_text or "",
		"editable": 1 if editable else 0,
		"value": _serialise_value(df, value),
	}


def _serialise_value(df, value):
	if value is None:
		return None
	if df.fieldtype == "Check":
		return 1 if value else 0
	if df.fieldtype == "Int":
		return cint(value)
	if df.fieldtype in ("Float", "Currency", "Percent"):
		return flt(value)
	if df.fieldtype in ("Date", "Datetime"):
		return _as_iso(value)
	if df.fieldtype == "Text Editor":
		return strip_html(str(value))
	return value


def _editable_field_map(settings, scope):
	return {row.fieldname: row for row in get_configured_fields(settings, scope, editable_only=True)}


def _split_context_and_inputs(settings, scope):
	rows = get_configured_fields(settings, scope)
	return (
		[row for row in rows if not row.supplier_editable],
		[row for row in rows if row.supplier_editable],
	)


def _parse_json(value, expected, label):
	if value is None:
		return {} if expected is dict else []
	if isinstance(value, str):
		try:
			value = frappe.parse_json(value)
		except Exception:
			frappe.throw(_("{0} is not valid JSON.").format(label))
	if not isinstance(value, expected):
		frappe.throw(_("{0} has an invalid shape.").format(label))
	return value


def _parse_supplier_names(suppliers):
	if suppliers is None:
		return []
	if isinstance(suppliers, str):
		try:
			suppliers = frappe.parse_json(suppliers)
		except Exception:
			frappe.throw(_("Suppliers must be a list."))
	if not isinstance(suppliers, (list, tuple)):
		frappe.throw(_("Suppliers must be a list."))
	return list(dict.fromkeys(str(name).strip() for name in suppliers if str(name).strip()))


# ---------------------------------------------------------------------------
# Internal access / contacts / print
# ---------------------------------------------------------------------------


def _require_internal_role():
	if not INTERNAL_ROLES.intersection(frappe.get_roles()):
		frappe.throw(_("You are not allowed to manage supplier quotation requests."), frappe.PermissionError)


def _require_settings_access():
	if not {"System Manager", "Administrator"}.intersection(frappe.get_roles()):
		frappe.throw(
			_("Only System Managers can change supplier quotation settings."), frappe.PermissionError
		)


def _require_material_request(material_request_name):
	mr = frappe.get_doc("Material Request", material_request_name)
	mr.check_permission("read")
	if mr.docstatus != 1 or mr.material_request_type != "Purchase":
		frappe.throw(_("Supplier quotation requests require a submitted Purchase Material Request."))
	return mr


def _contact_email(contact):
	if not contact:
		return None
	email = frappe.db.get_value("Contact", contact, "email_id")
	if email:
		return email
	rows = frappe.get_all(
		"Contact Email",
		filters={"parent": contact, "is_primary": 1},
		pluck="email_id",
		limit=1,
	)
	return rows[0] if rows else None


def _resolve_supplier_contact(supplier):
	if not frappe.db.exists("Supplier", supplier):
		return {"supplier": supplier, "error": _("Supplier does not exist.")}
	supplier_doc = frappe.get_doc("Supplier", supplier)
	if supplier_doc.disabled:
		return {"supplier": supplier, "error": _("Supplier is disabled.")}

	from frappe.contacts.doctype.contact.contact import get_default_contact

	contacts = []
	default_contact = get_default_contact("Supplier", supplier)
	if default_contact:
		contacts.append(default_contact)
	linked = frappe.get_all(
		"Dynamic Link",
		filters={"link_doctype": "Supplier", "link_name": supplier, "parenttype": "Contact"},
		pluck="parent",
	)
	for contact in linked:
		if contact not in contacts:
			contacts.append(contact)

	for contact in contacts:
		email = _contact_email(contact)
		if not email:
			continue
		try:
			validate_email_address(email, throw=True)
		except Exception:
			continue
		return {
			"supplier": supplier,
			"supplier_name": supplier_doc.supplier_name or supplier,
			"contact": contact,
			"email": email.strip(),
		}
	return {"supplier": supplier, "error": _("Supplier has no contact with a valid email address.")}


def _validate_print_format(print_format, settings):
	if not settings.attach_print_format:
		return "Standard"
	print_format = print_format or settings.default_print_format or "Standard"
	if print_format == "Standard":
		return "Standard"
	format_doc = frappe.get_doc("Print Format", print_format)
	format_doc.check_permission("read")
	if format_doc.doc_type != "Material Request" or format_doc.disabled:
		frappe.throw(_("Select an enabled Material Request print format."))
	return print_format


def _material_request_pdf(material_request, print_format):
	if not print_format:
		return None
	return frappe.get_print(
		"Material Request",
		material_request.name,
		print_format=print_format,
		as_pdf=True,
		doc=material_request,
		letterhead=material_request.letter_head,
	)


def _existing_invitation(material_request, supplier):
	name = frappe.db.get_value(
		INVITATION_DOCTYPE,
		{"material_request": material_request, "supplier": supplier},
		"name",
		order_by="creation desc",
	)
	if not name:
		return None
	return frappe.get_doc(INVITATION_DOCTYPE, name)


def _create_draft_supplier_quotation(material_request, recipient):
	from erpnext.stock.doctype.material_request.material_request import make_supplier_quotation

	sq = make_supplier_quotation(material_request.name)
	if not sq.items:
		frappe.throw(_("This Material Request has no items to quote."))

	sq.supplier = recipient["supplier"]
	sq.supplier_name = recipient.get("supplier_name")
	sq.transaction_date = nowdate()
	if recipient.get("contact"):
		sq.contact_person = recipient["contact"]
	# The mapper runs set_missing_values before the supplier is known, so run it
	# again: currency, price list and address defaults depend on the supplier.
	sq.run_method("set_missing_values")
	if recipient.get("contact"):
		sq.contact_person = recipient["contact"]
	sq.contact_email = recipient["email"]
	sq.insert()
	return sq


def _create_invitation(sq, material_request, recipient, settings, print_format, subject, message):
	inv = frappe.new_doc(INVITATION_DOCTYPE)
	inv.material_request = material_request.name
	inv.company = material_request.company
	inv.supplier = recipient["supplier"]
	inv.supplier_name = recipient.get("supplier_name") or recipient["supplier"]
	inv.contact = recipient.get("contact")
	inv.recipient_email = recipient["email"]
	inv.supplier_quotation = sq.name
	inv.print_format = print_format
	inv.email_subject = subject
	inv.email_message = message
	token = _rotate_token(inv, settings)
	inv.state = "Draft"

	mr_items = {row.name: row for row in material_request.items}
	seen = set()
	for sq_item in sq.items:
		mr_row_name = sq_item.get("material_request_item")
		if not mr_row_name or mr_row_name not in mr_items:
			frappe.throw(_("Supplier Quotation row does not map to the Material Request."))
		if mr_row_name in seen:
			continue
		seen.add(mr_row_name)
		mr_row = mr_items[mr_row_name]
		inv.append(
			"items",
			{
				"material_request_item": mr_row_name,
				"supplier_quotation_item": sq_item.name,
				"item_code": sq_item.item_code,
				"item_name": sq_item.item_name or mr_row.item_name,
				"description": sq_item.description or mr_row.description,
				"qty": sq_item.qty,
				"uom": sq_item.uom,
			},
		)

	_append_event(inv, "Created", detail=_("Draft Supplier Quotation {0}").format(sq.name))
	inv.insert(ignore_permissions=True)
	return inv, token


def _send_invitation_email(inv, token, settings, print_format, pdf_content):
	link = _invitation_link(token)
	plain_context = _plain_context(inv, settings)
	plain_context["link"] = link
	html_context = _html_context(inv, settings, link)
	subject = _render_plain(inv.email_subject or settings.invitation_subject, plain_context)
	message = _render_html(inv.email_message or settings.invitation_message, html_context)
	attachments = []
	if pdf_content:
		attachments.append({"fname": f"{inv.material_request}.pdf", "fcontent": pdf_content})
	frappe.sendmail(
		recipients=[inv.recipient_email],
		subject=subject,
		message=message,
		attachments=attachments,
		reference_doctype=INVITATION_DOCTYPE,
		reference_name=inv.name,
		email_headers={"X-ERPNext-UI-Supplier-Quotation": "1"},
		now=True,
	)


def _notification_recipients(inv, settings):
	recipients = []
	for row in settings.response_recipients:
		if row.enabled and row.email:
			email = row.email.strip()
			if email and email not in recipients:
				recipients.append(email)
	if not recipients:
		mr = frappe.get_doc("Material Request", inv.material_request)
		owner_email = frappe.db.get_value("User", mr.owner, "email")
		if owner_email:
			recipients.append(owner_email)
	if not recipients:
		frappe.throw(_("No response recipients are configured."))
	return recipients


def _send_response_notification(inv, sq, settings):
	recipients = _notification_recipients(inv, settings)
	plain_context = _plain_context(inv, settings)
	# The internal notification must not carry a supplier link: there is no live
	# token to put in it, and a link with an empty token would only confuse the
	# reader. The MR/SQ links come from _html_context.
	html_context = _html_context(inv, settings)
	subject = _render_plain(settings.response_subject, plain_context)
	message = _render_html(settings.response_message, html_context)
	frappe.sendmail(
		recipients=recipients,
		subject=subject,
		message=message,
		reference_doctype=INVITATION_DOCTYPE,
		reference_name=inv.name,
		email_headers={"X-ERPNext-UI-Supplier-Quotation": "1"},
		now=True,
	)
	return recipients


def _response_field_value(value, row):
	if value is None or value == "":
		return "—"
	if row.fieldtype == "Check":
		return _("Yes") if cint(value) else _("No")
	return str(value)


def _send_supplier_response_acknowledgement(inv, sq, settings):
	"""Email the supplier a readable copy of the values they just submitted."""
	if not inv.recipient_email:
		return

	document_fields = get_configured_fields(settings, "Document", editable_only=True)
	item_fields = get_configured_fields(settings, "Item", editable_only=True)
	sq_items = {row.name: row for row in sq.items}
	rows_html = []
	for inv_item in inv.items:
		sq_item = sq_items.get(inv_item.supplier_quotation_item)
		if not sq_item:
			continue
		cells = [
			escape(str(inv_item.item_code or sq_item.item_code or "")),
			escape(str(inv_item.item_name or sq_item.item_name or "")),
			escape(str(inv_item.qty or sq_item.qty or "")),
			escape(str(inv_item.uom or sq_item.uom or "")),
		]
		cells.extend(
			escape(_response_field_value(sq_item.get(field.fieldname), field))
			for field in item_fields
		)
		rows_html.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in cells) + "</tr>")

	columns = [_("Item Code"), _("Item Name"), _("Quantity"), _("UOM")]
	columns.extend(_(field.label or field.fieldname) for field in item_fields)
	header_html = "".join(f"<th>{escape(str(label))}</th>" for label in columns)
	document_rows = "".join(
		"<tr><th>{}</th><td>{}</td></tr>".format(
			escape(str(field.label or field.fieldname)),
		escape(_response_field_value(sq.get(field.fieldname), field)),
		)
		for field in document_fields
	)
	company = frappe.db.get_value("Company", inv.company, "company_name") if inv.company else None
	company = company or inv.company or ""
	message = """
	<p>Thank you. We have received your quotation response.</p>
	<p><strong>Material Request:</strong> {mr}<br>
	<strong>Supplier Quotation:</strong> {sq}<br>
	<strong>Currency:</strong> {currency}</p>
	{document_details}
	<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
	<thead><tr>{headers}</tr></thead><tbody>{items}</tbody></table>
	<p>Regards,<br>{company}</p>
	""".format(
		mr=escape(str(inv.material_request)),
		sq=escape(str(sq.name)),
		currency=escape(str(sq.currency or "")),
		document_details=(
			f'<table border="0" cellpadding="4" cellspacing="0">{document_rows}</table>'
			if document_rows
			else ""
		),
		headers=header_html,
		items="".join(rows_html),
		company=escape(str(company)),
	)
	frappe.sendmail(
		recipients=[inv.recipient_email],
		subject=_("Quotation response received: {0}").format(inv.material_request),
		message=message,
		reference_doctype=INVITATION_DOCTYPE,
		reference_name=inv.name,
		email_headers={"X-ERPNext-UI-Supplier-Quotation": "1"},
		now=True,
	)


# ---------------------------------------------------------------------------
# Internal endpoints
# ---------------------------------------------------------------------------


@frappe.whitelist(allow_guest=False)
def get_supplier_quotation_field_catalog():
	_require_settings_access()
	settings = frappe.get_single(SETTINGS_DOCTYPE)
	return {"catalog": get_field_catalog(), "settings": settings.as_dict()}


@frappe.whitelist(allow_guest=False)
def sync_supplier_quotation_fields():
	_require_settings_access()
	result = sync_supplier_quotation_field_config()
	return result


SETTINGS_SCALAR_FIELDS = {
	"enabled",
	"brand_name",
	"brand_color",
	"invitation_subject",
	"invitation_message",
	"response_subject",
	"response_message",
	"attach_print_format",
	"default_print_format",
	"otp_expiry_minutes",
	"otp_max_attempts",
	"otp_resend_throttle_minutes",
	"invitation_expiry_days",
	"response_session_minutes",
	"max_suppliers_per_request",
	"enable_response_hooks",
}

FIELD_ROW_FIELDS = {
	"scope",
	"fieldname",
	"enabled",
	"supplier_editable",
	"mandatory",
	"display_order",
	"help_text",
}

RECIPIENT_ROW_FIELDS = {"email", "enabled"}


def _replace_child_rows(doc, fieldname, rows, allowed_fields):
	doc.set(fieldname, [])
	for row in rows:
		if not isinstance(row, dict):
			frappe.throw(_("{0} rows must be objects.").format(fieldname))
		doc.append(fieldname, {key: row.get(key) for key in allowed_fields if key in row})


@frappe.whitelist(allow_guest=False)
def save_supplier_quotation_settings(payload=None):
	"""Save the settings screen through one validated, permission-checked call.

	The screen could use the generic resource API, but then the client would be
	choosing which fields and child rows to write. This endpoint keeps the
	allowlist server-side: unknown scalar fields are rejected, metadata-derived
	child values (label/type/options) are never accepted from the browser, and
	the controller's validation runs on the resulting document.
	"""
	_require_settings_access()
	data = _parse_json(payload, dict, _("Settings"))
	unknown = set(data) - SETTINGS_SCALAR_FIELDS - {"field_config", "response_recipients"}
	if unknown:
		frappe.throw(_("Unknown settings: {0}").format(", ".join(sorted(unknown))))

	settings = frappe.get_single(SETTINGS_DOCTYPE)
	for key in SETTINGS_SCALAR_FIELDS:
		if key in data:
			settings.set(key, data[key])

	if "field_config" in data:
		rows = data["field_config"]
		if not isinstance(rows, list):
			frappe.throw(_("Field configuration must be a list."))
		_replace_child_rows(settings, "field_config", rows, FIELD_ROW_FIELDS)

	if "response_recipients" in data:
		rows = data["response_recipients"]
		if not isinstance(rows, list):
			frappe.throw(_("Response recipients must be a list."))
		_replace_child_rows(settings, "response_recipients", rows, RECIPIENT_ROW_FIELDS)

	settings.save()
	return {"settings": settings.as_dict()}


@frappe.whitelist(allow_guest=False)
def get_supplier_quotation_recipients(material_request_name, suppliers=None):
	_require_internal_role()
	_require_material_request(material_request_name)
	names = _parse_supplier_names(suppliers)
	settings = get_settings()
	if len(names) > cint(settings.max_suppliers_per_request):
		frappe.throw(
			_("Select no more than {0} suppliers at a time.").format(settings.max_suppliers_per_request)
		)
	return {"suppliers": [_resolve_supplier_contact(name) for name in names]}


@frappe.whitelist(allow_guest=False)
def send_supplier_quotation_invitations(
	material_request_name, suppliers=None, print_format=None, subject=None, message=None
):
	_require_internal_role()
	settings = get_settings()
	mr = _require_material_request(material_request_name)
	names = _parse_supplier_names(suppliers)
	if not names:
		frappe.throw(_("Select at least one supplier."))
	if len(names) > cint(settings.max_suppliers_per_request):
		frappe.throw(
			_("Select no more than {0} suppliers at a time.").format(settings.max_suppliers_per_request)
		)

	subject = (subject or settings.invitation_subject or "").strip()
	message = message or settings.invitation_message or ""
	if not subject or not message.strip():
		frappe.throw(_("Email subject and message are required."))
	if len(subject) > 140:
		frappe.throw(_("Email subject cannot exceed 140 characters."))
	validate_template_text(subject, _("Invitation Subject"))
	validate_template_text(message, _("Invitation Message"))

	print_format = _validate_print_format(print_format, settings)
	frappe.has_permission("Supplier Quotation", "create", throw=True)

	resolved = [_resolve_supplier_contact(name) for name in names]
	errors = [f"{row['supplier']}: {row.get('error')}" for row in resolved if row.get("error")]
	if errors:
		frappe.throw(_("Fix these supplier contacts before sending:\n{0}").format("\n".join(errors)))

	pdf_content = _material_request_pdf(mr, print_format) if settings.attach_print_format else None
	sent = []
	failed = []

	for index, recipient in enumerate(resolved):
		frappe.db.savepoint(f"supplier_quotation_{index}")
		try:
			inv = _existing_invitation(mr.name, recipient["supplier"])
			if inv:
				if inv.state in ("Sent", "OTP Verified"):
					frappe.throw(
						_("{0} already has an active invitation. Use resend instead.").format(
							recipient["supplier"]
						)
					)
				if inv.state == "Responded":
					frappe.throw(
						_(
							"{0} has already responded. Reopen the invitation explicitly to allow another response."
						).format(recipient["supplier"])
					)
				if inv.state == "Revoked":
					frappe.throw(
						_("{0} has a revoked invitation. Reopen it explicitly to send a new link.").format(
							recipient["supplier"]
						)
					)
				sq = frappe.get_doc("Supplier Quotation", inv.supplier_quotation)
				if sq.docstatus != 0:
					frappe.throw(
						_("{0}'s Supplier Quotation is no longer draft.").format(recipient["supplier"])
					)
				token = _rotate_token(inv, settings)
				inv.contact = recipient.get("contact")
				inv.recipient_email = recipient["email"]
				inv.print_format = print_format
				inv.email_subject = subject
				inv.email_message = message
				inv.state = "Draft"
				inv.last_error = None
				inv.notification_status = "Pending"
				_append_event(inv, "Resent", detail=_("Invitation prepared for resend"))
				inv.save(ignore_permissions=True)
			else:
				sq = _create_draft_supplier_quotation(mr, recipient)
				inv, token = _create_invitation(sq, mr, recipient, settings, print_format, subject, message)

			frappe.db.commit()
			try:
				_send_invitation_email(inv, token, settings, print_format, pdf_content)
				inv.state = "Sent"
				inv.sent_on = _now()
				inv.last_error = None
				_append_event(inv, "Email Sent", detail=_("Sent to {0}").format(inv.recipient_email))
				inv.save(ignore_permissions=True)
				frappe.db.commit()
				sent.append(
					{
						"supplier": inv.supplier,
						"contact": inv.contact,
						"email": inv.recipient_email,
						"supplier_quotation": inv.supplier_quotation,
						"invitation": inv.name,
					}
				)
			except Exception as exc:
				inv.state = "Failed"
				inv.last_error = str(exc)[:500]
				_append_event(inv, "Email Failed", detail=str(exc)[:500])
				inv.save(ignore_permissions=True)
				frappe.db.commit()
				failed.append(
					{
						"supplier": inv.supplier,
						"email": inv.recipient_email,
						"supplier_quotation": inv.supplier_quotation,
						"invitation": inv.name,
						"error": str(exc),
					}
				)
		except Exception as exc:
			frappe.db.rollback(save_point=f"supplier_quotation_{index}")
			failed.append({"supplier": recipient.get("supplier"), "error": str(exc)})

	return {"material_request": mr.name, "sent": sent, "failed": failed}


@frappe.whitelist(allow_guest=False)
def get_supplier_quotation_invitations(material_request_name):
	_require_internal_role()
	mr = _require_material_request(material_request_name)
	rows = frappe.get_all(
		INVITATION_DOCTYPE,
		filters={"material_request": mr.name},
		fields=[
			"name",
			"supplier",
			"supplier_name",
			"recipient_email",
			"contact",
			"supplier_quotation",
			"print_format",
			"state",
			"sent_on",
			"verified_on",
			"responded_on",
			"revoked_on",
			"expired_on",
			"invitation_expires_on",
			"notification_status",
			"notification_error",
			"last_error",
			"modified",
		],
		order_by="creation desc",
	)
	return {"invitations": rows}


def _get_invitation_for_action(invitation_name):
	_require_internal_role()
	inv = frappe.get_doc(INVITATION_DOCTYPE, invitation_name)
	inv.check_permission("read")
	_require_material_request(inv.material_request)
	sq = frappe.get_doc("Supplier Quotation", inv.supplier_quotation)
	sq.check_permission("read")
	return inv, sq


@frappe.whitelist(allow_guest=False)
def resend_supplier_quotation_invitation(invitation_name):
	inv, sq = _get_invitation_for_action(invitation_name)
	settings = get_settings()
	if inv.state == "Responded":
		frappe.throw(
			_("This invitation has already been answered. Reopen it explicitly to allow another response.")
		)
	if inv.state == "Revoked":
		frappe.throw(_("This invitation was revoked. Reopen it explicitly to send a new link."))
	if sq.docstatus != 0:
		frappe.throw(_("The Supplier Quotation is no longer draft."))

	print_format = _validate_print_format(inv.print_format, settings)
	token = _rotate_token(inv, settings)
	inv.state = "Draft"
	inv.last_error = None
	inv.notification_status = "Pending"
	_append_event(inv, "Resent", detail=_("Previous link invalidated"))
	inv.save(ignore_permissions=True)
	frappe.db.commit()

	pdf_content = (
		_material_request_pdf(frappe.get_doc("Material Request", inv.material_request), print_format)
		if settings.attach_print_format
		else None
	)
	try:
		_send_invitation_email(inv, token, settings, print_format, pdf_content)
		inv.state = "Sent"
		inv.sent_on = _now()
		inv.last_error = None
		_append_event(inv, "Email Sent", detail=_("Sent to {0}").format(inv.recipient_email))
		inv.save(ignore_permissions=True)
		frappe.db.commit()
		return {"invitation": inv.name, "state": inv.state}
	except Exception as exc:
		inv.state = "Failed"
		inv.last_error = str(exc)[:500]
		_append_event(inv, "Email Failed", detail=str(exc)[:500])
		inv.save(ignore_permissions=True)
		frappe.db.commit()
		frappe.throw(_("Could not resend the invitation: {0}").format(str(exc)))


@frappe.whitelist(allow_guest=False)
def revoke_supplier_quotation_invitation(invitation_name):
	inv, _sq = _get_invitation_for_action(invitation_name)
	if inv.state == "Revoked":
		return {"invitation": inv.name, "state": inv.state}
	inv.state = "Revoked"
	inv.revoked_on = _now()
	inv.otp_hash = None
	inv.otp_expires_on = None
	inv.response_session_hash = None
	inv.response_session_expires_on = None
	_append_event(inv, "Revoked", detail=_("Invitation link revoked"))
	inv.save(ignore_permissions=True)
	return {"invitation": inv.name, "state": inv.state}


@frappe.whitelist(allow_guest=False)
def reopen_supplier_quotation_invitation(invitation_name):
	inv, sq = _get_invitation_for_action(invitation_name)
	settings = get_settings()
	if inv.state not in ("Responded", "Revoked", "Expired"):
		frappe.throw(_("Only a responded, revoked or expired invitation can be reopened."))
	if sq.docstatus != 0:
		frappe.throw(_("The Supplier Quotation is no longer draft."))

	print_format = _validate_print_format(inv.print_format, settings)
	token = _rotate_token(inv, settings)
	inv.state = "Draft"
	inv.revoked_on = None
	inv.expired_on = None
	inv.last_error = None
	inv.notification_status = "Pending"
	_append_event(inv, "Reopened", detail=_("A new response is now permitted"))
	inv.save(ignore_permissions=True)
	frappe.db.commit()

	pdf_content = (
		_material_request_pdf(frappe.get_doc("Material Request", inv.material_request), print_format)
		if settings.attach_print_format
		else None
	)
	try:
		_send_invitation_email(inv, token, settings, print_format, pdf_content)
		inv.state = "Sent"
		inv.sent_on = _now()
		inv.last_error = None
		_append_event(inv, "Email Sent", detail=_("Sent to {0}").format(inv.recipient_email))
		inv.save(ignore_permissions=True)
		frappe.db.commit()
		return {"invitation": inv.name, "state": inv.state}
	except Exception as exc:
		inv.state = "Failed"
		inv.last_error = str(exc)[:500]
		_append_event(inv, "Email Failed", detail=str(exc)[:500])
		inv.save(ignore_permissions=True)
		frappe.db.commit()
		frappe.throw(_("Could not reopen the invitation: {0}").format(str(exc)))


@frappe.whitelist(allow_guest=False)
def retry_supplier_response_notification(invitation_name):
	inv, sq = _get_invitation_for_action(invitation_name)
	if inv.state != "Responded":
		frappe.throw(_("Only a responded invitation has a response notification."))
	settings = get_settings(require_enabled=False)
	try:
		_send_response_notification(inv, sq, settings)
		inv.notification_status = "Sent"
		inv.notification_error = None
		_append_event(inv, "Notification Sent", detail=_("Response notification retried"))
		inv.save(ignore_permissions=True)
		return {"invitation": inv.name, "notification_status": "Sent"}
	except Exception as exc:
		inv.notification_status = "Failed"
		inv.notification_error = str(exc)[:500]
		_append_event(inv, "Notification Failed", detail=str(exc)[:500])
		inv.save(ignore_permissions=True)
		frappe.throw(_("Could not send the response notification: {0}").format(str(exc)))


# ---------------------------------------------------------------------------
# Public invitation state / OTP
# ---------------------------------------------------------------------------


def _mark_expired(inv):
	if inv.state in ("Responded", "Revoked", "Expired"):
		return inv.state == "Expired"
	if not inv.invitation_expires_on:
		return False
	if _now() <= get_datetime(inv.invitation_expires_on):
		return False
	inv.state = "Expired"
	inv.expired_on = _now()
	inv.otp_hash = None
	inv.otp_expires_on = None
	inv.response_session_hash = None
	inv.response_session_expires_on = None
	_append_event(inv, "Expired", detail=_("Invitation expired"))
	_save_public_doc(inv)
	frappe.db.commit()
	return True


def _assert_public_active(inv):
	if _mark_expired(inv):
		frappe.throw(_("This link has expired."))
	if inv.state == "Revoked":
		frappe.throw(_("This link has been revoked."))
	if inv.state == "Responded":
		frappe.throw(_("This request has already been answered."))
	if inv.state == "Expired":
		frappe.throw(_("This link has expired."))


@frappe.whitelist(allow_guest=True)
def get_supplier_quotation_invitation_state(token=None):
	_rate_limit(f"state:{_public_ip()}", 120, 60)
	inv = _get_invitation_by_token(token)
	settings = get_settings()
	_mark_expired(inv)
	return {
		"state": inv.state,
		"email_hint": _mask_email(inv.recipient_email),
		"expires_on": _as_iso(inv.invitation_expires_on),
		"otp_sent_on": _as_iso(inv.otp_last_sent_on),
		"otp_expiry_minutes": cint(settings.otp_expiry_minutes),
		"brand_name": settings.brand_name or "Supplier Quotation",
		"customer_name": frappe.db.get_value("Company", inv.company, "company_name") or inv.company,
		"brand_color": settings.brand_color or "#4f46e5",
		"can_request_otp": inv.state in ("Draft", "Sent", "Failed", "OTP Verified"),
		"already_responded": inv.state == "Responded",
		"revoked": inv.state == "Revoked",
		"expired": inv.state == "Expired",
	}


@frappe.whitelist(allow_guest=True)
def request_supplier_quotation_otp(token=None):
	_rate_limit(f"otp:{_public_ip()}", 5, 600)
	inv = _get_invitation_by_token(token)
	settings = get_settings()
	_assert_public_active(inv)

	if cint(inv.otp_resend_count) >= 20:
		frappe.throw(_("Too many verification codes have been requested. Please contact the buyer."))
	# A verified supplier may have closed the browser before submitting. The
	# OTP has already been consumed and the response session is kept only in
	# sessionStorage, so let them request a replacement code immediately.
	# Ordinary resend requests still obey the configured throttle.
	if inv.state != "OTP Verified" and inv.otp_last_sent_on:
		elapsed = _now() - get_datetime(inv.otp_last_sent_on)
		throttle = cint(settings.otp_resend_throttle_minutes)
		if throttle and elapsed < timedelta(minutes=throttle):
			frappe.throw(_("Please wait before requesting another code."))

	otp = _new_otp()
	inv.otp_hash = _hash_otp(inv.token_hash, otp)
	inv.otp_expires_on = add_to_date(_now(), minutes=cint(settings.otp_expiry_minutes) or 10)
	inv.otp_attempts = 0
	inv.otp_resend_count = cint(inv.otp_resend_count) + 1
	inv.otp_last_sent_on = _now()
	inv.state = "Sent"
	inv.response_session_hash = None
	inv.response_session_expires_on = None
	inv.last_error = None
	_append_event(
		inv,
		"OTP Requested",
		detail=_("Verification code sent to {0}").format(_mask_email(inv.recipient_email)),
		ip=_public_ip(),
	)
	_save_public_doc(inv)
	frappe.db.commit()

	try:
		frappe.sendmail(
			recipients=[inv.recipient_email],
			subject=_("Your supplier quotation verification code"),
			message=_(
				"Your verification code is <b>{0}</b>. It expires in {1} minutes.<br><br>"
				"If you did not request this code, you can ignore this email."
			).format(otp, cint(settings.otp_expiry_minutes)),
			reference_doctype=INVITATION_DOCTYPE,
			reference_name=inv.name,
			email_headers={"X-ERPNext-UI-Supplier-Quotation": "1"},
			now=True,
		)
	except Exception as exc:
		inv.otp_hash = None
		inv.otp_expires_on = None
		inv.otp_last_sent_on = None
		inv.last_error = str(exc)[:500]
		_append_event(inv, "OTP Email Failed", detail=str(exc)[:500], ip=_public_ip())
		_save_public_doc(inv)
		frappe.db.commit()
		frappe.throw(_("Could not send the verification code. Please try again."))

	return {
		"sent": True,
		"email_hint": _mask_email(inv.recipient_email),
		"expires_in_minutes": cint(settings.otp_expiry_minutes) or 10,
	}


@frappe.whitelist(allow_guest=True)
def verify_supplier_quotation_otp(token=None, otp=None):
	_rate_limit(f"verify:{_public_ip()}", 20, 600)
	inv = _get_invitation_by_token(token)
	settings = get_settings()
	_assert_public_active(inv)

	otp = str(otp or "").strip()
	if not inv.otp_hash or not inv.otp_expires_on:
		frappe.throw(_("Request a verification code first."))
	if _now() > get_datetime(inv.otp_expires_on):
		inv.otp_hash = None
		inv.otp_expires_on = None
		_save_public_doc(inv)
		frappe.db.commit()
		frappe.throw(_("The verification code has expired. Request a new code."))
	if cint(inv.otp_attempts) >= cint(settings.otp_max_attempts):
		frappe.throw(_("Too many incorrect codes. Request a new verification code."))

	if not _constant_time_equal(_hash_otp(inv.token_hash, otp), inv.otp_hash):
		inv.otp_attempts = cint(inv.otp_attempts) + 1
		_append_event(inv, "OTP Failed", detail=_("Incorrect verification code"), ip=_public_ip())
		_save_public_doc(inv)
		frappe.db.commit()
		frappe.throw(_("That verification code is incorrect."))

	session = _new_token()
	inv.response_session_hash = _hash_token(session)
	inv.response_session_expires_on = add_to_date(
		_now(), minutes=cint(settings.response_session_minutes) or 30
	)
	inv.state = "OTP Verified"
	inv.verified_on = _now()
	inv.otp_hash = None
	inv.otp_expires_on = None
	inv.otp_attempts = 0
	_append_event(inv, "OTP Verified", detail=_("Supplier verified the invited email"), ip=_public_ip())
	_save_public_doc(inv)
	frappe.db.commit()

	form = _build_response_form(inv, settings)
	return {"session": session, "form": form}


def expire_supplier_quotation_invitations():
	"""Mark invitations past their expiry so tracking does not show them as live.

	Public access already computes expiry lazily. This scheduled job exists so
	an untouched invitation does not sit at `Sent` in the buyer's list forever.
	"""
	names = frappe.get_all(
		INVITATION_DOCTYPE,
		filters={
			"state": ("in", ["Draft", "Sent", "Failed", "OTP Verified"]),
			"invitation_expires_on": ("<", _now()),
		},
		pluck="name",
	)
	for name in names:
		_mark_expired(frappe.get_doc(INVITATION_DOCTYPE, name))


def _assert_session_active(inv):
	if _mark_expired(inv):
		frappe.throw(_("This link has expired."))
	if inv.state != "OTP Verified":
		frappe.throw(_("Please verify your email address again."))
	if not inv.response_session_hash or not inv.response_session_expires_on:
		frappe.throw(_("Your response session is invalid. Please verify your email again."))
	if _now() > get_datetime(inv.response_session_expires_on):
		inv.response_session_hash = None
		inv.response_session_expires_on = None
		_save_public_doc(inv)
		frappe.db.commit()
		frappe.throw(_("Your response session has expired. Please verify your email again."))


@frappe.whitelist(allow_guest=True)
def get_supplier_quotation_response_form(session=None):
	_rate_limit(f"form:{_public_ip()}", 60, 60)
	inv = _get_invitation_by_session(session)
	settings = get_settings()
	_assert_session_active(inv)
	return {"form": _build_response_form(inv, settings)}


def _build_response_form(inv, settings):
	sq = frappe.get_doc("Supplier Quotation", inv.supplier_quotation)
	if sq.docstatus != 0:
		frappe.throw(_("This Supplier Quotation is no longer open for a response."))
	if sq.supplier != inv.supplier:
		frappe.throw(_("The invitation no longer matches its Supplier Quotation."))
	mr = frappe.get_doc("Material Request", inv.material_request)

	sq_items = {row.name: row for row in sq.items}
	document_context, document_inputs = _split_context_and_inputs(settings, "Document")
	item_context, item_inputs = _split_context_and_inputs(settings, "Item")

	required_by = mr.get("schedule_date")
	if not required_by:
		dates = [row.schedule_date for row in sq.items if row.get("schedule_date")]
		required_by = max(dates) if dates else None

	items = []
	for inv_item in inv.items:
		sq_item = sq_items.get(inv_item.supplier_quotation_item)
		if not sq_item:
			frappe.throw(_("The invitation no longer matches its Supplier Quotation."))
		items.append(
			{
				"item": inv_item.name,
				"item_code": inv_item.item_code or sq_item.item_code,
				"item_name": inv_item.item_name or sq_item.item_name,
				"description": strip_html(inv_item.description or sq_item.description or ""),
				"qty": flt(inv_item.qty or sq_item.qty),
				"uom": inv_item.uom or sq_item.uom,
				"context": [_field_payload(row, sq_item.get(row.fieldname), False) for row in item_context],
				"fields": [_field_payload(row, sq_item.get(row.fieldname), True) for row in item_inputs],
			}
		)

	return {
		"material_request": inv.material_request,
		"supplier": inv.supplier,
		"supplier_name": inv.supplier_name or sq.supplier_name or inv.supplier,
		"company": inv.company or sq.company,
		"currency": sq.currency,
		"required_by": _as_iso(required_by),
		"document": {
			"context": [_field_payload(row, sq.get(row.fieldname), False) for row in document_context],
			"fields": [_field_payload(row, sq.get(row.fieldname), True) for row in document_inputs],
		},
		"items": items,
	}


def _run_response_hooks(settings, sq, inv, submitted):
	if not settings.enable_response_hooks:
		return
	for method in frappe.get_hooks("supplier_quotation_response") or []:
		frappe.get_attr(method)(sq, inv, submitted)


@frappe.whitelist(allow_guest=True)
def submit_supplier_quotation_response(session=None, rows=None, document=None):
	_rate_limit(f"submit:{_public_ip()}", 10, 600)
	inv = _get_invitation_by_session(session)
	settings = get_settings()
	_assert_session_active(inv)

	sq = frappe.get_doc("Supplier Quotation", inv.supplier_quotation)
	if sq.docstatus != 0:
		frappe.throw(_("This Supplier Quotation is no longer open for a response."))
	if sq.supplier != inv.supplier:
		frappe.throw(_("The invitation no longer matches its Supplier Quotation."))

	document_values = _parse_json(document, dict, _("Document values"))
	editable_document = _editable_field_map(settings, "Document")
	for fieldname in document_values:
		if fieldname not in editable_document:
			frappe.throw(_("{0} is not open for supplier input.").format(fieldname))
	for row in editable_document.values():
		if row.mandatory and not _has_value(document_values.get(row.fieldname)):
			frappe.throw(_("{0} is required.").format(row.label or row.fieldname))
	for fieldname, value in document_values.items():
		row = editable_document[fieldname]
		sq.set(fieldname, _validate_value(_field_meta(row), value))

	rows = _parse_json(rows, list, _("Item values"))
	editable_item = _editable_field_map(settings, "Item")
	rows_by_item = {}
	for entry in rows:
		if not isinstance(entry, dict):
			frappe.throw(_("Each item response must be an object."))
		item_name = entry.get("item") or entry.get("invitation_item")
		if not item_name:
			frappe.throw(_("Each item response must name its invitation row."))
		if item_name in rows_by_item:
			frappe.throw(_("Duplicate item response."))
		rows_by_item[item_name] = _parse_json(entry.get("values"), dict, _("Item values"))

	expected_items = {row.name for row in inv.items}
	if set(rows_by_item) != expected_items:
		frappe.throw(_("The response must include every requested item."))

	sq_items = {row.name: row for row in sq.items}
	for inv_item in inv.items:
		sq_item = sq_items.get(inv_item.supplier_quotation_item)
		if not sq_item:
			frappe.throw(_("The invitation no longer matches its Supplier Quotation."))
		values = rows_by_item[inv_item.name]
		for fieldname in values:
			if fieldname not in editable_item:
				frappe.throw(_("{0} is not open for supplier input.").format(fieldname))
		for row in editable_item.values():
			if row.mandatory and not _has_value(values.get(row.fieldname)):
				frappe.throw(
					_("{0} is required for {1}.").format(
						row.label or row.fieldname, inv_item.item_code or inv_item.item_name
					)
				)
		for fieldname, value in values.items():
			row = editable_item[fieldname]
			sq_item.set(fieldname, _validate_value(_field_meta(row), value))

	_run_response_hooks(
		settings,
		sq,
		inv,
		{"document": document_values, "items": rows_by_item},
	)
	sq.run_method("calculate_taxes_and_totals")
	_save_public_doc(sq)

	inv.state = "Responded"
	inv.responded_on = _now()
	inv.response_session_hash = None
	inv.response_session_expires_on = None
	inv.otp_hash = None
	inv.otp_expires_on = None
	inv.otp_attempts = 0
	inv.notification_status = "Pending"
	inv.notification_error = None
	_append_event(inv, "Responded", detail=_("Supplier response accepted"), ip=_public_ip())
	_save_public_doc(inv)
	frappe.db.commit()

	notification_sent = False
	try:
		_send_response_notification(inv, sq, settings)
		_send_supplier_response_acknowledgement(inv, sq, settings)
		inv.notification_status = "Sent"
		inv.notification_error = None
		notification_sent = True
	except Exception as exc:
		inv.notification_status = "Failed"
		inv.notification_error = str(exc)[:500]
		frappe.log_error(
			title="Supplier quotation response notification failed",
			message=f"{inv.name}: {str(exc)[:800]}",
		)
	_save_public_doc(inv)
	frappe.db.commit()

	return {
		"ok": True,
		"material_request": inv.material_request,
		"supplier_quotation": inv.supplier_quotation,
		"notification_sent": notification_sent,
	}
