"""Enabled-rule uniqueness and migration conflict regression tests."""

import ast
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

if "frappe" not in sys.modules:
	sys.modules["frappe"] = types.ModuleType("frappe")
from erpnext_ui import uom_pricing as pricing
from erpnext_ui.patches.v1_0.migrate_item_naming_to_pricing_rule import plan_migration


class SingleRuleTests(unittest.TestCase):
	def check(self, names, exclude=None, lock=False):
		db = Mock()
		db.sql.side_effect = [[], [(name,) for name in names]]
		with (
			patch.object(pricing.frappe, "get_all", return_value=names, create=True) as query,
			patch.object(pricing.frappe, "db", db, create=True),
		):
			pricing.validate_single_enabled_rule("Plate", exclude, lock)
		return db, query

	def test_zero_or_one_rule_can_be_resolved(self):
		self.check([])
		self.check(["Plate-Kg"])

	def test_existing_multiple_rules_are_rejected_at_read(self):
		with self.assertRaisesRegex(ValueError, "Only one rule"):
			self.check(["Plate-Kg", "Plate-Square Metre"])

	def test_enabling_another_uom_is_rejected(self):
		with self.assertRaisesRegex(ValueError, "Plate-Kg"):
			self.check(["Plate-Kg"], "Plate-Square Metre", lock=True)

	def test_updating_same_rule_excludes_itself_and_locks_common_group(self):
		db, query = self.check([], "Plate-Kg", lock=True)
		self.assertEqual(
			db.sql.call_args_list[0].args,
			("select name from `tabItem Group` where name=%s for update", ("Plate",)),
		)
		self.assertIn("name!=%s", db.sql.call_args_list[1].args[0])
		self.assertTrue(db.sql.call_args_list[1].args[0].endswith("for update"))
		self.assertEqual(db.sql.call_args_list[1].args[1], ("Plate", "Plate-Kg"))
		query.assert_not_called()

	def test_duplicate_lookup_never_selects_first(self):
		meta = Mock()
		with (
			patch.object(pricing.frappe, "get_all", return_value=["A", "B"], create=True),
			patch.object(pricing.frappe, "get_meta", return_value=meta, create=True),
			self.assertRaises(ValueError),
		):
			pricing.get_pricing_rule("Plate")

	def test_disabling_rule_does_not_check_uniqueness(self):
		# Execute the controller's real validation method without importing Document.
		path = (
			Path(__file__).resolve().parents[1]
			/ "erpnext_ui/addsol_erpnext_ui/doctype/ui_uom_pricing_rule/ui_uom_pricing_rule.py"
		)
		controller = next(node for node in ast.parse(path.read_text()).body if isinstance(node, ast.ClassDef))
		method = next(
			node
			for node in controller.body
			if isinstance(node, ast.FunctionDef) and node.name == "validate_rule"
		)
		namespace = {}
		exec(compile(ast.Module(body=[method], type_ignores=[]), str(path), "exec"), namespace)
		with patch.object(pricing, "validate_single_enabled_rule") as check:
			namespace["validate_rule"](types.SimpleNamespace(enabled=0))
			check.assert_not_called()


class MigrationTests(unittest.TestCase):
	def setUp(self):
		self.legacy = [{"item_group": "Plate", "enabled": 1, "pattern": "{item_group}-{param.L}"}]

	def rule(self, name="Plate-Kg", **values):
		return {"name": name, "item_group": "Plate", "enabled": 1, **values}

	def test_unique_rule_receives_existing_pattern(self):
		self.assertEqual(plan_migration(self.legacy, [self.rule()]), [("Plate-Kg", "{item_group}-{param.L}")])

	def test_missing_or_multiple_destinations_are_not_guessed(self):
		for rules in ([], [self.rule(), self.rule("Plate-Metre")]):
			with self.subTest(rules=rules), self.assertRaises(ValueError):
				plan_migration(self.legacy, rules)

	def test_rerun_preserves_same_configuration(self):
		self.assertEqual(
			plan_migration(
				self.legacy, [self.rule(enable_item_code=1, item_code_pattern=self.legacy[0]["pattern"])]
			),
			[],
		)

	def test_existing_different_pattern_is_not_overwritten(self):
		with self.assertRaises(ValueError):
			plan_migration(self.legacy, [self.rule(enable_item_code=1, item_code_pattern="OTHER")])

	def test_disabled_legacy_record_is_not_activated(self):
		self.assertEqual(plan_migration([{**self.legacy[0], "enabled": 0}], []), [])
