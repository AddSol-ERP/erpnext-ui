"""Shared Desk layout preserves native fields and is stable on reapplication."""

import ast
import unittest
from pathlib import Path
from types import SimpleNamespace

path = Path(__file__).resolve().parents[1] / "erpnext_ui/setup/uom_pricing_layout.py"
tree = ast.parse(path.read_text())
nodes = [
	node
	for node in tree.body
	if isinstance(node, ast.Assign)
	or (isinstance(node, ast.FunctionDef) and node.name == "pricing_field_order")
]
namespace = {}
exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), namespace)


class LayoutTests(unittest.TestCase):
	def test_reference_columns_and_native_fields_survive(self):
		section, column = namespace["SECTION"], namespace["COLUMN"]
		names = [
			"item_code",
			"quantity_and_rate",
			"qty",
			"uom",
			"rate",
			"amount",
			"discount_percentage",
			"description_section",
			"description",
			*namespace["LEFT"][1:3],
			*namespace["RIGHT"],
			section,
			column,
		]
		fields = [
			SimpleNamespace(
				fieldname=name,
				fieldtype="Section Break"
				if name in ("quantity_and_rate", "description_section", section)
				else "Column Break"
				if name == column
				else "Data",
			)
			for name in names
		]
		order = namespace["pricing_field_order"](fields)
		self.assertEqual(set(order), set(names))
		self.assertEqual(len(order), len(names))
		self.assertEqual(order[order.index(section) : order.index(column)], [section, *namespace["LEFT"]])
		self.assertEqual(
			order[order.index(column) + 1 : order.index("description_section")], namespace["RIGHT"]
		)
		self.assertLess(order.index("qty"), order.index(section))
		self.assertLess(order.index("discount_percentage"), order.index(section))
		lookup = {field.fieldname: field for field in fields}
		self.assertEqual(namespace["pricing_field_order"]([lookup[name] for name in order]), order)

	def test_missing_native_rate_amount_do_not_create_nonexistent_fields(self):
		names = [
			"item_code",
			"custom_rate_per_pricing_uom",
			"custom_pricing_uom",
			namespace["SECTION"],
			namespace["COLUMN"],
		]
		fields = [SimpleNamespace(fieldname=name, fieldtype="Data") for name in names]
		order = namespace["pricing_field_order"](fields)
		self.assertEqual(set(order), set(names))
		self.assertNotIn("rate", order)
		self.assertNotIn("amount", order)
