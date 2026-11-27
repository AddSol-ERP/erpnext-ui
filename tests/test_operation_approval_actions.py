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
job_module.JobCard = type("JobCard", (), {})
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

if __name__ == "__main__": unittest.main()
