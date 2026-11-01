"""Pricing regression tests, runnable without a bench: python3 -m unittest discover -s tests."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

# The arithmetic module only imports frappe; isolate that dependency for local
# tests. Site-backed lifecycle tests still run through bench on deployment.
if "frappe" not in sys.modules:
	sys.modules["frappe"] = types.ModuleType("frappe")
from erpnext_ui import uom_pricing as pricing


def state(mode="Formula", expression="L * W / 1000000", params=None):
	return dict(
		rule=dict(formula_mode=mode, formula_expression=expression),
		params_by_symbol=params if params is not None else {"L": 2000, "W": 1000},
		enabled=True,
		pricing_uom="Square Metre",
		feature_enabled=True,
		item_group="Sheet",
		tolerance_plus=5,
		tolerance_minus=0,
	)


class PricingTests(unittest.TestCase):
	def calculate(self, config, measure=None):
		with patch.object(pricing, "get_item_pricing", return_value=config):
			return pricing.get_pricing_line("SHEET", 80, 10, "buying", chargeable_override=measure)

	def test_formula_and_blank_measurement(self):
		for blank in (None, "", "  "):
			line = self.calculate(state(), blank)
			self.assertEqual((line["chargeable_qty"], line["amount"], line["standard_rate"]), (20, 1600, 160))

	def test_measurement_is_line_total(self):
		self.assertEqual(self.calculate(state(), 19)["amount"], 1520)

	def test_broken_formula_never_becomes_piece_count(self):
		for expression in ("missing * L", "L / 0", "(", "L +", "L ** 2"):
			with self.subTest(expression=expression), self.assertRaises(ValueError):
				self.calculate(state(expression=expression))

	def test_direct_entry_requires_measurement(self):
		with self.assertRaises(ValueError):
			self.calculate(state(mode="Direct Entry"))
		self.assertEqual(self.calculate(state(mode="Direct Entry"), 15)["amount"], 1200)

	def test_invalid_measurement_and_disabled_rule(self):
		for value in (0, -1, float("nan"), float("inf"), "bad"):
			with self.subTest(value=value), self.assertRaises(ValueError):
				self.calculate(state(), value)
		with self.assertRaises(ValueError):
			self.calculate({**state(), "enabled": False})


class TransactionPricingTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		# Load the real helper without importing ERPNext's document controllers.
		import ast
		import json

		source = Path(__file__).resolve().parents[1] / "erpnext_ui/overrides.py"
		node = next(
			node
			for node in ast.parse(source.read_text()).body
			if isinstance(node, ast.FunctionDef) and node.name == "_apply_uom_pricing"
		)
		frappe = types.SimpleNamespace(as_json=json.dumps)
		namespace = {"frappe": frappe}
		exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), namespace)
		cls.apply = staticmethod(namespace["_apply_uom_pricing"])

	def document(self, rate=80, measurement=0):
		class Row(dict):
			__getattr__ = dict.get
			__setattr__ = dict.__setitem__

		row = Row(
			item_code="SHEET",
			qty=10,
			rate=1,
			amount=10,
			custom_rate_per_pricing_uom=rate,
			custom_chargeable_qty=measurement,
		)
		doc = Row(doctype="Purchase Receipt", items=[row], calculate_taxes_and_totals=lambda: None)
		return doc, row

	def run_pricing(self, doc, config=None):
		with (
			patch.object(pricing, "is_uom_pricing_enabled", return_value=True),
			patch.object(pricing, "get_item_pricing", return_value=config or state()),
		):
			self.apply(doc, "buying")

	def test_blank_float_zero_uses_formula(self):
		doc, row = self.document()
		self.run_pricing(doc)
		self.assertEqual((row.rate, row.amount), (160, 1600))
		self.assertEqual(row.custom_pricing_uom, "Square Metre")

	def test_missing_rate_and_invalid_formula_fail_save(self):
		for rate in (None, 0, -1):
			with self.subTest(rate=rate), self.assertRaises(ValueError):
				self.run_pricing(self.document(rate=rate)[0])
		with self.assertRaises(ValueError):
			self.run_pricing(self.document()[0], state(expression="missing"))

	def test_disabled_item_is_unchanged(self):
		doc, row = self.document()
		before = dict(row)
		self.run_pricing(doc, {**state(), "enabled": False})
		self.assertEqual(row, before)

	def test_zero_tolerance_side_is_unrestricted(self):
		doc, row = self.document(measurement=5)
		self.run_pricing(doc)
		self.assertEqual(row.amount, 400)
		with self.assertRaises(ValueError):
			self.run_pricing(self.document(measurement=25)[0])

	def test_tax_failure_is_not_silenced(self):
		doc, _ = self.document()

		def failed():
			raise RuntimeError("tax failed")

		doc.calculate_taxes_and_totals = failed
		with self.assertRaises(RuntimeError):
			self.run_pricing(doc)


if __name__ == "__main__":
	unittest.main()
