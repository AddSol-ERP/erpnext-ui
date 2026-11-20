"""Upgrade owner-restricted comparison permissions without resetting other roles."""

import ast
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

source = (
	Path(__file__).resolve().parents[1] / "erpnext_ui/patches/v1_0/share_quotation_evaluation_permissions.py"
)
node = next(n for n in ast.parse(source.read_text()).body if isinstance(n, ast.FunctionDef))


class PermissionMigrationTests(unittest.TestCase):
	def setUp(self):
		self.created = []

		def get_doc(values):
			self.created.append(values)
			return types.SimpleNamespace(insert=Mock())

		self.frappe = types.SimpleNamespace(
			db=types.SimpleNamespace(exists=Mock(return_value=True), set_value=Mock()),
			get_all=Mock(return_value=[]),
			get_doc=get_doc,
			clear_cache=Mock(),
		)
		self.context = {"frappe": self.frappe}
		exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), self.context)

	def test_existing_custom_permissions_get_unrestricted_rows_for_supported_roles(self):
		self.context["execute"]()
		self.assertEqual(
			{row["role"] for row in self.created}, {"System Manager", "Purchase Manager", "Purchase User"}
		)
		for row in self.created:
			self.assertEqual((row["read"], row["write"], row["create"], row["if_owner"]), (1, 1, 1, 0))
			self.assertEqual(row["delete"], int(row["role"] == "System Manager"))
			self.assertEqual(row["share"], int(row["role"] == "System Manager"))

	def test_existing_unrestricted_rule_is_updated_without_creating_duplicates(self):
		self.frappe.get_all.return_value = ["PERM-1"]
		self.context["execute"]()
		self.assertEqual(self.created, [])
		self.assertEqual(self.frappe.db.set_value.call_count, 3)
		for call in self.frappe.get_all.call_args_list:
			self.assertEqual(call.kwargs["filters"]["if_owner"], 0)

	def test_absent_doctype_does_not_create_permissions(self):
		self.frappe.db.exists.return_value = False
		self.context["execute"]()
		self.frappe.get_all.assert_not_called()
