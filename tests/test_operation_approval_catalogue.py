"""Validate approval catalogue metadata and repeatable seeding without a site."""
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class CatalogueTests(unittest.TestCase):
    def test_internal_rule_fields_are_hidden_from_desk(self):
        path = ROOT / "erpnext_ui/addsol_erpnext_ui/doctype/ui_operation_approval_rule/ui_operation_approval_rule.json"
        fields = {field["fieldname"]: field for field in json.loads(path.read_text())["fields"]}
        for field in ("operation", "operation_row", "instruction_snapshot"):
            self.assertEqual(fields[field].get("hidden"), 1)
            self.assertEqual(fields[field].get("read_only"), 1)

    def test_metadata_has_matching_controllers_and_edit_permissions(self):
        for folder in ("ui_operation_approval_perspective", "ui_operation_approval_instruction"):
            directory = ROOT / "erpnext_ui/addsol_erpnext_ui/doctype" / folder
            meta = json.loads((directory / f"{folder}.json").read_text())
            source = (directory / f"{folder}.py").read_text()
            self.assertIn(f"class {meta['name'].replace(' ', '')}(Document)", source)
            self.assertTrue(any(p["role"] == "Manufacturing Manager" and p.get("create") for p in meta["permissions"]))
            self.assertFalse(any(p["role"] == "Manufacturing User" and p.get("write") for p in meta["permissions"]))

    def test_seed_is_idempotent_and_does_not_overwrite(self):
        records = {}
        class DB:
            def exists(self, doctype, name): return (doctype, name) in records
        class Doc(dict):
            def insert(self, ignore_permissions=False):
                field = "perspective_name" if self["doctype"].endswith("Perspective") else "instruction_name"
                records[(self["doctype"], self[field])] = dict(self)
        frappe = types.ModuleType("frappe")
        frappe.db = DB()
        frappe.get_doc = Doc
        spec = importlib.util.spec_from_file_location("catalogue_seed_test", ROOT / "erpnext_ui/patches/v1_0/seed_operation_approval_catalogue.py")
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"frappe": frappe}): spec.loader.exec_module(module)
        module.execute()
        records[("UI Operation Approval Instruction", "Approve drawing")]["enabled"] = 0
        count = len(records)
        module.execute()
        self.assertEqual(len(records), count)
        self.assertEqual(records[("UI Operation Approval Instruction", "Approve drawing")]["enabled"], 0)
        self.assertEqual(records[("UI Operation Approval Instruction", "Inspect weld")]["approval_point"], "After Work")

if __name__ == "__main__": unittest.main()
