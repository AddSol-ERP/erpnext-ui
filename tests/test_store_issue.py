"""Direct issues require source warehouses; other context remains optional."""

import sys
import types
import unittest
from unittest.mock import patch

if "frappe" not in sys.modules:
	sys.modules["frappe"] = types.ModuleType("frappe")
from erpnext_ui import store_issue


def throw(message):
	raise ValueError(message)


class DirectIssueTests(unittest.TestCase):
	def validate(self, **values):
		doc = {"custom_store_direct_issue": 1, "purpose": "Material Issue", "items": [{}], **values}
		with patch.object(store_issue.frappe, "throw", side_effect=throw, create=True):
			store_issue.validate_direct_issue(doc)

	def test_header_warehouse_with_optional_context_blank(self):
		self.validate(from_warehouse="Stores")

	def test_each_line_can_choose_a_different_warehouse(self):
		self.validate(items=[{"s_warehouse": "Stores A"}, {"s_warehouse": "Stores B"}])

	def test_missing_line_and_header_warehouse_is_rejected(self):
		with self.assertRaisesRegex(ValueError, "every direct issue item"):
			self.validate(items=[{"s_warehouse": "Stores"}, {}])

	def test_direct_issue_cannot_change_to_receipt(self):
		with self.assertRaisesRegex(ValueError, "Material Issue"):
			self.validate(purpose="Material Receipt", from_warehouse="Stores")

	def test_normal_movements_are_unchanged(self):
		self.validate(custom_store_direct_issue=0, purpose="Material Receipt")
