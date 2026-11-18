"""Prints keep compact configured symbols, units and frozen values."""

import sys
import types
import unittest
from unittest.mock import Mock, patch

from erpnext_ui.print_dimensions import (
	item_pricing_dimensions,
	pricing_dimensions,
	set_material_request_dimensions,
)


class DimensionTests(unittest.TestCase):
	def test_mixed_units_short_symbols_and_order(self):
		snapshot = dict(
			rule=dict(
				params=[
					dict(symbol="T", label="Thickness", is_dimension=1, uom="mm", display_order=3),
					dict(symbol="L", label="Length", is_dimension=1, uom="m", display_order=1),
					dict(symbol="W", label="Width", is_dimension=1, uom="mm", display_order=2),
				]
			),
			params_by_symbol=dict(L=2, W=1250, T=10),
		)
		self.assertEqual(
			pricing_dimensions(dict(custom_pricing_snapshot=snapshot)),
			"2 m \u00d7 1250 mm \u00d7 10 mm",
		)

	def test_arbitrary_parameter_symbols_and_item_unit_override(self):
		snapshot = dict(
			rule=dict(params=[dict(symbol="D", label="Diameter", is_dimension=1, uom="mm")]),
			params_by_symbol=dict(D=0.5),
			parameter_uoms=dict(D="m"),
		)
		self.assertEqual(pricing_dimensions(dict(custom_pricing_snapshot=snapshot)), "0.5 m")

	def test_no_live_lookup_and_no_invented_unit_or_missing_value(self):
		snapshot = dict(
			rule=dict(
				params=[dict(symbol="D", label="Diameter", is_dimension=1), dict(symbol="X", label="Missing")]
			),
			params_by_symbol=dict(D=0),
		)
		self.assertEqual(pricing_dimensions(dict(custom_pricing_snapshot=snapshot)), "0")
		self.assertEqual(pricing_dimensions({}), "")

	def test_legacy_internal_calibration_constant_is_not_printed(self):
		snapshot = dict(
			rule=dict(
				params=[
					dict(symbol="L", data_source="custom_length_mm", uom="mm"),
					dict(symbol="F", data_source=""),
				]
			),
			params_by_symbol=dict(L=2000, F=0.000003),
		)
		self.assertEqual(pricing_dimensions(dict(custom_pricing_snapshot=snapshot)), "2000 mm")

	def test_explicit_legacy_item_geometry_overrides_pricing_parameters(self):
		snapshot = dict(
			display_dimensions="3000 mm \u00d7 1500 mm \u00d7 10 mm",
			params_by_symbol={"F": 0.1},
			rule={"params": [{"symbol": "F", "label": "Factor"}]},
		)
		self.assertEqual(
			pricing_dimensions({"custom_pricing_snapshot": snapshot}), snapshot["display_dimensions"]
		)

	def test_calculation_parameters_are_excluded_even_with_label_and_uom(self):
		snapshot = dict(
			rule=dict(
				params=[
					dict(symbol="L", label="Length", uom="mm", is_dimension=1),
					dict(symbol="D", label="Density", uom="Kg", is_dimension=0),
					dict(symbol="MF", label="Multiplier", uom="mm"),
				]
			),
			params_by_symbol=dict(L=3000, D=7.85, MF=2),
		)
		self.assertEqual(pricing_dimensions(dict(custom_pricing_snapshot=snapshot)), "3000 mm")

	def test_old_snapshots_recognize_known_geometry_only_and_respect_explicit_off(self):
		snapshot = dict(
			rule=dict(
				params=[
					dict(symbol="X", data_source="custom_width_mm", uom="mm"),
					dict(symbol="T", data_source="thickness_mm", uom="mm", is_dimension=0),
				]
			),
			params_by_symbol=dict(X=1500, T=10),
		)
		self.assertEqual(pricing_dimensions(dict(custom_pricing_snapshot=snapshot)), "1500 mm")


class LiveItemDimensionsTests(unittest.TestCase):
	def render(self, state, denied=False):
		frappe = types.ModuleType("frappe")
		frappe.has_permission = Mock(side_effect=PermissionError("Item read denied") if denied else None)
		pricing = types.ModuleType("erpnext_ui.uom_pricing")
		pricing.get_item_pricing = Mock(return_value=state)
		with patch.dict(sys.modules, {"frappe": frappe, "erpnext_ui.uom_pricing": pricing}):
			result = item_pricing_dimensions("ITEM-001")
		frappe.has_permission.assert_called_once_with("Item", "read", doc="ITEM-001", throw=True)
		pricing.get_item_pricing.assert_called_once_with("ITEM-001", "buying")
		return result

	def test_uses_configured_dimensions_order_and_item_parameter_units(self):
		self.assertEqual(
			self.render(
				{
					"pricing_uom": "Kg",
					"rule": {
						"params": [
							{
								"symbol": "W",
								"label": "Width",
								"is_dimension": 1,
								"uom": "mm",
								"display_order": 2,
							},
							{
								"symbol": "L",
								"label": "Length",
								"is_dimension": 1,
								"uom": "mm",
								"display_order": 1,
							},
							{"symbol": "DENS", "label": "Density", "is_dimension": 0, "uom": "kg/m3"},
						]
					},
					"params_by_symbol": {"W": 1500, "L": 3, "DENS": 7850},
					"parameter_uoms": {"L": "m"},
				}
			),
			"3 m \u00d7 1500 mm",
		)

	def test_no_rule_or_pricing_uom_returns_blank(self):
		for state in ({}, {"rule": {"params": []}}, {"pricing_uom": "Kg"}):
			with self.subTest(state=state):
				self.assertEqual(self.render(state), "")

	def test_does_not_require_a_rate_or_enabled_transaction_pricing(self):
		self.assertEqual(
			self.render(
				{
					"enabled": False,
					"pricing_uom": "Kg",
					"rule": {
						"params": [
							{"symbol": "X", "label": "Size", "is_dimension": 1, "uom": "mm"},
						]
					},
					"params_by_symbol": {"X": 40},
				}
			),
			"40 mm",
		)

	def test_denied_item_read_is_not_silently_bypassed(self):
		with self.assertRaises(PermissionError):
			self.render({}, denied=True)

	def test_blank_item_returns_blank(self):
		self.assertEqual(item_pricing_dimensions(None), "")


class MaterialRequestDimensionsTests(unittest.TestCase):
	def test_unpriced_request_gets_saved_dimensions_for_all_purposes(self):
		class Row(dict):
			__getattr__ = dict.get
			__setattr__ = dict.__setitem__

		pricing = types.ModuleType("erpnext_ui.uom_pricing")
		pricing.get_item_pricing = Mock(
			return_value={
				"enabled": False,
				"pricing_uom": "Kg",
				"rule": {
					"params": [
						{"symbol": "T", "label": "Thickness", "is_dimension": 1, "uom": "mm"},
						{"symbol": "D", "label": "Density", "is_dimension": 0, "uom": "kg/m3"},
					]
				},
				"params_by_symbol": {"T": 5, "D": 7850},
			}
		)
		for purpose in ("Purchase", "Material Transfer", "Manufacture", "Material Issue"):
			row = Row(item_code="PLATE", qty=3, rate=0, amount=0, custom_rate_per_pricing_uom=0)
			with patch.dict(sys.modules, {"erpnext_ui.uom_pricing": pricing}):
				set_material_request_dimensions({"material_request_type": purpose, "items": [row]})
			self.assertEqual(row.custom_pricing_dimensions, "5 mm")
			self.assertEqual((row.rate, row.amount, row.custom_rate_per_pricing_uom), (0, 0, 0))
			self.assertNotIn("custom_chargeable_qty", row)

	def test_removed_item_or_missing_rule_clears_old_dimensions(self):
		class Row(dict):
			__getattr__ = dict.get
			__setattr__ = dict.__setitem__

		pricing = types.ModuleType("erpnext_ui.uom_pricing")
		pricing.get_item_pricing = Mock(return_value={"rule": None, "pricing_uom": None})
		rows = [
			Row(item_code="OTHER", custom_pricing_dimensions="5 mm"),
			Row(custom_pricing_dimensions="old"),
		]
		with patch.dict(sys.modules, {"erpnext_ui.uom_pricing": pricing}):
			set_material_request_dimensions({"items": rows})
		self.assertTrue(all(row.custom_pricing_dimensions == "" for row in rows))

	def test_material_request_validate_populates_dimensions_after_native_validation(self):
		import ast
		from pathlib import Path

		tree = ast.parse((Path(__file__).resolve().parents[1] / "erpnext_ui/overrides.py").read_text())
		controller = next(
			node
			for node in tree.body
			if isinstance(node, ast.ClassDef) and node.name == "UomPricingMaterialRequest"
		)
		events = []

		class Native:
			def validate(self):
				events.append("native")

		context = {
			"MaterialRequest": Native,
			"_apply_uom_pricing": lambda doc, side: events.append("pricing"),
		}
		exec(compile(ast.Module(body=[controller], type_ignores=[]), "overrides.py", "exec"), context)
		with patch(
			"erpnext_ui.print_dimensions.set_material_request_dimensions",
			side_effect=lambda doc: events.append("dimensions"),
		):
			context["UomPricingMaterialRequest"]().validate()
		self.assertEqual(events, ["native", "pricing", "dimensions"])
