"""Prints keep compact configured symbols, units and frozen values."""

import unittest

from erpnext_ui.print_dimensions import pricing_dimensions


class DimensionTests(unittest.TestCase):
	def test_mixed_units_short_symbols_and_order(self):
		snapshot = dict(
			rule=dict(
				params=[
					dict(symbol="T", label="Thickness", uom="mm", display_order=3),
					dict(symbol="L", label="Length", uom="m", display_order=1),
					dict(symbol="W", label="Width", uom="mm", display_order=2),
				]
			),
			params_by_symbol=dict(L=2, W=1250, T=10),
		)
		self.assertEqual(
			pricing_dimensions(dict(custom_pricing_snapshot=snapshot)),
			"L 2 m \u00d7 W 1250 mm \u00d7 T 10 mm",
		)

	def test_arbitrary_parameter_symbols_and_item_unit_override(self):
		snapshot = dict(
			rule=dict(params=[dict(symbol="D", label="Diameter", uom="mm")]),
			params_by_symbol=dict(D=0.5),
			parameter_uoms=dict(D="m"),
		)
		self.assertEqual(pricing_dimensions(dict(custom_pricing_snapshot=snapshot)), "D 0.5 m")

	def test_no_live_lookup_and_no_invented_unit_or_missing_value(self):
		snapshot = dict(
			rule=dict(params=[dict(symbol="D", label="Diameter"), dict(symbol="X", label="Missing")]),
			params_by_symbol=dict(D=0),
		)
		self.assertEqual(pricing_dimensions(dict(custom_pricing_snapshot=snapshot)), "D 0")
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
		self.assertEqual(pricing_dimensions(dict(custom_pricing_snapshot=snapshot)), "L 2000 mm")

	def test_explicit_legacy_item_geometry_overrides_pricing_parameters(self):
		snapshot = dict(
			display_dimensions="L 3000 mm \u00d7 W 1500 mm \u00d7 T 10 mm",
			params_by_symbol={"F": 0.1},
			rule={"params": [{"symbol": "F", "label": "Factor"}]},
		)
		self.assertEqual(
			pricing_dimensions({"custom_pricing_snapshot": snapshot}), snapshot["display_dimensions"]
		)
