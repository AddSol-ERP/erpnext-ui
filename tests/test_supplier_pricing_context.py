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


class RateFieldEditabilityTests(unittest.TestCase):
	def fields(self, enabled):
		node = next(
			n
			for n in ast.parse(source.read_text()).body
			if isinstance(n, ast.FunctionDef) and n.name == "_supplier_item_fields"
		)
		namespace = {
			"_field_payload": lambda field, value, editable: {
				"fieldname": field.fieldname,
				"mandatory": True,
				"value": value,
			}
		}
		exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), namespace)
		fields = [
			types.SimpleNamespace(fieldname=name)
			for name in ("rate", "custom_rate_per_pricing_uom", "supplier_remark")
		]
		result = namespace["_supplier_item_fields"](fields, {"rate": 0}, {"enabled": enabled})
		return {field["fieldname"]: field for field in result}

	def test_pricing_uom_locks_native_rate_and_removes_its_required_flag(self):
		fields = self.fields(True)
		self.assertTrue(fields["rate"]["read_only"])
		self.assertFalse(fields["rate"]["mandatory"])
		self.assertNotIn("read_only", fields["custom_rate_per_pricing_uom"])
		self.assertTrue(fields["custom_rate_per_pricing_uom"]["mandatory"])

	def test_standard_item_locks_pricing_rate_and_keeps_native_rate_editable(self):
		fields = self.fields(False)
		self.assertTrue(fields["custom_rate_per_pricing_uom"]["read_only"])
		self.assertFalse(fields["custom_rate_per_pricing_uom"]["mandatory"])
		self.assertNotIn("read_only", fields["rate"])
		self.assertTrue(fields["rate"]["mandatory"])

	def test_other_supplier_fields_keep_buyer_configuration(self):
		for enabled in (True, False):
			fields = self.fields(enabled)
			self.assertNotIn("read_only", fields["supplier_remark"])
			self.assertTrue(fields["supplier_remark"]["mandatory"])


class GSTDiagnosticTests(unittest.TestCase):
	def test_failed_state_contains_tax_evidence_but_no_request_credentials(self):
		node = next(
			n
			for n in ast.parse(source.read_text()).body
			if isinstance(n, ast.FunctionDef) and n.name == "_supplier_gst_diagnostic"
		)
		namespace = {}
		exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), namespace)

		class Doc(dict):
			__getattr__ = dict.get

		doc = Doc(
			name="SQ-001",
			session="SECRET",
			token="SECRET",
			contact_email="PRIVATE",
			items=[{"idx": 1, "taxable_value": 1000, "cgst_rate": 9, "cgst_amount": 0, "token": "SECRET"}],
			taxes=[{"rate": 9, "gst_tax_type": "cgst", "tax_amount": 90, "secret": "SECRET"}],
		)
		result = namespace["_supplier_gst_diagnostic"](doc)
		self.assertEqual(result["items"][0]["taxable_value"], 1000)
		self.assertEqual(result["taxes"][0]["tax_amount"], 90)
		self.assertNotIn("SECRET", str(result))
		self.assertNotIn("PRIVATE", str(result))
