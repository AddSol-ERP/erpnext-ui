"""Prints keep compact configured symbols, units and frozen values."""

import unittest

from erpnext_ui.print_dimensions import pricing_dimensions


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
