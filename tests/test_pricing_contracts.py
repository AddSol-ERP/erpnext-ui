"""Historical contracts come from persisted rows, not client JSON."""

import json
import sys
import types
import unittest
from unittest.mock import Mock, patch

sys.modules.setdefault("frappe", types.ModuleType("frappe"))
from erpnext_ui import pricing_contracts as contracts
from erpnext_ui import uom_pricing


class Doc(dict):
	__getattr__ = dict.get


def snapshot():
	return dict(
		preserve_contract=True, pricing_uom="Kg", rule=dict(formula_mode="Direct Entry"), params_by_symbol={}
	)


class ContractTests(unittest.TestCase):
	def source(self):
		return Doc(
			item_code="PLATE",
			qty=10,
			custom_chargeable_qty=300,
			custom_rate_per_pricing_uom=40,
			custom_pricing_snapshot=json.dumps(snapshot()),
		)

	def test_client_snapshot_cannot_create_preserved_contract(self):
		database = Mock()
		database.get_value.return_value = None
		with patch.object(contracts.frappe, "db", database, create=True):
			self.assertIsNone(
				contracts.preserved_contract(
					Doc(doctype="Purchase Receipt"),
					Doc(item_code="PLATE", custom_pricing_snapshot=json.dumps(snapshot())),
				)
			)
			database.get_value.assert_not_called()

	def test_submitted_source_is_used_and_item_must_match(self):
		database = Mock()
		database.get_value.return_value = self.source()
		with patch.object(contracts.frappe, "db", database, create=True):
			doc = Doc(doctype="Purchase Receipt")
			row = Doc(item_code="PLATE", purchase_order_item="PO-ROW")
			result = contracts.preserved_contract(doc, row)
			self.assertTrue(result["linked"])
			self.assertEqual(database.get_value.call_args.args[1], {"name": "PO-ROW", "docstatus": 1})
			row["item_code"] = "OTHER"
			self.assertIsNone(contracts.preserved_contract(doc, row))

	def test_partial_receipt_scales_copied_total_and_preserves_explicit_measure(self):
		contract = dict(source=self.source(), linked=True, snapshot=snapshot())
		for copied in (None, 0, 300):
			self.assertEqual(
				contracts.contract_measure(contract, Doc(qty=4, custom_chargeable_qty=copied)), 120
			)
		self.assertEqual(contracts.contract_measure(contract, Doc(qty=4, custom_chargeable_qty=125)), 125)

	def test_old_order_prices_in_kg_when_current_item_rule_is_different(self):
		contract = dict(source=self.source(), linked=True, snapshot=snapshot())
		with patch.object(
			uom_pricing, "get_item_pricing", side_effect=AssertionError("Live rule must not run")
		):
			priced = uom_pricing.get_pricing_line(
				"PLATE",
				40,
				4,
				"buying",
				chargeable_override=120,
				pricing_state=contracts.contract_state(contract),
			)
		self.assertEqual(priced["pricing_uom"], "Kg")
		self.assertEqual(priced["amount"], 4800)
		self.assertEqual(priced["standard_rate"], 1200)
