"""BOM controller receives JSON numbers as strings before Frappe coerces fields."""
import ast
import math
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


class Row(dict):
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__

class NativeBOM:
    def validate(self):
        self.observed = [row.time_in_mins for row in self.get("operations") or []]

class BOM(NativeBOM):
    def __init__(self, rows): self.rows = rows
    def get(self, key): return self.rows if key == "operations" else None

path = Path(__file__).resolve().parents[1] / "erpnext_ui/bom_costing.py"
tree = ast.parse(path.read_text())
klass = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "UomPricingBOM")
method = next(node for node in klass.body if isinstance(node, ast.FunctionDef) and node.name == "validate")
klass = ast.ClassDef(name="TestBOM", bases=[ast.Name(id="BOM", ctx=ast.Load())], keywords=[], body=[method], decorator_list=[])
frappe = types.SimpleNamespace(throw=lambda msg: (_ for _ in ()).throw(ValueError(msg)))
namespace = {"BOM": BOM, "frappe": frappe, "math": math}
exec(compile(ast.fix_missing_locations(ast.Module(body=[klass], type_ignores=[])), str(path), "exec"), namespace)

class BOMOperationValidationTests(unittest.TestCase):
    def setUp(self):
        self.rules = types.ModuleType("erpnext_ui.operation_approval_rules")
        self.rules.apply_bom_defaults = lambda doc: None
        self.rules.validate_rules = lambda doc: None
        self.modules = patch.dict(sys.modules, {"erpnext_ui.operation_approval_rules": self.rules})
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def test_numeric_string_is_coerced_before_native_validation(self):
        doc = namespace["TestBOM"]([Row(idx=1, time_in_mins="12.75")])
        doc.validate()
        self.assertEqual(doc.observed, [12.75])

    def test_invalid_and_nonfinite_values_fail_clearly(self):
        for value in ("bad", "NaN", "inf"):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "Operation row 1: time"):
                namespace["TestBOM"]([Row(idx=1, time_in_mins=value)]).validate()

if __name__ == "__main__": unittest.main()
