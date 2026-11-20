"""Desk list conditions must enforce the same source checks as document reads."""
import ast
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

source = Path(__file__).resolve().parents[1] / "erpnext_ui/addsol_erpnext_ui/doctype/ui_quotation_evaluation/ui_quotation_evaluation.py"
nodes = [n for n in ast.parse(source.read_text()).body if isinstance(n, ast.FunctionDef) and n.name in ("has_permission", "permission_query_conditions", "ai_request_query_conditions")]


class DeskPermissionTests(unittest.TestCase):
	def setUp(self):
		self.docs = {"allowed": types.SimpleNamespace(owner="buyer", quotation_names='["SQ-A"]', company="C"), "denied": types.SimpleNamespace(owner="buyer", quotation_names='["SQ-B"]', company="C")}
		self.frappe = types.SimpleNamespace(
			session=types.SimpleNamespace(user="buyer"),
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
		self.assertEqual(self.frappe.get_all.call_args.kwargs["filters"], {"owner": "buyer"})

	def test_permission_failure_fails_closed(self):
		self.frappe.get_all.side_effect = RuntimeError("unavailable")
		self.assertEqual(self.ctx["permission_query_conditions"]("buyer"), "1=0")

	def test_ai_request_list_remains_hidden(self):
		self.assertEqual(self.ctx["ai_request_query_conditions"]("buyer"), "1=0")
