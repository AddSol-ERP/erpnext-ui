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
	def validate(self):
		pass

	def set_operation_start_end_time(self, row, idx):
		row.planned_start_time = datetime(2026, 11, 27, 9)
		row.planned_end_time = row.planned_start_time + timedelta(minutes=row.time_in_mins)

	def prepare_data_for_job_card(self, row, idx, plan_days, enabled):
		return "native"


native.WorkOrder = NativeWorkOrder
modules = {"frappe": frappe, "frappe.utils": utils, native.__name__: native}
spec = importlib.util.spec_from_file_location("scheduling_under_test", Path(__file__).resolve().parents[1] / "erpnext_ui/work_order_scheduling.py")
module = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, modules):
	spec.loader.exec_module(module)


class Row(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class ScheduleTests(unittest.TestCase):
	def setUp(self):
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


if __name__ == "__main__":
	unittest.main()
