"""Obsolete naming configuration must disappear on upgrades and fresh installs."""

import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

if "frappe" not in sys.modules:
	sys.modules["frappe"] = types.ModuleType("frappe")
from erpnext_ui.patches.v1_0 import remove_legacy_item_code_rule as cleanup


class RemoveLegacyRuleTests(unittest.TestCase):
	def test_installed_doctype_is_removed(self):
		with (
			patch.object(cleanup.frappe, "db", Mock(), create=True) as db,
			patch.object(cleanup.frappe, "delete_doc", create=True) as delete,
		):
			db.exists.return_value = True
			cleanup.execute()
			delete.assert_called_once_with("DocType", "UI Item Code Rule", force=1, ignore_permissions=True)

	def test_fresh_install_or_repeat_is_noop(self):
		with (
			patch.object(cleanup.frappe, "db", Mock(), create=True) as db,
			patch.object(cleanup.frappe, "delete_doc", create=True) as delete,
		):
			db.exists.return_value = False
			cleanup.execute()
			delete.assert_not_called()

	def test_cleanup_runs_after_settings_transfer(self):
		root = Path(__file__).resolve().parents[1]
		patches = (root / "erpnext_ui/patches.txt").read_text()
		self.assertLess(
			patches.index("migrate_item_naming_to_pricing_rule"),
			patches.index("remove_legacy_item_code_rule"),
		)
		self.assertFalse(
			(root / "erpnext_ui/addsol_erpnext_ui/doctype/ui_item_code_rule/ui_item_code_rule.json").exists()
		)
