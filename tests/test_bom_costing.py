"""Native costing remains authoritative except configured price-list UOM rates."""

import ast
import types
import unittest
from pathlib import Path
from unittest.mock import Mock


class Doc(dict):
	def __getattr__(self, key):
		return self.get(key)

	def __setattr__(self, key, value):
		self[key] = value

	def precision(self, key):
		return 2


class BomCostingTests(unittest.TestCase):
	def setUp(self):
		tree = ast.parse((Path(__file__).resolve().parents[1] / "erpnext_ui/bom_costing.py").read_text())
		functions = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.ClassDef))]
		self.frappe = types.SimpleNamespace(db=types.SimpleNamespace(get_value=Mock(return_value=0)))
		self.pricing = types.SimpleNamespace(
			get_item_pricing=Mock(return_value={"enabled": True, "pricing_uom": "Kg"}),
			get_pricing_line=Mock(return_value={"chargeable_qty": 25, "calculated_chargeable_qty": 25}),
		)
		self.native_rate = Mock(return_value=[("PRICE-1", 10, "Kg")])

		class NativeBOM(Doc):
			def calculate_rm_cost(inner, save=False):
				for row in inner.get("items"):
					row.rate = 5
					row.amount = row.qty * 5
					row.base_amount = row.amount * inner.conversion_rate

		self.ctx = {
			"frappe": self.frappe,
			"uom_pricing": self.pricing,
			"get_item_price": self.native_rate,
			"check_packing_list": Mock(return_value=True),
			"nowdate": lambda: "2026-11-20",
			"BOM": NativeBOM,
			"flt": lambda v, precision=None: (
				round(float(v or 0), precision) if precision is not None else float(v or 0)
			),
		}
		exec(compile(ast.Module(body=functions, type_ignores=[]), "<costing>", "exec"), self.ctx)
		self.doc = Doc(
			buying_price_list="Buying",
			rm_cost_as_per="Price List",
			company="ACME",
			conversion_rate=1,
			plc_conversion_rate=1,
		)
		self.row = Doc(item_code="PLATE", qty=2, conversion_factor=1, is_stock_item=1, rate=0)

	def test_price_in_pricing_uom_becomes_line_unit_rate(self):
		self.assertTrue(self.ctx["apply_pricing_uom"](self.doc, self.row))
		self.assertEqual(self.row.rate, 125)
		self.assertEqual(self.row.custom_rate_per_pricing_uom, 10)
		args = self.native_rate.call_args.args[0]
		self.assertEqual(args["uom"], "Kg")
		self.assertEqual(args["transaction_date"], "2026-11-20")

	def test_stock_conversion_and_currency_conversion(self):
		self.row.conversion_factor = 4
		self.doc.plc_conversion_rate = 2
		self.doc.conversion_rate = 5
		self.ctx["apply_pricing_uom"](self.doc, self.row)
		self.assertEqual(self.pricing.get_pricing_line.call_args.args[2], 8)
		self.assertEqual(self.row.rate, 50)

	def test_other_native_cost_methods_unchanged(self):
		for method in ["Valuation Rate", "Last Purchase Rate"]:
			self.doc.rm_cost_as_per = method
			self.assertFalse(self.ctx["apply_pricing_uom"](self.doc, self.row))
		self.native_rate.assert_not_called()

	def test_disabled_configuration_falls_back_to_native(self):
		self.pricing.get_item_pricing.return_value = {"enabled": False}
		self.assertFalse(self.ctx["apply_pricing_uom"](self.doc, self.row))
		self.native_rate.assert_not_called()

	def test_customer_supplied_and_subassembly_rates_unchanged(self):
		self.row.sourced_by_supplier = 1
		self.assertFalse(self.ctx["apply_pricing_uom"](self.doc, self.row))
		self.row.sourced_by_supplier = 0
		self.row.bom_no = "SUB-BOM"
		self.doc.set_rate_of_sub_assembly_item_based_on_bom = 1
		self.assertFalse(self.ctx["apply_pricing_uom"](self.doc, self.row))

	def test_measured_quantity_forwarded_for_direct_entry(self):
		self.row.custom_chargeable_qty = 27
		self.ctx["apply_pricing_uom"](self.doc, self.row)
		self.assertEqual(self.pricing.get_pricing_line.call_args.kwargs["chargeable_override"], 27)

	def test_native_save_costs_use_final_uom_rate(self):
		doc = self.ctx["UomPricingBOM"](**self.doc)
		doc["items"] = [self.row]
		doc.calculate_rm_cost()
		self.assertEqual(self.row.amount, 250)
		self.assertEqual(doc.raw_material_cost, 250)
		self.assertEqual(doc.base_raw_material_cost, 250)

	def test_wrong_or_missing_pricing_uom_price_is_rejected(self):
		self.frappe.throw = Mock(side_effect=ValueError)
		for prices in [[], [("PRICE-2", 100, "Nos")], [("PRICE-3", 100, "")]]:
			self.native_rate.return_value = prices
			with self.assertRaises(ValueError):
				self.ctx["apply_pricing_uom"](self.doc, self.row)

	def test_preview_refuses_arbitrary_doctype(self):
		self.frappe.parse_json = lambda value: value
		self.frappe.throw = Mock(side_effect=ValueError)
		with self.assertRaises(ValueError):
			self.ctx["preview_material_rates"]({"doctype": "User"})

	def test_preview_requires_write_on_existing_bom(self):
		self.frappe.parse_json = lambda value: value
		stored = Mock()
		stored.check_permission.side_effect = PermissionError
		self.frappe.get_doc = Mock(return_value=stored)
		with self.assertRaises(PermissionError):
			self.ctx["preview_material_rates"]({"doctype": "BOM", "name": "BOM-1"})
		stored.check_permission.assert_called_once_with("write")
