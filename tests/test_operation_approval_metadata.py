"""Effective metadata is needed because raw DocType records omit custom fields."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


class MetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / "erpnext_ui/api.py"
        node = next(n for n in ast.parse(path.read_text()).body if isinstance(n, ast.FunctionDef) and n.name == "get_operation_approval_form_meta")
        node.decorator_list = []
        cls.frappe = SimpleNamespace(
            has_permission=Mock(return_value=True),
            get_meta=Mock(return_value=SimpleNamespace(fields=[SimpleNamespace(as_dict=lambda: {"fieldname": "custom_approval_rules", "fieldtype": "Table"})])),
            throw=Mock(side_effect=ValueError), PermissionError=PermissionError,
        )
        namespace = {"frappe": cls.frappe}
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), "exec"), namespace)
        cls.meta = staticmethod(namespace["get_operation_approval_form_meta"])

    def test_effective_custom_fields_returned_for_each_parent(self):
        for doctype in ("Operation", "BOM", "Work Order"):
            with self.subTest(doctype=doctype):
                self.assertEqual(self.meta(doctype)["fields"][0]["fieldname"], "custom_approval_rules")
                self.frappe.get_meta.assert_called_with(doctype)

    def test_unrelated_doctype_is_rejected(self):
        with self.assertRaises(ValueError): self.meta("User")

    def test_permission_is_required(self):
        self.frappe.has_permission.return_value = False
        try:
            with self.assertRaises(ValueError): self.meta("Operation")
        finally:
            self.frappe.has_permission.return_value = True

if __name__ == "__main__": unittest.main()
