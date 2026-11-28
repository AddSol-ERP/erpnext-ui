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
    def test_routing_rules_resolve_repeated_operations_by_row_index(self):
        class Row(dict):
            __getattr__ = dict.get
            __setattr__ = dict.__setitem__
        class Doc(Row):
            def get_doc_before_save(self): return None
        rows = [Row(name="ROW1", operation="Inspect"), Row(name="ROW2", operation="Inspect")]
        approvals = [Row(operation="Inspect", operation_row_index=index, approval_point="Before Start", perspective="Quality", instruction="Inspect", approval_role="Manager") for index in (1, 2)]
        bom = Doc(doctype="BOM", operations=rows, custom_approval_rules=approvals)
        instruction = Row(enabled=1, perspective="Quality", approval_point="Before Start", instruction_name="Inspect")
        database = types.SimpleNamespace(get_value=lambda *args, **kwargs: instruction)
        with patch.object(rules.frappe, "db", database, create=True):
            rules.validate_rules(bom)
        self.assertEqual([rule.operation_row for rule in approvals], ["ROW1", "ROW2"])

    def test_routing_defaults_are_not_copied_twice_on_save(self):
        class Row(dict):
            __getattr__ = dict.get
            __setattr__ = dict.__setitem__
        class Doc(Row):
            def get_doc_before_save(self): return None
            def append(self, key, value): self.setdefault(key, []).append(Row(value))
        bom = Doc(operations=[Row(name="ROW1", operation="Inspect"), Row(name="ROW2", operation="Inspect")],
            custom_approval_rules=[Row(operation="Inspect", operation_row_index=1), Row(operation="Inspect", operation_row_index=2)])
        with patch.object(rules.frappe, "get_doc", side_effect=AssertionError("already configured"), create=True):
            rules.apply_bom_defaults(bom)
        self.assertEqual(len(bom.custom_approval_rules), 2)

    def test_operation_is_derived_from_parent_or_selected_row(self):
        class Row(dict):
            __getattr__ = dict.get
            __setattr__ = dict.__setitem__
        class Doc(Row):
            def get_doc_before_save(self): return None
        instruction = Row(enabled=1, perspective="Quality", approval_point="After Work", instruction_name="Inspect weld")
        database = types.SimpleNamespace(get_value=lambda *args, **kwargs: instruction)
        def rule(**kwargs):
            return Row(approval_point="After Work", perspective="Quality", instruction="Inspect weld", approval_role="Manager", **kwargs)
        master_rule = rule()
        row_rule = rule(operation_row="ROW2")
        bom = Doc(doctype="BOM", operations=[Row(name="ROW1", operation="Weld"), Row(name="ROW2", operation="Inspect")], custom_approval_rules=[row_rule])
        with patch.object(rules.frappe, "db", database, create=True):
            rules.validate_rules(Doc(doctype="Operation", name="Weld", custom_approval_rules=[master_rule]))
            rules.validate_rules(bom)
        self.assertEqual(master_rule.operation, "Weld")
        self.assertEqual(row_rule.operation, "Inspect")

    def test_instruction_must_match_perspective_and_approval_point(self):
        class Row(dict):
            __getattr__ = dict.get
            __setattr__ = dict.__setitem__
        class Doc(Row):
            def get_doc_before_save(self): return None
        rule = Row(operation="Weld", approval_point="Before Start", perspective="Customer", instruction="Inspect weld", approval_role="Manager")
        doc = Doc(doctype="Operation", custom_approval_rules=[rule])
        database = types.SimpleNamespace(get_value=lambda *args, **kwargs: Row(enabled=1, perspective="Quality", approval_point="After Work", instruction_name="Inspect weld"))
        with patch.object(rules.frappe, "db", database, create=True), self.assertRaisesRegex(ValueError, "matching"):
            rules.validate_rules(doc)

    def test_bom_defaults_copy_only_to_new_operation_rows(self):
        class Row(dict):
            __getattr__ = dict.get
            __setattr__ = dict.__setitem__
        class Bom(Row):
            def get_doc_before_save(self): return self.get("before")
            def append(self, key, value): self.setdefault(key, []).append(Row(value))
        old = Row(operations=[Row(name="OLD", operation="Weld")])
        bom = Bom(before=old, operations=[Row(name="OLD", operation="Weld"), Row(name="NEW", operation="Cut")], custom_approval_rules=[])
        operation = Row(custom_approval_rules=[Row(approval_point="Before Start", perspective="Customer", instruction="Approve drawing", approval_role="Manager", attachment_required=1)])
        with patch.object(rules.frappe, "get_doc", return_value=operation, create=True):
            rules.apply_bom_defaults(bom)
        self.assertEqual(len(bom.custom_approval_rules), 1)
        self.assertEqual((bom.custom_approval_rules[0].operation, bom.custom_approval_rules[0].operation_row), ("Cut", "NEW"))
        self.assertEqual(bom.custom_approval_rules[0].attachment_required, 1)

    def test_multiple_rules_gate_start_and_release_independently(self):
        rows = [
            {"approval_point": "Before Start", "instruction_snapshot": "Approve drawing", "approval_role": "Manager"},
            {"approval_point": "After Work", "instruction_snapshot": "Inspect weld", "approval_role": "Inspector"},
            {"approval_point": "After Work", "instruction_snapshot": "Verify dimensions", "approval_role": "Inspector"},
        ]
        card = {"custom_approval_rules": rows}
        with self.assertRaisesRegex(ValueError, "Approve drawing"):
            rules.assert_allowed(card, "start")
        rows[0]["approved_by"] = "manager@example.com"
        rules.assert_allowed(card, "start")
        rules.assert_allowed(card, "complete")  # Recording work is not release.
        with self.assertRaisesRegex(ValueError, "Inspect weld"):
            rules.assert_allowed(card, "release")
        card.update(for_quantity=2, time_logs=[{"to_time": "2026-11-27 10:00:00", "completed_qty": 2}])
        with self.assertRaisesRegex(ValueError, "Inspect weld"):
            rules.assert_allowed(card, "start")
        rows[1]["approved_by"] = "inspector@example.com"
        with self.assertRaisesRegex(ValueError, "Verify dimensions"):
            rules.assert_allowed(card, "release")
        rows[2]["approved_by"] = "inspector@example.com"
        rules.assert_allowed(card, "release")

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
