"""Signed physical-label links, permission-checked scanning and public projections."""

import base64
import hashlib
import hmac
import json
import math
import re
from urllib.parse import parse_qs, quote, unquote, urlsplit

import frappe
from frappe.utils import get_url
from frappe.utils.password import get_encryption_key


def encode_label(locator, secret):
	payload = (
		base64.urlsafe_b64encode(json.dumps(locator, sort_keys=True, separators=(",", ":")).encode())
		.decode()
		.rstrip("=")
	)
	signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
	return payload + "." + signature


def decode_label(token, secret):
	try:
		if not isinstance(token, str) or len(token) > 4096:
			raise ValueError
		payload, signature = token.split(".")
		expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
		if not hmac.compare_digest(signature, expected):
			raise ValueError
		locator = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
		if not isinstance(locator, dict) or locator.get("kind") not in ("receipt", "serial"):
			raise ValueError
		return locator
	except (ValueError, TypeError, UnicodeError):
		raise ValueError("This QR label is invalid or has been changed.") from None


def public_label_url(locator):
	return get_url() + "/item-preview?token=" + quote(encode_label(locator, get_encryption_key()), safe="")


def scan_locator(value):
	"""Accept new labels and existing receipt/offcut links, never fetch a scanned URL."""
	if not isinstance(value, str) or len(value) > 8192:
		raise ValueError("Scan a valid item QR label.")
	url = urlsplit(value.strip())
	if url.netloc and url.netloc != urlsplit(get_url()).netloc:
		raise ValueError("This label belongs to a different site.")
	query = parse_qs(url.query)
	if url.path.rstrip("/") == "/item-preview" and query.get("token"):
		return decode_label(query["token"][0], get_encryption_key())
	fragment = urlsplit(url.fragment)
	query = parse_qs(fragment.query)
	match = re.fullmatch(r"/store/purchase-receipt/([^/]+)", fragment.path)
	if match and query.get("item"):
		return {
			"kind": "receipt",
			"receipt": unquote(match[1]),
			"row": query["item"][0],
			"serial": query.get("serial", [""])[0],
			"batch": query.get("batch", [""])[0],
			"unit": query.get("unit", [""])[0],
		}
	if re.fullmatch(r"/store/plate-offcut/[^/]+", fragment.path) and query.get("serial"):
		return {"kind": "serial", "serial": query["serial"][0]}
	raise ValueError("Scan a generated receipt or offcut QR label.")


def source_supplier(serial, authenticated=False):
	"""A cut piece retains its source serial's supplier, without publishing lineage docs."""
	visited = set()
	for _ in range(12):
		source_serial = serial.get("custom_source_serial_no")
		if not source_serial or source_serial in visited:
			return ""
		visited.add(source_serial)
		serial = frappe.get_doc("Serial No", source_serial)
		if authenticated:
			serial.check_permission("read")
		receipt_name = serial.get("purchase_document_no")
		if receipt_name and frappe.db.exists("Purchase Receipt", receipt_name):
			receipt = frappe.get_doc("Purchase Receipt", receipt_name)
			if authenticated:
				receipt.check_permission("read")
			if receipt.docstatus == 1:
				return receipt.get("supplier_name") or receipt.get("supplier") or ""
	return ""


def resolve_locator(locator, authenticated=False):
	"""No guest access to raw document IDs: public callers must verify a signature first."""
	receipt = row = serial = batch = None
	if locator["kind"] == "receipt":
		receipt = frappe.get_doc("Purchase Receipt", locator.get("receipt"))
		if authenticated:
			receipt.check_permission("read")
		if receipt.docstatus != 1:
			raise ValueError("This receipt is not submitted or has been cancelled.")
		row = next((row for row in receipt.items if row.name == locator.get("row")), None)
		if not row:
			raise ValueError("The labelled receipt item is unavailable.")
		code = row.item_code
	else:
		serial = frappe.get_doc("Serial No", locator.get("serial"))
		if authenticated:
			serial.check_permission("read")
		code = serial.item_code
	if serial and serial.get("purchase_document_no"):
		for source_type in ("Purchase Receipt", "Stock Entry"):
			if not frappe.db.exists(source_type, serial.purchase_document_no):
				continue
			source = frappe.get_doc(source_type, serial.purchase_document_no)
			if authenticated:
				source.check_permission("read")
			if source.docstatus != 1:
				raise ValueError("This label source is not submitted or has been cancelled.")
			if source.docstatus == 1:
				if source_type == "Purchase Receipt":
					receipt = source
				else:
					locator = {
						**locator,
						"source_type": source_type,
						"source_name": source.name,
						"source_project": source.get("project"),
						"source_work_order": source.get("work_order")
						or source.get("custom_store_work_order"),
					}
			break
	item = frappe.get_doc("Item", code)
	if authenticated:
		item.check_permission("read")
	serial_no = locator.get("serial") or ""
	batch_no = locator.get("batch") or (serial.get("batch_no") if serial else "") or ""
	if serial_no:
		serial = serial or frappe.get_doc("Serial No", serial_no)
		if authenticated:
			serial.check_permission("read")
		if serial.item_code != code:
			raise ValueError("Serial number does not belong to this item.")
		if batch_no and serial.get("batch_no") and serial.batch_no != batch_no:
			raise ValueError("Serial number does not belong to this batch.")
		batch_no = batch_no or serial.get("batch_no") or ""
	# Legacy QR query parameters are editable. Check receipt membership rather
	# than accepting an arbitrary serial/batch of the same Item.
	if row and (serial_no or batch_no):
		serials = set(re.split(r"[\n,]", row.get("serial_no") or ""))
		batches = {row.get("batch_no")} - {None, ""}
		if row.get("serial_and_batch_bundle"):
			bundle = frappe.get_doc("Serial and Batch Bundle", row.serial_and_batch_bundle)
			serials.update(entry.serial_no for entry in bundle.entries if entry.get("serial_no"))
			batches.update(entry.batch_no for entry in bundle.entries if entry.get("batch_no"))
		serials = {value.strip() for value in serials}
		if serial_no and serial_no not in serials:
			raise ValueError("Serial number is not part of the labelled receipt row.")
		if (
			batch_no
			and batch_no not in batches
			and not (serial and serial.get("batch_no") == batch_no and serial_no in serials)
		):
			raise ValueError("Batch is not part of the labelled receipt row.")
	if batch_no:
		batch = frappe.get_doc("Batch", batch_no)
		if batch.item != code:
			raise ValueError("Batch does not belong to this item.")
	project = (
		(row.get("project") if row else None)
		or locator.get("source_project")
		or item.get("custom_project")
		or ""
	)
	work_order = (
		(row.get("work_order") if row else None)
		or (serial.get("work_order") if serial else None)
		or locator.get("source_work_order")
		or ""
	)
	material_request = row.get("material_request") if row else None
	if material_request:
		request = frappe.get_doc("Material Request", material_request)
		work_order = work_order or request.get("custom_store_work_order") or request.get("work_order") or ""
	qty = float(locator.get("qty", 1))
	if not math.isfinite(qty) or qty <= 0:
		raise ValueError("Invalid QR quantity.")
	return {
		"qty": qty,
		"item_code": code,
		"item_name": item.item_name,
		"description": item.get("description"),
		"item_group": item.get("item_group"),
		"brand": item.get("brand"),
		"manufacturer": item.get("manufacturer"),
		"manufacturer_part_no": item.get("manufacturer_part_no"),
		"stock_uom": item.stock_uom,
		"batch_no": batch_no,
		"serial_no": serial_no,
		"warehouse": serial.get("warehouse") if serial else "",
		"serial_status": serial.get("status") if serial else "",
		"receipt_warehouse": row.get("warehouse") if row else "",
		"supplier_id": receipt.get("supplier") if receipt else "",
		"receipt_date": receipt.get("posting_date") if receipt else "",
		"purchase_order": row.get("purchase_order") if row else "",
		"material_request": material_request or "",
		"manufacturing_date": batch.get("manufacturing_date") if batch else "",
		"expiry_date": batch.get("expiry_date") if batch else "",
		"heat_number": (serial.get("custom_heat_number") if serial else None)
		or (batch.get("custom_heat_number") if batch else None)
		or "",
		"supplier": (receipt.get("supplier_name") or receipt.get("supplier"))
		if receipt
		else source_supplier(serial, authenticated)
		if serial
		else "",
		"project": project,
		"work_order": work_order,
		"reference_type": "Purchase Receipt" if receipt else locator.get("source_type", ""),
		"reference_name": receipt.name if receipt else locator.get("source_name", ""),
		"specifications": [
			(label, item.get(field))
			for field, label in (
				("custom_thickness_mm", "Thickness (mm)"),
				("custom_thickness_dropdown", "Thickness"),
				("custom_length_mm", "Length (mm)"),
				("custom_width_mm", "Width (mm)"),
			)
			if item.get(field) is not None and item.get(field) != ""
		],
	}


def public_projection(details, inspection_status):
	"""Explicit guest allow-list; do not return the internal resolver payload."""
	return {
		key: details.get(key)
		for key in (
			"item_code",
			"item_name",
			"description",
			"item_group",
			"brand",
			"manufacturer",
			"manufacturer_part_no",
			"warehouse",
			"receipt_warehouse",
			"serial_status",
			"supplier_id",
			"reference_type",
			"reference_name",
			"receipt_date",
			"purchase_order",
			"material_request",
			"manufacturing_date",
			"expiry_date",
			"heat_number",
			"stock_uom",
			"batch_no",
			"serial_no",
			"supplier",
			"project",
			"work_order",
			"specifications",
		)
	} | {"inspection_status": inspection_status}


def get_public_preview(token):
	locator = decode_label(token, get_encryption_key())
	details = resolve_locator(locator)
	filters = {"item_code": details["item_code"], "docstatus": 1}
	if details["serial_no"]:
		filters["item_serial_no"] = details["serial_no"]
	elif details["batch_no"]:
		filters["batch_no"] = details["batch_no"]
	elif details["reference_name"]:
		filters.update(reference_type=details["reference_type"], reference_name=details["reference_name"])
	else:
		return public_projection(details, "Not inspected")
	status = frappe.get_all(
		"Quality Inspection",
		filters=filters,
		fields=["name", "status", "report_date", "inspection_type"],
		order_by="modified desc",
		limit_page_length=1,
	)
	preview = public_projection(details, status[0].status if status else "Not inspected")
	if status:
		preview.update(
			inspection_id=status[0].name,
			inspection_date=status[0].get("report_date"),
			inspection_type=status[0].get("inspection_type"),
		)
	return preview


@frappe.whitelist(allow_guest=False)
def resolve_item_qr(value):
	"""Resolve a scanned label only for users who can read its source and Item."""
	try:
		details = resolve_locator(scan_locator(value), authenticated=True)
		details["label_id"] = hashlib.sha256(value.strip().encode()).hexdigest()
		return details
	except ValueError as exc:
		frappe.throw(str(exc))
