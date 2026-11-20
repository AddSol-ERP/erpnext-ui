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

class SnapshotTests(unittest.TestCase):
	def setUp(self):
		import json
		n = next(n for n in ast.parse(source.read_text()).body if isinstance(n, ast.FunctionDef) and n.name == "save_evaluation")
		n.decorator_list = []
		self.source = {"company": "C", "company_currency": "USD", "quotations": [{"name": "SQ-1", "rate": 10}, {"name": "SQ-2", "rate": 20}]}
		self.log = types.SimpleNamespace(request_content=json.dumps(self.source), response_content="Summary", check_permission=Mock())
		self.saved = []
		class Doc:
			name = "QEV-1"
			def insert(inner): self.saved.append(inner.data)
		def get_doc(value, name=None):
			if isinstance(value, dict):
				doc = Doc()
				doc.data = value
				return doc
			return self.log
		self.frappe = types.SimpleNamespace(has_permission=Mock(), get_doc=get_doc, parse_json=json.loads,
			as_json=lambda value: json.dumps(value, default=str), flags=types.SimpleNamespace(),
			db=types.SimpleNamespace(get_value=lambda *args: "timestamp"), throw=Mock(side_effect=ValueError))
		import copy
		self.ctx = {"frappe": self.frappe, "json": json, "_": lambda x: x, "nowdate": lambda: "2026-11-20", "compare_quotations": lambda names: copy.deepcopy(self.source)}
		exec(compile(ast.Module(body=[n], type_ignores=[]), str(source), "exec"), self.ctx)

	def test_save_links_matching_ai_response(self):
		self.assertEqual(self.ctx["save_evaluation"](["SQ-1", "SQ-2"], "QAI-1"), {"name": "QEV-1"})
		self.assertEqual(self.saved[0]["ai_analysis"], "Summary")
		self.assertEqual(self.saved[0]["ai_request"], "QAI-1")
		self.log.check_permission.assert_called_once_with("read")

	def test_changed_quotation_rejects_stale_analysis(self):
		self.source["quotations"][0]["rate"] = 999
		with self.assertRaises(ValueError):
			self.ctx["save_evaluation"](["SQ-1", "SQ-2"], "QAI-1")
		self.assertEqual(self.saved, [])

class SavedComparisonTests(unittest.TestCase):
	def setUp(self):
		import json
		nodes = [n for n in ast.parse(source.read_text()).body if isinstance(n, ast.FunctionDef) and n.name in ("list_evaluations", "get_evaluation")]
		for node in nodes:
			node.decorator_list = []
		self.allowed = types.SimpleNamespace(name="QEV-1", company="C", evaluation_date="2026-01-01", quotation_names='["SQ-1"]', snapshot=json.dumps({"quotations": [{"name": "SQ-1", "supplier": "Supplier"}]}), ai_analysis="Saved analysis", ai_request="QAI-1", has_permission=Mock(return_value=True), check_permission=Mock())
		self.denied = types.SimpleNamespace(name="QEV-2", has_permission=Mock(return_value=False))
		self.frappe = types.SimpleNamespace(has_permission=Mock(), session=types.SimpleNamespace(user="buyer"), get_all=Mock(return_value=["QEV-1", "QEV-2"]), get_doc=lambda doctype, name: self.allowed if name == "QEV-1" else self.denied, parse_json=json.loads)
		self.ctx = {"frappe": self.frappe}
		exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), self.ctx)

	def test_list_only_includes_authorized_snapshots(self):
		result = self.ctx["list_evaluations"]()
		self.assertEqual([row["name"] for row in result["entries"]], ["QEV-1"])
		self.assertEqual(result["entries"][0]["suppliers"], ["Supplier"])
		self.assertNotIn("owner", self.frappe.get_all.call_args.kwargs.get("filters", {}))

	def test_list_provides_next_position_without_skipping_the_next_record(self):
		names = [f"QEV-{index}" for index in range(21)]
		self.frappe.get_all.return_value = names
		self.frappe.get_doc = lambda doctype, name: types.SimpleNamespace(
			name=name, company="C", evaluation_date="2026-01-01", quotation_names='["SQ-1"]',
			snapshot='{"quotations": []}', ai_analysis=None, has_permission=lambda permission: True)
		result = self.ctx["list_evaluations"]()
		self.assertEqual(len(result["entries"]), 20)
		self.assertEqual(result["next_start"], 20)

	def test_open_checks_permission_and_returns_saved_values(self):
		result = self.ctx["get_evaluation"]("QEV-1")
		self.allowed.check_permission.assert_called_once_with("read")
		self.assertEqual(result["analysis"], "Saved analysis")
		self.assertEqual(result["snapshot"]["quotations"][0]["name"], "SQ-1")
