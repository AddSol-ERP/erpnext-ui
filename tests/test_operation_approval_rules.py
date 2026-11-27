"""Operation approval policy tests without a Frappe site."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

frappe = types.ModuleType("frappe")
def reject(message):
    raise ValueError(message)
frappe.throw = reject
spec = importlib.util.spec_from_file_location("approval_policy_test", Path(__file__).resolve().parents[1] / "erpnext_ui/operation_approval_rules.py")
rules = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"frappe": frappe}):
    spec.loader.exec_module(rules)


class ApprovalPolicyTests(unittest.TestCase):
    def test_no_rule_and_approved_rules_allow_actions(self):
        for action in ("start", "complete"):
            rules.assert_allowed({}, action)
            rules.assert_allowed({"custom_approval_stage": "Before Start", "custom_approval_by": "approver"}, action)

    def test_start_rule_blocks_both_actions(self):
        card = {"custom_approval_stage": "Before Start", "custom_approval_reason": "Customer drawing", "custom_approval_role": "Manager"}
        for action in ("start", "complete"):
            with self.subTest(action=action), self.assertRaisesRegex(ValueError, "Customer drawing"):
                rules.assert_allowed(card, action)

    def test_completion_rule_allows_work_but_blocks_completion(self):
        card = {"custom_approval_stage": "Before Completion", "custom_approval_reason": "Inspection", "custom_approval_role": "Quality Manager"}
        rules.assert_allowed(card, "start")
        with self.assertRaisesRegex(ValueError, "Inspection"):
            rules.assert_allowed(card, "complete")

    def test_rule_requires_role_and_reason(self):
        class Row(dict):
            __getattr__ = dict.get
        for role, reason in (("", "Customer review"), ("Manager", "  ")):
            with self.subTest(role=role, reason=reason), self.assertRaises(ValueError):
                rules.validate_rules({"operations": [Row(idx=1, custom_approval_stage="Before Start", custom_approval_role=role, custom_approval_reason=reason)]})
        rules.validate_rules({"operations": [Row(idx=1)]})

if __name__ == "__main__":
    unittest.main()
