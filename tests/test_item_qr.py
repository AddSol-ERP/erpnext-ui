"""QR integrity, source permissions, membership and public-data boundaries."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

frappe = types.ModuleType("frappe")
frappe.whitelist = lambda **kwargs: lambda function: function
utils = types.ModuleType("frappe.utils")
utils.get_url = lambda: "https://erp.example"
password = types.ModuleType("frappe.utils.password")
password.get_encryption_key = lambda: "test-key"
spec = importlib.util.spec_from_file_location(
	"qr_under_test", Path(__file__).resolve().parents[1] / "erpnext_ui/item_qr.py"
)
qr = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"frappe": frappe, "frappe.utils": utils, "frappe.utils.password": password}):
	spec.loader.exec_module(qr)


class Doc(types.SimpleNamespace):
	def get(self, key):
		return getattr(self, key, None)

	def check_permission(self, permission):
		if getattr(self, "denied", False):
			raise PermissionError("denied")


class LabelTests(unittest.TestCase):
	def test_signed_label_round_trip(self):
		locator = {"kind": "receipt", "receipt": "PR-1", "row": "ROW-1", "unit": 1}
		token = qr.encode_label(locator, "key")
		self.assertEqual(qr.decode_label(token, "key"), locator)
		with self.assertRaises(ValueError):
			qr.decode_label(token, "other-key")
		with self.assertRaises(ValueError):
			qr.decode_label("x" + token, "key")

	def test_bad_or_missing_token_fails(self):
		for value in (None, "", "x", "a.b.c", "x" * 5000):
			with self.subTest(value=str(value)[:10]), self.assertRaises(ValueError):
				qr.decode_label(value, "key")

	def test_public_link_and_legacy_formats_resolve(self):
		locator = {"kind": "serial", "serial": "SER-001"}
		self.assertEqual(qr.scan_locator(qr.public_label_url(locator)), locator)
		old = qr.scan_locator(
			"https://erp.example/addsol_ui#/store/purchase-receipt/PR-1?item=ROW-1&serial=SER-001&unit=2"
		)
		self.assertEqual(
			(old["receipt"], old["row"], old["serial"], old["unit"]), ("PR-1", "ROW-1", "SER-001", "2")
		)
		self.assertEqual(
			qr.scan_locator("https://erp.example/addsol_ui#/store/plate-offcut/CUT-1?serial=SER-1"),
			{"kind": "serial", "serial": "SER-1"},
		)

	def test_foreign_urls_and_unknown_paths_are_rejected(self):
		for value in (
			"https://evil.example/item-preview?token=abc",
			"https://erp.example/api/resource/Item/SECRET",
		):
			with self.assertRaises(ValueError):
				qr.scan_locator(value)

	def test_public_allow_list_keeps_requested_context_only(self):
		details = dict(
			item_code="PLATE",
			supplier="Supplier name",
			project="P1",
			work_order="WO1",
			purchase_rate=999,
			warehouse="Private stores",
			stock_qty=50,
			reference_name="PR1",
			email="secret",
			attachments=["private.pdf"],
		)
		public = qr.public_projection(details, "Accepted")
		self.assertEqual(public["warehouse"], "Private stores")
		self.assertEqual(public["reference_name"], "PR1")
		self.assertEqual(
			(public["supplier"], public["project"], public["work_order"]), ("Supplier name", "P1", "WO1")
		)
		self.assertTrue(
			set(details).difference(public).issuperset({"purchase_rate", "stock_qty", "email", "attachments"})
		)

	def docs(self, status=1, denied=False):
		return {
			("Purchase Receipt", "PR1"): Doc(
				name="PR1",
				docstatus=status,
				supplier="Supplier",
				items=[Doc(name="ROW1", item_code="PLATE", serial_no="S1", batch_no="", project="P1")],
				denied=denied,
			),
			("Item", "PLATE"): Doc(item_name="Plate", stock_uom="Nos", custom_length_mm=2500),
			("Serial No", "S1"): Doc(item_code="PLATE", warehouse="Stores", status="Active"),
			("Serial No", "S2"): Doc(item_code="PLATE", warehouse="Stores", status="Active"),
		}

	def resolve(self, docs, **locator):
		with patch.object(frappe, "get_doc", side_effect=lambda dt, name: docs[(dt, name)], create=True):
			return qr.resolve_locator(
				{"kind": "receipt", "receipt": "PR1", "row": "ROW1", **locator}, authenticated=True
			)

	def test_receipt_item_and_serial_resolve_in_stock_units(self):
		result = self.resolve(self.docs(), serial="S1")
		self.assertEqual(
			(result["item_code"], result["serial_no"], result["qty"], result["project"]),
			("PLATE", "S1", 1, "P1"),
		)

	def test_cancelled_receipts_are_not_resolved(self):
		with self.assertRaises(ValueError):
			self.resolve(self.docs(status=2))

	def test_source_permissions_are_enforced_for_scanning(self):
		with self.assertRaises(PermissionError):
			self.resolve(self.docs(denied=True))

	def test_legacy_url_cannot_substitute_other_serial_of_same_item(self):
		with self.assertRaisesRegex(ValueError, "not part"):
			self.resolve(self.docs(), serial="S2")


class PublicPageTests(unittest.TestCase):
	def test_preview_does_not_interpret_item_names_as_html(self):
		from jinja2 import DictLoader, Environment

		root = Path(__file__).resolve().parents[1]
		environment = Environment(
			loader=DictLoader(
				{
					"templates/web.html": "{% block page_content %}{% endblock %}",
					"preview": (root / "erpnext_ui/www/item-preview.html").read_text(),
				}
			),
			autoescape=True,
		)
		environment.globals["_"] = lambda text: text
		html = environment.get_template("preview").render(
			error=None,
			preview={
				"item_name": "<script>alert(1)</script>",
				"item_code": "PLATE",
				"specifications": [],
			},
		)
		self.assertNotIn("<script>", html)
		self.assertIn("&lt;script&gt;", html)
		self.assertNotIn("<form", html)

	def test_invalid_public_tokens_never_load_documents(self):
		with patch.object(frappe, "get_doc", create=True) as load:
			with self.assertRaises(ValueError):
				qr.get_public_preview("tampered")
			load.assert_not_called()


class PublicHiddenValueTests(unittest.TestCase):
	def test_all_quantity_and_pricing_fields_stay_out_of_public_payload(self):
		hidden = {
			key: 12345
			for key in (
				"qty",
				"stock_qty",
				"actual_qty",
				"reserved_qty",
				"rate",
				"amount",
				"purchase_rate",
				"valuation_rate",
				"stock_value",
				"price_list_rate",
			)
		}
		public = qr.public_projection(
			{**hidden, "warehouse": "Stores", "reference_name": "PR1", "serial_status": "Active"}, "Accepted"
		)
		self.assertTrue(set(hidden).isdisjoint(public))
		self.assertEqual(
			(public["warehouse"], public["reference_name"], public["serial_status"]),
			("Stores", "PR1", "Active"),
		)


class PreviewControllerTests(unittest.TestCase):
	def controller(self, result=None, error=None):
		import importlib

		helper = types.ModuleType("erpnext_ui.item_qr")
		helper.get_public_preview = Mock(return_value=result, side_effect=error)
		# Frappe normalizes hyphens to underscores when importing a WWW controller.
		with (
			patch.dict(sys.modules, {"frappe": frappe, "erpnext_ui.item_qr": helper}),
			patch.object(frappe, "form_dict", {"token": "label-token"}, create=True),
			patch.object(frappe, "local", types.SimpleNamespace(response={}), create=True),
			patch.object(frappe, "DoesNotExistError", type("MissingDocument", (Exception,), {}), create=True),
		):
			module = importlib.import_module("erpnext_ui.www.item_preview")
			context = Doc()
			module.get_context(context)
			headers = dict(frappe.local.response["headers"])
			helper.get_public_preview.assert_called_once_with("label-token")
		return context, headers

	def test_frappe_controller_import_populates_preview(self):
		preview = {"item_name": "Plate", "item_code": "PLATE", "specifications": []}
		context, headers = self.controller(result=preview)
		self.assertEqual(context.preview, preview)
		self.assertIsNone(context.error)
		self.assertEqual(context.no_cache, 1)
		self.assertEqual(headers["Referrer-Policy"], "no-referrer")

	def test_invalid_labels_populate_friendly_error_context(self):
		context, _ = self.controller(error=ValueError("bad signature"))
		self.assertIsNone(context.preview)
		self.assertIn("invalid", context.error)
		self.assertNotIn("bad signature", context.error)


class SharedQrRendererTests(unittest.TestCase):
	def test_renderer_encodes_the_signed_public_link(self):
		import base64

		library = types.ModuleType("pyqrcode")
		image = Mock()
		image.svg.side_effect = lambda stream, **kwargs: stream.write(b"<svg>QR</svg>")
		library.create = Mock(return_value=image)
		locator = {"kind": "serial", "serial": "S1"}
		with patch.dict(sys.modules, {"pyqrcode": library}):
			result = qr.label_qr_svg_base64(locator)
		self.assertEqual(base64.b64decode(result), b"<svg>QR</svg>")
		self.assertEqual(qr.scan_locator(library.create.call_args.args[0]), locator)
