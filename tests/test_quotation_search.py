"""Verify filters preserve quotation permissions and correct parent pagination."""
import ast
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

source = Path(__file__).resolve().parents[1] / "erpnext_ui/quotation_comparison.py"
node = next(n for n in ast.parse(source.read_text()).body if isinstance(n, ast.FunctionDef) and n.name == "search_quotations")
node.decorator_list = []


class QuotationSearchTests(unittest.TestCase):
	def setUp(self):
		self.frappe = types.SimpleNamespace(
			has_permission=Mock(), get_list=Mock(return_value=[]), get_all=Mock(return_value=["SQ-1"]),
			get_meta=Mock(return_value=types.SimpleNamespace(get_field=lambda key: types.SimpleNamespace(permlevel=0))),
			throw=Mock(side_effect=ValueError),
		)
		self.ctx = {"frappe": self.frappe, "_": lambda value: value, "getdate": lambda value: value}
		exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), self.ctx)

	def test_child_filters_restrict_parent_permission_filtered_list(self):
		self.ctx["search_quotations"](project="P", material_request="MR", page=1)
		self.assertEqual(self.frappe.get_all.call_args.kwargs["filters"], {"project": "P", "material_request": "MR"})
		self.assertEqual(self.frappe.get_list.call_args.kwargs["filters"]["name"], ["in", ["SQ-1"]])
		self.assertEqual(self.frappe.get_list.call_args.kwargs["limit_start"], 20)
		self.frappe.has_permission.assert_called_once()

	def test_empty_child_matches_return_no_results(self):
		self.frappe.get_all.return_value = []
		self.assertEqual(self.ctx["search_quotations"](project="none"), {"quotations": [], "has_more": False})
		self.frappe.get_list.assert_not_called()

	def test_has_more_uses_extra_parent_row(self):
		self.frappe.get_list.return_value = list(range(21))
		result = self.ctx["search_quotations"](company="A")
		self.assertEqual(len(result["quotations"]), 20)
		self.assertTrue(result["has_more"])

	def test_invalid_dates_rejected(self):
		with self.assertRaises(ValueError):
			self.ctx["search_quotations"](date_from="2026-02-01", date_to="2026-01-01")
