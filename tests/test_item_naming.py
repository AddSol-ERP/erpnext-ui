"""Configurable code rendering and insert lifecycle without a bench."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

frappe = types.ModuleType("frappe")
frappe.whitelist = lambda **kwargs: lambda fn: fn
frappe.flags = types.SimpleNamespace(in_import=False)
frappe.db = Mock()


def throw(message):
	raise ValueError(message)


frappe.throw = throw
spec = importlib.util.spec_from_file_location(
	"item_naming_under_test", Path(__file__).resolve().parents[1] / "erpnext_ui/item_naming.py"
)
naming = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"frappe": frappe}):
	spec.loader.exec_module(naming)


class Doc(dict):
	def __getattr__(self, key):
		return self.get(key)

	__setattr__ = dict.__setitem__

	def is_new(self):
		return self.get("__islocal", True)

	def as_dict(self):
		return dict(self)


class ItemNamingTests(unittest.TestCase):
	def test_combines_fields_and_parameters_in_configured_order(self):
		self.assertEqual(
			naming.render_code(
				"{item_group}-{param.T}x{param.W}x{param.L}",
				{"item_group": "MS Plate"},
				{"T": 10.0, "W": 1250.0, "L": 2500.0},
				{"item_group"},
			),
			"MS Plate-10x1250x2500",
		)

	def test_custom_fields_and_literal_separators(self):
		self.assertEqual(
			naming.render_code(
				"{custom_project}_{brand}-{param.D}",
				{"custom_project": "P1", "brand": "ACME"},
				{"D": 2.54},
				{"custom_project", "brand"},
			),
			"P1_ACME-2.54",
		)

	def test_zero_is_not_a_missing_value(self):
		self.assertEqual(naming.render_code("A-{param.N}", {}, {"N": 0}, set()), "A-0")

	def test_missing_values_are_not_silently_omitted(self):
		for value in (None, "", " "):
			with self.subTest(value=value), self.assertRaises(ValueError):
				naming.render_code("{brand}", {"brand": value}, {}, {"brand"})
		with self.assertRaises(ValueError):
			naming.render_code("{param.MISSING}", {}, {}, set())

	def test_unsupported_fields_and_expressions_are_rejected(self):
		for pattern in (
			"{item_code}",
			"{unknown}",
			"{item_group.upper}",
			"{param.L[0]}",
			"{param.L:.2f}",
			"{param.L!r}",
			"{",
			"",
		):
			with self.subTest(pattern=pattern), self.assertRaises(ValueError):
				naming.render_code(pattern, {}, {"L": 10}, {"item_code", "item_group"})

	def test_code_validation(self):
		for value in ("a/b", "a\\b", "a\nb", "x" * 141):
			with self.subTest(value=value), self.assertRaises(ValueError):
				naming.render_code("{brand}", {"brand": value}, {}, {"brand"})
		with self.assertRaises(ValueError):
			naming.render_code("{param.L}", {}, {"L": float("nan")}, set())

	def test_parameters_use_unsaved_effective_rule_rows_and_data_sources(self):
		doc = Doc(
			custom_length_mm=2500,
			custom_uom_pricing_parameters=[
				{"rule": "Current", "symbol": "L", "value": 1},
				{"rule": "Current", "symbol": "W", "value": 1250},
				{"rule": "Old", "symbol": "W", "value": 9999},
			],
		)
		rule = {
			"name": "Current",
			"params": [{"symbol": "L", "data_source": "custom_length_mm"}, {"symbol": "W"}],
		}
		self.assertEqual(naming.resolve_parameters(doc, rule), {"L": 2500, "W": 1250})

	def test_duplicate_parameter_is_rejected(self):
		doc = Doc(custom_uom_pricing_parameters=[{"rule": "R", "symbol": "L", "value": 1}] * 2)
		with self.assertRaises(ValueError):
			naming.resolve_parameters(doc, {"name": "R", "params": []})

	def test_generated_code_is_stable_through_validate(self):
		doc = Doc(item_group="Plate", flags={}, set_parent_in_children=Mock())
		with (
			patch.object(naming, "uses_configured_item_code", return_value=True),
			patch.object(naming, "generate_item_code", return_value="Plate-10x20") as generate,
		):
			naming.apply_item_code(doc)
			doc.name = doc.item_code = "intermediate-name"
			naming.apply_item_code(doc)
			generate.assert_called_once()
		self.assertEqual(doc.set_parent_in_children.call_count, 2)
		self.assertEqual((doc.name, doc.item_code), ("Plate-10x20", "Plate-10x20"))

	def test_existing_item_is_never_renamed(self):
		doc = Doc(__islocal=False, name="OLD", item_code="OLD")
		with patch.object(naming, "generate_item_code") as generate:
			naming.apply_item_code(doc)
			generate.assert_not_called()
		self.assertEqual(doc.name, "OLD")

	def test_unconfigured_item_is_unchanged(self):
		doc = Doc(name="Typed", item_code="Typed")
		with patch.object(naming, "uses_configured_item_code", return_value=False):
			naming.apply_item_code(doc)
		self.assertEqual(doc.item_code, "Typed")

	def test_import_and_cutting_generated_codes_are_preserved(self):
		with patch.object(naming, "get_item_code_rule", return_value={"pattern": "X"}):
			for doc in (Doc(custom_is_offcut=1), Doc(custom_is_remainder=1)):
				self.assertFalse(naming.uses_configured_item_code(doc))
			with patch.object(frappe.flags, "in_import", True):
				self.assertFalse(naming.uses_configured_item_code(Doc()))

	def test_field_only_patterns_do_not_require_pricing(self):
		meta = Mock()
		meta.get_field.return_value.length = 140
		with (
			patch.object(naming, "get_item_code_rule", return_value=Doc(pattern="{brand}")),
			patch.object(naming, "available_item_fields", return_value=[Doc(fieldname="brand")]),
			patch.object(frappe, "get_meta", return_value=meta, create=True),
			patch.object(naming, "effective_pricing_rule") as pricing,
		):
			self.assertEqual(naming.generate_item_code(Doc(brand="ACME")), "ACME")
			pricing.assert_not_called()


class PricingRuleNamingTests(unittest.TestCase):
	def test_naming_uses_group_pricing_rule_pattern(self):
		from erpnext_ui import uom_pricing

		with (
			patch.object(
				uom_pricing,
				"get_pricing_rule",
				return_value={"name": "Plate-Kg", "enable_item_code": 1, "item_code_pattern": "{param.L}"},
			),
			patch.object(frappe, "_dict", side_effect=lambda **values: Doc(**values), create=True),
		):
			self.assertEqual(naming.get_item_code_rule("Plate").pattern, "{param.L}")

	def test_override_is_shared_by_pricing_and_naming(self):
		from erpnext_ui import uom_pricing

		with (
			patch.object(
				uom_pricing,
				"get_pricing_rule_by_name",
				return_value={"name": "Override", "enable_item_code": 1, "item_code_pattern": "OV-{param.W}"},
			),
			patch.object(uom_pricing, "get_pricing_rule") as group,
			patch.object(frappe, "_dict", side_effect=lambda **values: Doc(**values), create=True),
		):
			self.assertEqual(naming.get_item_code_rule("Plate", "Override").name, "Override")
			group.assert_not_called()

	def test_naming_disabled_on_override_does_not_take_group_pattern(self):
		from erpnext_ui import uom_pricing

		with (
			patch.object(
				uom_pricing,
				"get_pricing_rule_by_name",
				return_value={"name": "Override", "enable_item_code": 0},
			),
			patch.object(uom_pricing, "get_pricing_rule") as group,
		):
			self.assertIsNone(naming.get_item_code_rule("Plate", "Override"))
			group.assert_not_called()
