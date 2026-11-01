"""Exercise schema prerequisites without requiring a running Frappe database."""

import ast
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


class EstimateMigrationTests(unittest.TestCase):
	def run_migration(self, interrupted=False):
		path = (
			Path(__file__).resolve().parents[1] / "erpnext_ui/patches/v1_0/add_uom_pricing_estimate_fields.py"
		)
		node = next(
			n
			for n in ast.parse(path.read_text()).body
			if isinstance(n, ast.FunctionDef) and n.name == "execute"
		)
		tables = ["Purchase Order Item", "Material Request Item", "Supplier Quotation Item"]
		columns = {dt: set() for dt in tables}
		meta = {dt: set() for dt in tables}
		repaired, queried = [], []
		modules = {}
		for module_name, fields in {
			"add_uom_pricing_rate_field": ["custom_rate_per_pricing_uom"],
			"add_chargeable_qty_field": ["custom_chargeable_qty"],
			"add_uom_pricing_snapshot": ["custom_pricing_uom", "custom_pricing_snapshot"],
		}.items():
			module = types.ModuleType(module_name)

			def install(fields=fields):
				for dt in tables:
					meta[dt].update(fields)
					if not interrupted:
						columns[dt].update(fields)

			module.execute = install
			modules["erpnext_ui.patches.v1_0." + module_name] = module

		def create_fields(definitions):
			for dt, fields in definitions.items():
				meta[dt].update(field["fieldname"] for field in fields)
				columns[dt].update(field["fieldname"] for field in fields)

		def updatedb(dt):
			repaired.append(dt)
			columns[dt].update(meta[dt])

		def get_all(dt, **kwargs):
			self.assertTrue(set(kwargs["fields"]) - {"name", "qty"} <= columns[dt])
			queried.append(dt)
			return []

		frappe = types.SimpleNamespace(
			db=types.SimpleNamespace(has_column=lambda dt, field: field in columns[dt], updatedb=updatedb),
			clear_cache=lambda **kwargs: None,
			get_all=get_all,
		)
		namespace = {"frappe": frappe, "create_custom_fields": create_fields, "ITEM_TABLES": tables}
		exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), "exec"), namespace)
		with patch.dict(sys.modules, modules):
			namespace["execute"]()
		self.assertEqual(queried, tables)
		self.assertEqual(repaired, tables if interrupted else [])

	def test_prerequisites_exist_before_select_on_every_table(self):
		self.run_migration()

	def test_existing_metadata_with_missing_columns_is_repaired(self):
		self.run_migration(interrupted=True)
