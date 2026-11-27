"""Approval action authorization and job-card snapshot tests."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

class Row(dict):
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__
    def set(self, key, value): self[key] = value
    def check_permission(self, permission): pass
    def reload(self): pass

frappe = types.ModuleType("frappe")
frappe.PermissionError = PermissionError
frappe.throw = lambda message, *args: (_ for _ in ()).throw((args[0] if args else ValueError)(message))
frappe.db = Mock()
frappe.session = Row(user="user@example.com")
frappe.get_roles = Mock(return_value=[])
frappe.get_doc = Mock()
utils = types.ModuleType("frappe.utils")
utils.now_datetime = lambda: "2026-11-27 10:00:00"
job_module = types.ModuleType("erpnext.manufacturing.doctype.job_card.job_card")
class NativeJobCard(Row):
    def validate(self): pass
    def get_doc_before_save(self): return self.get("_before")
job_module.JobCard = NativeJobCard
modules = {"frappe": frappe, "frappe.utils": utils, job_module.__name__: job_module}
spec = importlib.util.spec_from_file_location("approval_actions_test", Path(__file__).resolve().parents[1] / "erpnext_ui/operation_approval.py")
actions = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, modules):
    spec.loader.exec_module(actions)

class ApprovalTests(unittest.TestCase):
    def setUp(self):
        frappe.db.reset_mock()
        frappe.get_roles.return_value = []
        frappe.get_doc.return_value = Row(docstatus=0, status="Open", custom_approval_stage="Before Start", custom_approval_role="Manager")

    def test_only_configured_role_can_approve(self):
        with self.assertRaises(PermissionError): actions.approve_job_card("JC1")
        frappe.db.set_value.assert_not_called()
        frappe.get_roles.return_value = ["Manager"]
        actions.approve_job_card("JC1")
        values = frappe.db.set_value.call_args.args[2]
        self.assertEqual(values["custom_approval_by"], "user@example.com")
        self.assertEqual(values["custom_approval_at"], "2026-11-27 10:00:00")

    def test_cannot_approve_twice(self):
        frappe.get_doc.return_value.custom_approval_by = "other@example.com"
        with self.assertRaisesRegex(ValueError, "already been approved"): actions.approve_job_card("JC1")
        frappe.db.set_value.assert_not_called()

    def test_each_rule_requires_its_own_role_and_after_work_record(self):
        rule = Row(name="RULE1", approval_point="After Work", approval_role="Inspector")
        card = frappe.get_doc.return_value
        card.custom_approval_rules = [rule]
        card.time_logs = []
        card.for_quantity = 2
        with self.assertRaises(PermissionError): actions.approve_job_card("JC1", "RULE1")
        frappe.get_roles.return_value = ["Inspector"]
        with self.assertRaisesRegex(ValueError, "Record and finish the work"):
            actions.approve_job_card("JC1", "RULE1")
        card.time_logs = [Row(to_time="2026-11-27 09:00:00", completed_qty=2)]
        actions.approve_job_card("JC1", "RULE1")
        self.assertEqual(frappe.db.set_value.call_args.args[:2], ("UI Operation Approval Rule", "RULE1"))

    def test_job_card_submit_requires_every_after_work_approval(self):
        rule = Row(name="R1", approval_point="After Work", instruction_snapshot="Inspect", approval_role="Inspector")
        old = Row(docstatus=0, status="Work In Progress", custom_approval_rules=[rule], time_logs=[], work_order="WO1", operation_id="OP1")
        card = actions.ApprovalJobCard(old)
        card._before = old
        card.docstatus = 1
        with self.assertRaisesRegex(ValueError, "Inspect"):
            card.validate()
        rule.approved_by = "inspector@example.com"
        card.validate()

    def test_job_card_rejects_forged_approval(self):
        old_rule = Row(name="R1", approval_point="Before Start", approval_role="Manager")
        old = Row(docstatus=0, status="Open", custom_approval_rules=[old_rule], time_logs=[], work_order="WO1", operation_id="OP1")
        card = actions.ApprovalJobCard(old)
        card._before = old
        card.custom_approval_rules = [Row(old_rule, approved_by="forged@example.com")]
        with self.assertRaisesRegex(ValueError, "cannot be changed directly"):
            card.validate()

if __name__ == "__main__": unittest.main()
