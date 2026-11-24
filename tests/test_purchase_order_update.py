"""Submitted PO pricing is calculated before ERPNext validates its update."""
import importlib
import json
import sys
import types
import unittest
from unittest.mock import Mock, patch

frappe = sys.modules.setdefault("frappe", types.ModuleType("frappe"))
if not hasattr(frappe, "whitelist"):
	frappe.whitelist = lambda **kwargs: lambda fn: fn
if not hasattr(frappe, "_"):
	frappe._ = lambda value: value
update = importlib.import_module("erpnext_ui.purchase_order_update")


class Doc(dict):
	__getattr__ = dict.get


class UpdateTests(unittest.TestCase):
	def test_actual_measure_scales_with_quantity_and_native_update_receives_derived_rate(self):
		row = Doc(name="ROW", item_code="SHEET", qty=10, custom_chargeable_qty=20, custom_rate_per_pricing_uom=80)
		order = Doc(name="PO", docstatus=1, items=[row], check_permission=Mock())
		state = {"enabled": True, "feature_enabled": True, "item_group": "Sheet", "params_by_symbol": {}, "rule": {"formula_mode": "Formula", "formula_expression": "2"}, "pricing_uom": "Kg", "tolerance_plus": 0, "tolerance_minus": 0}
		native = Mock()
		module = types.ModuleType("erpnext.controllers.accounts_controller")
		module.update_child_qty_rate = native
		db = Mock()
		with patch.dict(sys.modules, {"erpnext": types.ModuleType("erpnext"), "erpnext.controllers": types.ModuleType("erpnext.controllers"), "erpnext.controllers.accounts_controller": module}), patch.object(frappe, "get_doc", return_value=order, create=True), patch.object(frappe, "db", db, create=True), patch.object(frappe, "as_json", side_effect=json.dumps, create=True), patch.object(update, "preserved_contract", return_value=None), patch.object(update.uom_pricing, "get_item_pricing", return_value=state):
			update.update_items("PO", [{"docname": "ROW", "item_code": "SHEET", "qty": 5, "custom_rate_per_pricing_uom": 100}])
		payload = json.loads(native.call_args.args[1])
		self.assertEqual(payload[0]["rate"], 200)
		values = db.set_value.call_args.args[2]
		self.assertEqual(values["custom_chargeable_qty"], 10)
		self.assertEqual(values["custom_rate_per_pricing_uom"], 100)
		self.assertEqual(json.loads(values["custom_pricing_snapshot"])["chargeable_qty"], 10)

	def test_native_failure_does_not_write_custom_fields(self):
		row = Doc(name="ROW", item_code="SHEET", qty=10, custom_chargeable_qty=0, custom_rate_per_pricing_uom=80)
		order = Doc(name="PO", docstatus=1, items=[row], check_permission=Mock())
		state = {"enabled": True, "feature_enabled": True, "item_group": "Sheet", "params_by_symbol": {}, "rule": {"formula_mode": "Formula", "formula_expression": "2"}, "pricing_uom": "Kg", "tolerance_plus": 0, "tolerance_minus": 0}
		module = types.ModuleType("erpnext.controllers.accounts_controller")
		module.update_child_qty_rate = Mock(side_effect=ValueError("Native validation"))
		db = Mock()
		with patch.dict(sys.modules, {"erpnext": types.ModuleType("erpnext"), "erpnext.controllers": types.ModuleType("erpnext.controllers"), "erpnext.controllers.accounts_controller": module}), patch.object(frappe, "get_doc", return_value=order, create=True), patch.object(frappe, "db", db, create=True), patch.object(frappe, "as_json", side_effect=json.dumps, create=True), patch.object(update, "preserved_contract", return_value=None), patch.object(update.uom_pricing, "get_item_pricing", return_value=state), self.assertRaises(ValueError):
			update.update_items("PO", [{"docname": "ROW", "item_code": "SHEET", "qty": 10, "custom_rate_per_pricing_uom": 100}])
		db.set_value.assert_not_called()
