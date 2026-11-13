"""Run with unittest inside a bench environment; no live-site data is needed."""

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from erpnext_ui import essl_import as importer
from erpnext_ui import essl_report as parser


class TestReport(unittest.TestCase):
	def parse(self, rows):
		sheet = SimpleNamespace(
			name="Report", nrows=len(rows), ncols=len(rows[0]), row_values=rows.__getitem__
		)
		book = SimpleNamespace(sheets=lambda: [sheet])
		with patch.object(parser.xlrd, "open_workbook", return_value=book):
			return parser.parse_report(b"test")

	def rows(self, status="P", punch_in="9:00", punch_out="18:30", duration="8:30"):
		return [
			["", "Sep 01 2026 To Sep 30 2026", ""],
			["Days", "", "1 T"],
			["Employee:", "2 : Example Employee", ""],
			["Status", "", status],
			["InTime", "", punch_in],
			["OutTime", "", punch_out],
			["Duration", "", duration],
			["Shift", "", "GS"],
		]

	def test_single_digit_hour_and_net_duration(self):
		rows, errors = self.parse(self.rows())
		self.assertEqual(errors, [])
		self.assertEqual(rows[0]["in_time"], datetime(2026, 9, 1, 9))
		self.assertEqual(rows[0]["working_hours"], 8.5)

	def test_missing_punch_not_inferred(self):
		rows, _ = self.parse(self.rows(punch_out=""))
		self.assertIsNone(rows[0]["out_time"])

	def test_overnight(self):
		rows, _ = self.parse(self.rows(punch_in="22:00", punch_out="6:00"))
		self.assertEqual(rows[0]["out_time"], datetime(2026, 9, 2, 6))

	def test_statuses(self):
		for source, expected in (
			("A", "Absent"),
			("½P", "Half Day"),
			("H½P", "Half Day"),
			("WOP", "Present"),
		):
			rows, errors = self.parse(self.rows(status=source))
			self.assertEqual(errors, [])
			self.assertEqual(rows[0]["status"], expected)

	def test_day_off_without_punch_is_skipped(self):
		rows = self.rows() + self.rows(status="WO", punch_in="", punch_out="", duration="00:00")[2:]
		rows[8][1] = "3 : Another Employee"
		records, errors = self.parse(rows)
		self.assertEqual(len(records), 1)
		self.assertEqual(errors, [])

	def test_repeated_day_header(self):
		rows = self.rows() + self.rows()[1:]
		rows[9][1] = "3 : Another Employee"
		records, errors = self.parse(rows)
		self.assertEqual(len(records), 2)
		self.assertEqual(errors, [])

	def test_bad_time_reported(self):
		rows = self.rows() + self.rows(punch_in="25:00")[2:]
		rows[8][1] = "3 : Another Employee"
		records, errors = self.parse(rows)
		self.assertEqual(len(records), 1)
		self.assertEqual(len(errors), 1)

	def test_duplicate_employee_day_rejected(self):
		with self.assertRaisesRegex(ValueError, "Duplicate employee/day"):
			self.parse(self.rows() + self.rows()[2:])

	def test_excel_time(self):
		self.assertEqual(parser.clock(0.5).hour, 12)
		self.assertEqual(parser.duration(0.5), 12)


class TestEmployeeMatching(unittest.TestCase):
	def setUp(self):
		patcher = patch.object(
			importer, "get_import_scope", return_value={"can_view_others": True, "allowed_departments": None}
		)
		patcher.start()
		self.addCleanup(patcher.stop)
		remembered = patch.object(importer, "saved_mappings", return_value={})
		remembered.start()
		self.addCleanup(remembered.stop)
		company = patch.object(importer.frappe, "get_doc", return_value=Mock())
		company.start()
		self.addCleanup(company.stop)

	def employee(self, name="HR-EMP-00002", employee_name="Example Employee", number=None):
		return frappe._dict(name=name, employee_name=employee_name, employee_number=number)

	def test_code_and_name(self):
		employee, reason = importer.suggest_employee("2", "EXAMPLE EMPLOYEE", [self.employee()])
		self.assertEqual(employee, "HR-EMP-00002")
		self.assertEqual(reason, "Code and name match")

	def test_unique_name(self):
		employee, _ = importer.suggest_employee("999", "Example Employee", [self.employee()])
		self.assertEqual(employee, "HR-EMP-00002")

	def test_conflict_and_duplicate_names(self):
		employees = [self.employee(), self.employee("HR-EMP-00003", "Other Employee")]
		self.assertIsNone(importer.suggest_employee("3", "Example Employee", employees)[0])
		employees[1].employee_name = "Example Employee"
		self.assertIsNone(importer.suggest_employee("99", "Example Employee", employees)[0])

	def test_device_id_not_used(self):
		employee = self.employee()
		employee.attendance_device_id = "99"
		self.assertIsNone(importer.suggest_employee("99", "Different Name", [employee])[0])

	def test_duplicate_suggestions_stay_editable(self):
		records = [
			{"employee_code": "8", "employee_name": "Example Employee"},
			{"employee_code": "9", "employee_name": "Example Employee"},
		]
		with patch.object(importer.frappe, "get_list", return_value=[self.employee()]):
			mappings, _ = importer.employee_mappings(records, "Company")
			self.assertTrue(all(row["employee"] is None for row in mappings))

	def test_duplicate_selection_identifies_report_employees(self):
		records = [
			{"employee_code": "8", "employee_name": "First Person"},
			{"employee_code": "9", "employee_name": "Second Person"},
		]
		with (
			patch.object(importer.frappe, "get_list", return_value=[self.employee()]),
			patch.object(importer.frappe, "throw", side_effect=ValueError) as throw,
		):
			with self.assertRaises(ValueError):
				importer.employee_mappings(records, "Company", {"8": "HR-EMP-00002", "9": "HR-EMP-00002"})
			message = throw.call_args.args[0]
			for value in ("HR-EMP-00002", "8 (First Person)", "9 (Second Person)"):
				self.assertIn(value, message)

	def test_previous_file_mapping_cannot_be_reused_for_another_person(self):
		for code, name in (("2", "Different Person"), ("9", "Another Person")):
			remembered = {
				importer.mapping_key("Company", "2"): {
					"code": "2",
					"employee": "HR-EMP-00002",
					"report_name": "Original Person",
				}
			}
			with (
				patch.object(importer, "saved_mappings", return_value=remembered),
				patch.object(importer.frappe, "get_list", return_value=[self.employee()]),
				patch.object(importer.frappe, "throw", side_effect=ValueError) as throw,
			):
				with self.assertRaises(ValueError):
					importer.employee_mappings(
						[{"employee_code": code, "employee_name": name}], "Company", {code: "HR-EMP-00002"}
					)
				self.assertIn("previous", throw.call_args.args[0])

	def test_same_report_person_can_correct_saved_target(self):
		remembered = {
			importer.mapping_key("Company", "2"): {
				"code": "2",
				"employee": "OLD-EMP",
				"report_name": "Example Employee",
			}
		}
		with (
			patch.object(importer, "saved_mappings", return_value=remembered),
			patch.object(importer.frappe, "get_list", return_value=[self.employee()]),
		):
			rows, _ = importer.employee_mappings(
				[{"employee_code": "2", "employee_name": "Example Employee"}],
				"Company",
				{"2": "HR-EMP-00002"},
			)
			self.assertEqual(rows[0]["employee"], "HR-EMP-00002")

	def test_mapping_outside_company_rejected(self):
		with (
			patch.object(importer.frappe, "get_list", return_value=[self.employee()]),
			patch.object(importer.frappe, "throw", side_effect=ValueError),
		):
			with self.assertRaises(ValueError):
				importer.employee_mappings(
					[{"employee_code": "2", "employee_name": "Example Employee"}],
					"Company",
					{"2": "OTHER-COMPANY-EMP"},
				)

	def test_mapping_applies_department_scope(self):
		with (
			patch.object(
				importer,
				"get_import_scope",
				return_value={"can_view_others": True, "allowed_departments": ["HR"]},
			),
			patch.object(importer.frappe, "get_list", return_value=[self.employee()]) as get_list,
		):
			importer.employee_mappings(
				[{"employee_code": "2", "employee_name": "Example Employee"}], "Company"
			)
			self.assertEqual(get_list.call_args.kwargs["filters"]["department"], ["in", ["HR"]])


class TestSavedMappings(unittest.TestCase):
	def setUp(self):
		company = patch.object(importer.frappe, "get_doc", return_value=Mock())
		company.start()
		self.addCleanup(company.stop)

	def test_import_confirmation_saves_mappings(self):
		with (
			patch.object(importer, "check_access"),
			patch.object(importer, "save_mappings") as save,
			patch.object(importer.frappe, "generate_hash", return_value="token"),
			patch.object(importer.frappe, "cache", new=Mock()),
			patch.object(importer.frappe, "session", new=SimpleNamespace(user="hr@example.com")),
			patch.object(importer.frappe, "enqueue") as enqueue,
		):
			importer.import_report.__wrapped__("/private/files/report.xls", "Company", {"2": "EMP-1"})
			save.assert_called_once_with("/private/files/report.xls", "Company", {"2": "EMP-1"})
			enqueue.assert_called_once()

	def resolve(self, remembered, name="External Name", company="Company"):
		employee = frappe._dict(name="EMP-1", employee_name="ERP Name", employee_number="77")
		with (
			patch.object(
				importer,
				"get_import_scope",
				return_value={"can_view_others": True, "allowed_departments": None},
			),
			patch.object(importer.frappe, "get_list", return_value=[employee]),
			patch.object(importer, "saved_mappings", return_value=remembered),
		):
			rows, _ = importer.employee_mappings([{"employee_code": "2", "employee_name": name}], company)
			return rows[0]

	def test_remembered_manual_match_is_used_next_time(self):
		row = self.resolve(
			{importer.mapping_key("Company", "2"): {"employee": "EMP-1", "report_name": "External Name"}}
		)
		self.assertEqual(row["employee"], "EMP-1")
		self.assertTrue(row["saved"])

	def test_name_change_requires_review(self):
		row = self.resolve(
			{importer.mapping_key("Company", "2"): {"employee": "EMP-1", "report_name": "Old Name"}}
		)
		self.assertIsNone(row["employee"])
		self.assertIn("name changed", row["reason"])

	def test_inaccessible_saved_employee_not_disclosed(self):
		row = self.resolve(
			{
				importer.mapping_key("Company", "2"): {
					"employee": "PRIVATE-EMP",
					"report_name": "External Name",
				}
			}
		)
		self.assertIsNone(row["employee"])
		self.assertNotIn("PRIVATE-EMP", str(row))

	def test_mappings_are_company_specific(self):
		row = self.resolve(
			{
				importer.mapping_key("Other Company", "2"): {
					"employee": "EMP-1",
					"report_name": "External Name",
				}
			}
		)
		self.assertIsNone(row["employee"])
		self.assertEqual(importer.mapping_key("Company", "02"), importer.mapping_key("Company", "2"))

	def test_save_and_clear_use_private_persistent_storage(self):
		rows = [
			{"code": "2", "report_name": "External Name", "employee": "EMP-1"},
			{"code": "3", "report_name": "Other", "employee": None},
		]
		with (
			patch.object(importer, "check_access"),
			patch.object(importer.frappe, "has_permission", return_value=True),
			patch.object(importer, "load_report", return_value=([], [])),
			patch.object(importer, "employee_mappings", return_value=(rows, {})),
			patch.object(importer.frappe, "db", new=Mock()),
			patch("frappe.defaults.set_default") as save,
			patch("frappe.defaults.clear_default") as clear,
		):
			result = importer.save_mappings.__wrapped__("/private/files/test.xls", "Company", {})
			self.assertEqual(result["saved"], 1)
			self.assertEqual(save.call_args.args[2], importer.MAPPING_PARENT)
			clear.assert_called_once_with(
				importer.mapping_key("Company", "3"), parent=importer.MAPPING_PARENT
			)


class TestAccess(unittest.TestCase):
	def test_scope_denial_is_not_bypassed_by_roles(self):
		with (
			patch.object(importer.frappe, "only_for"),
			patch.object(importer, "get_import_scope", return_value={"can_view_others": False}),
			patch.object(importer.frappe, "throw", side_effect=PermissionError),
		):
			with self.assertRaises(PermissionError):
				importer.check_access()

	def test_active_workflow_prevents_direct_submission(self):
		with (
			patch.object(importer.frappe, "only_for"),
			patch.object(importer, "get_import_scope", return_value={"can_view_others": True}),
			patch.object(importer.frappe, "has_permission", return_value=True),
			patch.object(importer, "attendance_workflow", return_value="Approval"),
			patch.object(importer.frappe, "throw", side_effect=PermissionError),
		):
			with self.assertRaises(PermissionError):
				importer.check_access(submit=True)

	def test_capability_probe_fails_closed(self):
		with patch.object(importer, "check_access", side_effect=PermissionError):
			self.assertEqual(importer.access.__wrapped__(), {"allowed": False, "can_submit": False})


class TestImport(unittest.TestCase):
	def row(self):
		return {
			"employee": "HR-EMP-00002",
			"attendance_date": "2026-09-01",
			"status": "Present",
			"in_time": datetime(2026, 9, 1, 9),
			"out_time": datetime(2026, 9, 1, 18),
			"working_hours": 8,
			"shift": "ERPNext Shift",
			"source": "Report: employee 2, day 1",
			"error": None,
		}

	def test_existing_attendance_skips_day(self):
		with (
			patch.object(importer.frappe, "db", new=Mock()) as db,
			patch.object(importer.frappe, "get_doc") as get_doc,
		):
			db.exists.return_value = "ATT-001"
			self.assertEqual(importer.create_day(self.row(), "Company", False), {"skipped": True})
			get_doc.assert_not_called()

	def test_new_records_and_submission(self):
		checkin1, checkin2, attendance = Mock(), Mock(), Mock(name="Attendance")
		attendance.name = "ATT-001"
		with (
			patch.object(importer.frappe, "db", new=Mock()) as db,
			patch.object(importer.frappe, "get_doc") as get_doc,
		):
			db.exists.return_value = None
			db.get_value.return_value = None
			get_doc.side_effect = [checkin1, checkin2, attendance]
			result = importer.create_day(self.row(), "Company", True)
			self.assertEqual(result["checkins_created"], 2)
			attendance.submit.assert_called_once()
			self.assertEqual(get_doc.call_args_list[2].args[0]["shift"], "ERPNext Shift")
			self.assertEqual(get_doc.call_args_list[2].args[0]["working_hours"], 8)
			checkin1.db_set.assert_called_once_with({"attendance": "ATT-001", "skip_auto_attendance": 1})

	def test_reuse_synced_blank_direction_punch_and_draft(self):
		checkin, attendance = Mock(), Mock()
		attendance.name = "ATT-001"
		row = self.row()
		with (
			patch.object(importer.frappe, "db", new=Mock()) as db,
			patch.object(importer.frappe, "get_doc") as get_doc,
		):
			db.exists.return_value = None
			db.get_value.side_effect = [None, frappe._dict(name="CHK-1", log_type="", attendance=None), None]
			get_doc.side_effect = [checkin, Mock(), attendance]
			result = importer.create_day(row, "Company", False)
			self.assertEqual(result["checkins_reused"], 1)
			checkin.insert.assert_not_called()
			checkin.check_permission.assert_called_once_with("write")
			attendance.submit.assert_not_called()

	def test_invalid_punches_cause_no_database_action(self):
		for changes in (
			{"in_time": None},
			{"out_time": None},
			{"in_time": None, "out_time": None, "status": "Absent"},
			{"out_time": datetime(2026, 9, 1, 9)},
		):
			row = self.row()
			row.update(changes)
			with (
				patch.object(importer.frappe, "db", new=Mock()) as db,
				patch.object(importer.frappe, "get_doc") as get_doc,
			):
				self.assertEqual(importer.create_day(row, "Company", True), {"skipped": True})
				self.assertEqual(db.mock_calls, [])
				get_doc.assert_not_called()

	def test_failed_day_rolled_back_and_next_day_continues(self):
		rows = [self.row(), self.row()]
		with (
			patch.object(importer, "check_access"),
			patch.object(importer.frappe, "has_permission", return_value=True),
			patch.object(importer, "prepare", return_value=(rows, [], [])),
			patch.object(
				importer, "create_day", side_effect=[ValueError("Failed submit"), {"skipped": True}]
			),
			patch.object(importer.frappe, "db", new=Mock()) as db,
		):
			result = importer.execute_import("/private/files/test.xls", "Company", {})
			self.assertEqual(len(result["errors"]), 1)
			self.assertEqual(result["skipped"], 1)
			db.rollback.assert_called_once_with(save_point="essl_day")

	def test_shift_comes_from_assignment_or_default(self):
		employee = frappe._dict(name="EMP-1", default_shift="Default Shift")
		with patch.object(importer.frappe, "get_all", return_value=["Assigned Shift"]):
			self.assertEqual(importer.assigned_shift(employee, self.row()), "Assigned Shift")
		with patch.object(importer.frappe, "get_all", return_value=[]):
			self.assertEqual(importer.assigned_shift(employee, self.row()), "Default Shift")

	def test_unresolved_mapping_blocks_all_writes(self):
		row = self.row()
		row["error"] = "Employee mapping required"
		with (
			patch.object(importer, "check_access"),
			patch.object(importer.frappe, "has_permission", return_value=True),
			patch.object(importer, "prepare", return_value=([row], [], [])),
			patch.object(importer.frappe, "throw", side_effect=ValueError),
			patch.object(importer, "create_day") as create,
		):
			with self.assertRaises(ValueError):
				importer.execute_import("/private/files/test.xls", "Company", {})
			create.assert_not_called()


class TestImportJob(unittest.TestCase):
	def test_result_is_published_after_commit(self):
		with (
			patch.object(importer.frappe, "cache", new=Mock()) as cache,
			patch.object(importer.frappe, "session", new=SimpleNamespace(user="hr@example.com")),
			patch.object(importer.frappe, "db", new=Mock()) as db,
			patch.object(importer, "execute_import", return_value={"attendance_created": 1}),
		):
			cache.set_value.side_effect = lambda key, state, **kwargs: (
				db.commit.assert_called_once() if state["status"] == "Completed" else None
			)
			importer.run_import_job("token")
			self.assertEqual(cache.set_value.call_args.args[1]["status"], "Completed")

	def test_job_failure_rolls_back(self):
		with (
			patch.object(importer.frappe, "cache", new=Mock()) as cache,
			patch.object(importer.frappe, "session", new=SimpleNamespace(user="hr@example.com")),
			patch.object(importer.frappe, "db", new=Mock()) as db,
			patch.object(importer, "execute_import", side_effect=ValueError("Invalid mapping")),
			patch.object(importer.frappe, "log_error"),
			patch.object(importer.frappe, "get_traceback"),
		):
			importer.run_import_job("token")
			db.rollback.assert_called_once()
			self.assertEqual(cache.set_value.call_args.args[1]["status"], "Failed")

	def test_other_user_cannot_read_result(self):
		with (
			patch.object(importer, "check_access"),
			patch.object(importer.frappe, "cache", new=Mock()) as cache,
			patch.object(importer.frappe, "session", new=SimpleNamespace(user="other@example.com")),
			patch.object(importer.frappe, "throw", side_effect=PermissionError),
		):
			cache.get_value.return_value = {"user": "hr@example.com", "status": "Completed"}
			with self.assertRaises(PermissionError):
				importer.import_status.__wrapped__("token")


if __name__ == "__main__":
	unittest.main()
