"""Desk list conditions must enforce the same source checks as document reads."""

import ast
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

source = (
	Path(__file__).resolve().parents[1]
	/ "erpnext_ui/addsol_erpnext_ui/doctype/ui_quotation_evaluation/ui_quotation_evaluation.py"
)
nodes = [
	n
	for n in ast.parse(source.read_text()).body
	if isinstance(n, ast.FunctionDef)
	and n.name in ("has_permission", "permission_query_conditions", "ai_request_query_conditions")
]


class DeskPermissionTests(unittest.TestCase):
	def setUp(self):
		self.docs = {
			"allowed": types.SimpleNamespace(
				doctype="UI Quotation Evaluation",
				owner="other-buyer",
				quotation_names='["SQ-A"]',
				company="C",
			),
			"denied": types.SimpleNamespace(
				doctype="UI Quotation Evaluation",
				owner="other-buyer",
				quotation_names='["SQ-B"]',
				company="C",
			),
		}
		self.frappe = types.SimpleNamespace(
			session=types.SimpleNamespace(user="buyer"),
			get_roles=Mock(return_value=["Purchase User"]),
			get_all=Mock(return_value=["allowed", "denied"]),
			get_doc=lambda dt, name: self.docs[name] if dt == "UI Quotation Evaluation" else name,
			parse_json=__import__("json").loads,
			has_permission=lambda dt, ptype, doc, user: doc != "SQ-B",
			db=types.SimpleNamespace(escape=lambda value: "'" + value.replace("'", "''") + "'"),
		)
		self.ctx = {"frappe": self.frappe}
		exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), self.ctx)

	def test_list_only_includes_records_with_readable_sources(self):
		condition = self.ctx["permission_query_conditions"]("buyer")
		self.assertIn("'allowed'", condition)
		self.assertNotIn("denied", condition)
		self.assertNotIn("owner", self.frappe.get_all.call_args.kwargs.get("filters", {}))

	def test_permission_failure_fails_closed(self):
		self.frappe.get_all.side_effect = RuntimeError("unavailable")
		self.assertEqual(self.ctx["permission_query_conditions"]("buyer"), "1=0")

	def test_ai_request_list_remains_hidden(self):
		self.assertEqual(self.ctx["ai_request_query_conditions"]("buyer"), "1=0")

	def test_purchase_roles_read_other_buyers_comparisons(self):
		for role in ("Purchase Manager", "Purchase User"):
			self.frappe.get_roles.return_value = [role]
			self.assertTrue(self.ctx["has_permission"](self.docs["allowed"], "read", "buyer"))
			self.assertTrue(self.ctx["has_permission"](self.docs["allowed"], "write", "buyer"))
			self.assertFalse(self.ctx["has_permission"](self.docs["allowed"], "delete", "buyer"))

	def test_unrelated_role_cannot_read_comparison(self):
		self.frappe.get_roles.return_value = ["Employee"]
		self.assertFalse(self.ctx["has_permission"](self.docs["allowed"], "read", "buyer"))

	def test_company_or_source_restrictions_still_apply_to_buyers(self):
		self.assertFalse(self.ctx["has_permission"](self.docs["denied"], "read", "buyer"))
		self.frappe.has_permission = lambda *args, **kwargs: False
		self.assertFalse(self.ctx["has_permission"](self.docs["allowed"], "read", "buyer"))

	def test_system_manager_has_full_comparison_access(self):
		self.frappe.get_roles.return_value = ["System Manager"]
		for action in ("read", "write", "create", "delete", "share"):
			self.assertTrue(self.ctx["has_permission"](self.docs["denied"], action, "manager"))

	def test_administrator_has_full_comparison_access(self):
		self.assertTrue(self.ctx["has_permission"](self.docs["denied"], "delete", "Administrator"))

	def test_raw_ai_request_ownership_is_not_widened(self):
		doc = types.SimpleNamespace(
			doctype="UI Quotation AI Request", owner="other", quotation_names='["SQ-A"]', company="C"
		)
		self.assertFalse(self.ctx["has_permission"](doc, "read", "buyer"))

	def test_permission_resolution_failure_fails_closed(self):
		self.frappe.get_roles.side_effect = RuntimeError("unavailable")
		self.assertFalse(self.ctx["has_permission"](self.docs["allowed"], "read", "buyer"))


class SnapshotEditTests(unittest.TestCase):
	def setUp(self):
		controller = next(n for n in ast.parse(source.read_text()).body if isinstance(n, ast.ClassDef))

		class Doc(dict):
			def is_new(self):
				return self.get("new", False)

			def get_doc_before_save(self):
				return self.original

		self.frappe = types.SimpleNamespace(flags={}, throw=Mock(side_effect=ValueError))
		ctx = {"frappe": self.frappe, "Document": Doc}
		exec(compile(ast.Module(body=[controller], type_ignores=[]), str(source), "exec"), ctx)
		self.document = ctx["UIQuotationEvaluation"]

	def test_notes_can_be_edited_without_creation_flag(self):
		doc = self.document(snapshot="original", notes="new decision")
		doc.original = {"snapshot": "original", "notes": "old decision"}
		doc.validate()

	def test_snapshot_edits_are_rejected(self):
		doc = self.document(snapshot="forged")
		doc.original = {"snapshot": "original"}
		with self.assertRaises(ValueError):
			doc.validate()

	def test_direct_snapshot_creation_remains_rejected(self):
		with self.assertRaises(ValueError):
			self.document(new=True).validate()

	def test_service_can_create_snapshot(self):
		self.frappe.flags["creating_quotation_evaluation"] = True
		self.document(new=True).validate()
