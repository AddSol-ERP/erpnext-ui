"""Check preferred operation times without a running Frappe site."""

import importlib.util
import sys
import types
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import Mock, patch

frappe = types.ModuleType("frappe")
frappe.throw = Mock(side_effect=lambda message: (_ for _ in ()).throw(ValueError(message)))
frappe.msgprint = Mock()
utils = types.ModuleType("frappe.utils")
utils.get_datetime = lambda value: value if isinstance(value, datetime) else datetime.fromisoformat(value)
native = types.ModuleType("erpnext.manufacturing.doctype.work_order.work_order")


class NativeWorkOrder:
	def get(self, name):
		return getattr(self, name, None)

	def validate(self):
		pass

	def set_work_order_operations(self):
		self.operations = [Row(operation="Weld", bom="B1"), Row(operation="Weld", bom="B1")]

	def set(self, key, value):
		setattr(self, key, value)

	def append(self, key, value):
		getattr(self, key).append(Row(value))

	def set_operation_start_end_time(self, row, idx):
		row.planned_start_time = datetime(2026, 11, 27, 9)
		row.planned_end_time = row.planned_start_time + timedelta(minutes=row.time_in_mins)

	def prepare_data_for_job_card(self, row, idx, plan_days, enabled):
		return "native"


native.WorkOrder = NativeWorkOrder
naming = types.ModuleType("frappe.model.naming")
def set_new_name(row):
	row.name = "WO-ROW-" + str(id(row))
naming.set_new_name = set_new_name
modules = {"frappe": frappe, "frappe.utils": utils, "frappe.model.naming": naming, native.__name__: native}
spec = importlib.util.spec_from_file_location("scheduling_under_test", Path(__file__).resolve().parents[1] / "erpnext_ui/work_order_scheduling.py")
module = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, modules):
	spec.loader.exec_module(module)


class Row(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__
	def set(self, key, value):
		self[key] = value


class ScheduleTests(unittest.TestCase):
	def setUp(self):
		self.modules = patch.dict(sys.modules, modules)
		self.modules.start()
		self.addCleanup(self.modules.stop)
		self.order = module.PreferredScheduleWorkOrder()
		self.row = Row(idx=1, operation="Weld", time_in_mins=60)
		self.order.operations = [self.row]
		frappe.msgprint.reset_mock()

	def test_preferred_start_moves_operation_without_changing_duration(self):
		self.row.custom_preferred_start = "2026-11-27 11:00:00"
		self.order.set_operation_start_end_time(self.row, 0)
		self.assertEqual(self.row.planned_start_time, datetime(2026, 11, 27, 11))
		self.assertEqual(self.row.planned_end_time, datetime(2026, 11, 27, 12))

	def test_preferred_start_does_not_move_before_native_sequence(self):
		self.row.custom_preferred_start = "2026-11-27 08:00:00"
		self.order.set_operation_start_end_time(self.row, 0)
		self.assertEqual(self.row.planned_start_time, datetime(2026, 11, 27, 9))

	def test_invalid_preferred_window_is_rejected(self):
		self.row.custom_preferred_start = "2026-11-27 11:00:00"
		self.row.custom_preferred_end = "2026-11-27 10:00:00"
		with self.assertRaisesRegex(ValueError, "preferred end"):
			self.order.validate()

	def test_missed_end_target_warns_after_native_scheduling(self):
		self.row.planned_end_time = datetime(2026, 11, 27, 12)
		self.row.custom_preferred_end = "2026-11-27 11:00:00"
		self.assertEqual(self.order.prepare_data_for_job_card(self.row, 0, 30, True), "native")
		frappe.msgprint.assert_called_once()

	def test_bom_rules_follow_exact_repeated_operation_row(self):
		self.order.bom_no = "B1"
		frappe.get_all = Mock(return_value=[Row(name="BOM-ROW-1"), Row(name="BOM-ROW-2")])
		frappe.get_doc = Mock(return_value=Row(custom_approval_rules=[
			Row(operation_row="BOM-ROW-2", approval_point="Before Start", instruction="Approve drawing", approval_role="Manager")]))
		self.order.set_work_order_operations()
		self.assertEqual(len(self.order.custom_approval_rules), 1)
		self.assertEqual(self.order.custom_approval_rules[0].operation_row, self.order.operations[1].name)
		self.assertNotEqual(self.order.custom_approval_rules[0].operation_row, self.order.operations[0].name)


if __name__ == "__main__":
	unittest.main()
