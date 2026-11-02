"""Exercise migration seeding without requiring a Frappe site."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


class AttachmentSettingsTests(unittest.TestCase):
	def seed(self, installed, existing=()):
		frappe = types.ModuleType("frappe")
		frappe.db = Mock()
		frappe.db.exists.side_effect = lambda dt, name: name in installed
		settings = Mock()
		settings.doctype_rules = list(existing)
		frappe.get_single = Mock(return_value=settings)
		documents = types.ModuleType("erpnext_ui.ui_documents")
		documents.DOCUMENT_ATTACHMENT_CONFIG = {"Purchase Receipt": {}, "Plate Offcut": {}}
		spec = importlib.util.spec_from_file_location(
			"attachment_settings_under_test",
			Path(__file__).resolve().parents[1] / "erpnext_ui/setup/attachment_settings.py",
		)
		module = importlib.util.module_from_spec(spec)
		with patch.dict(sys.modules, {"frappe": frappe, "erpnext_ui.ui_documents": documents}):
			spec.loader.exec_module(module)
			module.setup_attachment_settings()
		return settings, frappe

	def test_missing_optional_doctype_is_not_seeded(self):
		settings, _ = self.seed({"UI Attachment Settings", "Purchase Receipt"})
		settings.append.assert_called_once_with(
			"doctype_rules",
			{"target_doctype": "Purchase Receipt", "enabled": 1, "require_on_save": 0, "require_on_submit": 0},
		)
		settings.save.assert_called_once_with(ignore_permissions=True)

	def test_installed_optional_doctype_is_seeded(self):
		settings, _ = self.seed({"UI Attachment Settings", "Purchase Receipt", "Plate Offcut"})
		self.assertEqual([call.args[1]["target_doctype"] for call in settings.append.call_args_list],
			["Purchase Receipt", "Plate Offcut"])

	def test_existing_admin_rule_is_preserved_and_repeat_does_not_save(self):
		rule = types.SimpleNamespace(target_doctype="Purchase Receipt", enabled=0, require_on_save=1)
		settings, _ = self.seed({"UI Attachment Settings", "Purchase Receipt"}, [rule])
		settings.append.assert_not_called()
		settings.save.assert_not_called()
		self.assertEqual((rule.enabled, rule.require_on_save), (0, 1))

	def test_absent_settings_doctype_is_a_noop(self):
		_, frappe = self.seed(set())
		frappe.get_single.assert_not_called()
