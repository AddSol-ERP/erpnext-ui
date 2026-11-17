"""Parameter edits must rename identity and retain normal Frappe permissions."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


class QualityParameterTests(unittest.TestCase):
	def setUp(self):
		self.frappe = types.ModuleType("frappe")
		self.frappe.whitelist = lambda **kwargs: lambda fn: fn
		self.frappe._ = lambda value: value
		self.frappe.throw = Mock(side_effect=ValueError("Parameter is required."))
		self.frappe.get_doc = Mock()
		self.frappe.rename_doc = Mock(return_value="New parameter")
		utils = types.ModuleType("frappe.utils")
		utils.cint = int
		with patch.dict(sys.modules, {"frappe": self.frappe, "frappe.utils": utils}):
			spec = importlib.util.spec_from_file_location(
				"quality_parameter_under_test",
				Path(__file__).resolve().parents[1] / "erpnext_ui/quality_inspection.py",
			)
			self.module = importlib.util.module_from_spec(spec)
			spec.loader.exec_module(self.module)

	def test_rename_then_save_other_fields(self):
		original, renamed = Mock(), Mock()
		self.frappe.get_doc.side_effect = [original, renamed]
		result = self.module.update_quality_inspection_parameter(
			"Old parameter", " New parameter ", "Dimensions", "Updated", '{"type":"text"}'
		)
		original.check_permission.assert_called_once_with("write")
		self.frappe.rename_doc.assert_called_once_with(
			"Quality Inspection Parameter", "Old parameter", "New parameter", merge=False
		)
		renamed.update.assert_called_once_with(
			{
				"parameter_group": "Dimensions",
				"description": "Updated",
				"custom_response_config": '{"type":"text"}',
			}
		)
		renamed.save.assert_called_once_with()
		self.assertEqual(result, renamed.as_dict.return_value)

	def test_unchanged_name_saves_without_rename(self):
		doc = self.frappe.get_doc.return_value
		self.module.update_quality_inspection_parameter("Same", "Same")
		self.frappe.rename_doc.assert_not_called()
		doc.save.assert_called_once_with()

	def test_blank_name_does_not_write(self):
		with self.assertRaises(ValueError):
			self.module.update_quality_inspection_parameter("Old", "  ")
		self.frappe.get_doc.assert_not_called()

	def test_denied_write_does_not_rename(self):
		self.frappe.get_doc.return_value.check_permission.side_effect = PermissionError
		with self.assertRaises(PermissionError):
			self.module.update_quality_inspection_parameter("Old", "New")
		self.frappe.rename_doc.assert_not_called()

	def test_duplicate_name_does_not_save(self):
		self.frappe.rename_doc.side_effect = ValueError("Duplicate name")
		with self.assertRaises(ValueError):
			self.module.update_quality_inspection_parameter("Old", "New")
		self.frappe.get_doc.return_value.save.assert_not_called()
