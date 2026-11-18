"""Authenticated form pricing context exposes units/quantities, not rule internals."""

import ast
import math
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

source = Path(__file__).resolve().parents[1] / "erpnext_ui/supplier_quotation.py"
node = next(
	n
	for n in ast.parse(source.read_text()).body
	if isinstance(n, ast.FunctionDef) and n.name == "_supplier_pricing_context"
)
context = {"math": math, "flt": lambda value: float(value or 0)}
exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), context)


class PricingContextTests(unittest.TestCase):
	def render(self, mode="Formula", enabled=True, failure=False):
		module = types.ModuleType("erpnext_ui.uom_pricing")
		module.get_item_pricing = Mock(
			return_value={
				"enabled": enabled,
				"pricing_uom": "Kg",
				"formula_mode": mode,
				"rule": {"formula_expression": "private formula"},
				"params_by_symbol": {"density": 7850},
			}
		)
		module.calculate_chargeable_quantity = Mock(
			side_effect=ValueError("broken") if failure else None, return_value=2
		)
		item = types.SimpleNamespace(item_code="PLATE", qty=10, get=lambda key: None)
		with patch.dict(sys.modules, {"erpnext_ui.uom_pricing": module}):
			return context["_supplier_pricing_context"](item)

	def test_baseline_is_line_total_and_only_projection_is_returned(self):
		result = self.render()
		self.assertEqual(result["calculated_chargeable_qty"], 20)
		self.assertEqual(result["pricing_uom"], "Kg")
		self.assertNotIn("rule", result)
		self.assertNotIn("params_by_symbol", result)

	def test_direct_entry_does_not_invent_measurement(self):
		self.assertIsNone(self.render(mode="Direct Entry")["calculated_chargeable_qty"])

	def test_disabled_feature_stays_standard(self):
		self.assertEqual(self.render(enabled=False), {"enabled": False})

	def test_formula_error_is_visible_without_exposing_internals(self):
		result = self.render(failure=True)
		self.assertIn("error", result)
		self.assertNotIn("private", result["error"])
