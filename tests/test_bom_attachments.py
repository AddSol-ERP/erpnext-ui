"""Row attachment scope cannot escape a permission-checked BOM parent."""

import ast
import types
import unittest
from pathlib import Path
from unittest.mock import Mock


class BomAttachmentTests(unittest.TestCase):
	def setUp(self):
		tree = ast.parse((Path(__file__).resolve().parents[1] / "erpnext_ui/ui_documents.py").read_text())
		functions = [
			node
			for node in tree.body
			if isinstance(node, ast.FunctionDef)
			and node.name in ("_validate_bom_item_scope", "list_document_attachments")
		]
		for node in functions:
			node.decorator_list = []
		self.frappe = types.SimpleNamespace(
			db=Mock(),
			has_permission=Mock(return_value=True),
			get_all=Mock(return_value=[]),
			throw=Mock(side_effect=PermissionError),
			PermissionError=PermissionError,
		)
		self.frappe.db.has_column.return_value = True
		self.frappe.db.exists.return_value = True
		self.ctx = {
			"frappe": self.frappe,
			"_": lambda x: x,
			"_attachment_types": Mock(return_value={"BOM_FILE": {}}),
		}
		exec(compile(ast.Module(body=functions, type_ignores=[]), "<attachments>", "exec"), self.ctx)

	def test_row_must_belong_to_requested_parent(self):
		self.ctx["_validate_bom_item_scope"]("BOM", "BOM-1", "ROW-1")
		self.frappe.db.exists.assert_called_once_with(
			"BOM Item", {"name": "ROW-1", "parent": "BOM-1", "parenttype": "BOM", "parentfield": "items"}
		)
		self.frappe.db.exists.return_value = False
		with self.assertRaises(PermissionError):
			self.ctx["_validate_bom_item_scope"]("BOM", "BOM-OTHER", "ROW-1")

	def test_non_bom_row_scope_rejected(self):
		with self.assertRaises(PermissionError):
			self.ctx["_validate_bom_item_scope"]("Purchase Order", "PO-1", "ROW-1")

	def test_missing_column_fails_closed_for_row_uploads(self):
		self.frappe.db.has_column.return_value = False
		with self.assertRaises(PermissionError):
			self.ctx["_validate_bom_item_scope"]("BOM", "BOM-1", "ROW-1")

	def test_list_is_scoped_to_row(self):
		self.ctx["list_document_attachments"]("BOM", "BOM-1", "ROW-1")
		self.assertEqual(self.frappe.get_all.call_args.kwargs["filters"]["ui_bom_item"], "ROW-1")

	def test_full_bom_files_are_separate_from_row_files(self):
		self.ctx["list_document_attachments"]("BOM", "BOM-1")
		self.assertEqual(self.frappe.get_all.call_args.kwargs["filters"]["ui_bom_item"], ["is", "not set"])

	def test_parent_read_denial_prevents_file_query(self):
		self.frappe.has_permission.return_value = False
		with self.assertRaises(PermissionError):
			self.ctx["list_document_attachments"]("BOM", "BOM-1", "ROW-1")
		self.frappe.get_all.assert_not_called()
