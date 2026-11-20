"""Draft preparation must isolate source documents and enforce source access."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


class Doc(dict):
	def __getattr__(self, key):
		return self.get(key)

	def __setattr__(self, key, value):
		self[key] = value

	def set(self, key, value):
		self[key] = value

	def append(self, key, value):
		self.setdefault(key, []).append(value)

	def check_permission(self, kind):
		if self.get("denied"):
			raise PermissionError(kind)

	def as_dict(self):
		return dict(self)


class BomCreationTests(unittest.TestCase):
	def setUp(self):
		self.project = Doc(name="PROJECT", company="ACME")
		self.source = Doc(
			company="ACME",
			docstatus=1,
			enabled=1,
			item="FG",
			quantity=2,
			items=[Doc(name="OLD-ROW", parent="SOURCE", item_code="RAW", qty=3, uom="Nos")],
			operations=[],
			scrap_items=[],
		)
		self.frappe = types.SimpleNamespace(
			get_doc=Mock(side_effect=lambda dt, name: self.project if dt == "Project" else self.source),
			has_permission=Mock(),
			new_doc=Mock(side_effect=lambda dt: Doc(doctype=dt)),
			copy_doc=Mock(side_effect=lambda doc: Doc(**doc)),
			throw=Mock(side_effect=ValueError),
		)
		spec = importlib.util.spec_from_file_location(
			"bom_creation_test", Path(__file__).resolve().parents[1] / "erpnext_ui/bom_creation.py"
		)
		self.module = importlib.util.module_from_spec(spec)
		with patch.dict(sys.modules, {"frappe": self.frappe}):
			spec.loader.exec_module(self.module)

	def test_existing_copy_is_unsaved_and_not_default(self):
		result = self.module.prepare_copy("PROJECT", "SOURCE")
		self.assertEqual((result["docstatus"], result["project"], result["is_default"]), (0, "PROJECT", 0))
		self.assertEqual(self.source.docstatus, 1)
		self.assertNotIn("project", self.source)
		self.frappe.has_permission.assert_called_with("BOM", "create", throw=True)

	def test_template_rows_do_not_keep_source_identities(self):
		result = self.module.prepare_copy("PROJECT", "TEMPLATE", "UI BOM Template")
		self.assertEqual(result["items"][0]["item_code"], "RAW")
		self.assertNotIn("parent", result["items"][0])
		self.assertNotIn("name", result["items"][0])
		self.assertEqual(result["quantity"], 2)
		self.assertEqual(self.source["items"][0]["name"], "OLD-ROW")

	def test_disabled_template_rejected(self):
		self.source.enabled = 0
		with self.assertRaises(ValueError):
			self.module.prepare_copy("PROJECT", "TEMPLATE", "UI BOM Template")

	def test_cross_company_and_cancelled_sources_rejected(self):
		for field, value in [("company", "OTHER"), ("docstatus", 2)]:
			with self.subTest(field=field):
				original = self.source[field]
				self.source[field] = value
				with self.assertRaises(ValueError):
					self.module.prepare_copy("PROJECT", "SOURCE")
				self.source[field] = original

	def test_source_and_project_access_required(self):
		for doc in [self.source, self.project]:
			with self.subTest(doc=doc):
				doc.denied = True
				with self.assertRaises(PermissionError):
					self.module.prepare_copy("PROJECT", "SOURCE")
				doc.denied = False

	def test_arbitrary_source_doctype_rejected(self):
		with self.assertRaises(ValueError):
			self.module.prepare_copy("PROJECT", "SECRET", "User")
		self.frappe.get_doc.assert_not_called()

	def test_routing_operations_loaded_with_permission(self):
		self.source.routing = "ROUTING"
		routing = Doc(operations=[Doc(operation="Cut", time_in_mins=10, name="OLD")])
		self.frappe.get_doc.side_effect = lambda dt, name: (
			self.project if dt == "Project" else routing if dt == "Routing" else self.source
		)
		result = self.module.prepare_copy("PROJECT", "TEMPLATE", "UI BOM Template")
		self.assertEqual(result["operations"][0]["operation"], "Cut")
		self.assertEqual(result["with_operations"], 1)
		routing.denied = True
		with self.assertRaises(PermissionError):
			self.module.prepare_copy("PROJECT", "TEMPLATE", "UI BOM Template")
