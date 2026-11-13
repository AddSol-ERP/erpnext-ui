"""Permission-checked preview and import for eSSL monthly work duration reports."""

import hashlib
import json
import re
from datetime import datetime, time
from html import escape

import frappe
from frappe.utils import cint, getdate
from xlrd import XLRDError

from erpnext_ui.essl_report import parse_report

# A private DefaultValue parent keeps mappings out of global/user boot defaults.
# This app deliberately uses stock doctypes rather than adding a mapping doctype.
MAPPING_PARENT = "__erpnext_ui_essl_employee_mappings"


def mapping_key(company, code):
	return hashlib.sha256(json.dumps([company, normalize_code(code)]).encode()).hexdigest()


def saved_mappings(company, sources=None):
	keys = [mapping_key(company, code) for code in sources] if sources is not None else None
	if keys == []:
		return {}
	filters = {"parent": MAPPING_PARENT}
	if keys is not None:
		filters["defkey"] = ["in", keys]
	rows = frappe.get_all(
		"DefaultValue",
		filters=filters,
		fields=["defkey", "defvalue"],
	)
	result = {}
	for row in rows:
		try:
			value = json.loads(row.defvalue)
			if isinstance(value, dict) and value.get("company") == company:
				result[row.defkey] = value
		except (ValueError, TypeError):
			continue
	return result


def normalize_name(value):
	return " ".join(re.findall(r"\w+", (value or "").casefold()))


def normalize_code(value):
	value = str(value or "").strip().casefold()
	return str(int(value)) if value.isdigit() else value


def suggest_employee(code, name, employees):
	"""Only suggest unique exact names; conflicting code/name matches need review."""
	names = [emp for emp in employees if normalize_name(emp.employee_name) == normalize_name(name)]
	codes = []
	for emp in employees:
		identifiers = [emp.name, emp.get("employee_number")]
		suffix = re.search(r"(?:^|[-_])(\d+)$", emp.name)
		if suffix:
			identifiers.append(suffix[1])
		if normalize_code(code) in {normalize_code(value) for value in identifiers if value}:
			codes.append(emp)
	if len(names) == 1 and (not codes or {emp.name for emp in codes} == {names[0].name}):
		return names[0].name, "Code and name match" if codes else "Exact name match"
	return None, "Conflicting or ambiguous match" if names or codes else "No exact match"


def check_access(submit=False):
	frappe.only_for(("HR User", "HR Manager", "System Manager"))
	if not get_import_scope().get("can_view_others"):
		frappe.throw("HR employee access required for attendance import", frappe.PermissionError)
	for doctype in ("Employee", "Attendance", "Employee Checkin"):
		if not frappe.has_permission(doctype, "read"):
			frappe.throw(f"Read permission required for {doctype}", frappe.PermissionError)
	if submit and not frappe.has_permission("Attendance", "submit"):
		frappe.throw("Submit permission required for Attendance", frappe.PermissionError)
	if submit and attendance_workflow():
		frappe.throw("Create drafts and submit Attendance through its configured workflow")


def get_import_scope():
	from erpnext_ui.api import _get_scope

	return _get_scope(frappe.session.user)


def attendance_workflow():
	return frappe.db.get_value("Workflow", {"document_type": "Attendance", "is_active": 1}, "name")


@frappe.whitelist(allow_guest=False)
def access():
	"""Fail-closed capability check; every data/write endpoint rechecks access."""
	try:
		check_access()
		return {
			"allowed": True,
			"can_submit": bool(frappe.has_permission("Attendance", "submit"))
			and not bool(attendance_workflow()),
		}
	except Exception:
		return {"allowed": False, "can_submit": False}


def load_report(file_url):
	if not file_url or not file_url.startswith(("/private/files/", "/files/")):
		frappe.throw("Upload a local eSSL .xls file first")
	file = frappe.get_doc("File", {"file_url": file_url})
	file.check_permission("read")
	if not (file.file_name or "").lower().endswith(".xls"):
		frappe.throw("Use the eSSL Detailed Work Duration .xls report")
	content = file.get_content()
	if isinstance(content, str) or len(content) > 5 * 1024 * 1024:
		frappe.throw("Upload a binary .xls report smaller than 5 MB")
	try:
		records, errors = parse_report(content)
	except (ValueError, TypeError, IndexError, EOFError, XLRDError) as exc:
		frappe.throw(f"Cannot read eSSL report: {exc}")
	if len(records) > 10000:
		frappe.throw("Limit each import to 10,000 employee days")
	return records, errors


def employee_mappings(records, company, mapping=None):
	if not company:
		frappe.throw("Select a company")
	frappe.get_doc("Company", company).check_permission("read")
	scope = get_import_scope()
	if not scope.get("can_view_others"):
		frappe.throw("Employee access denied", frappe.PermissionError)
	filters = {"company": company, "status": "Active"}
	if scope.get("allowed_departments") is not None:
		filters["department"] = ["in", scope["allowed_departments"]]
	employees = frappe.get_list(
		"Employee",
		filters=filters,
		fields=["name", "employee_name", "employee_number", "date_of_joining", "default_shift"],
		limit_page_length=0,
	)
	allowed = {emp.name: emp for emp in employees}
	sources = {}
	for row in records:
		code = row["employee_code"]
		if code in sources and sources[code] != row["employee_name"]:
			frappe.throw(f"Employee code {code} has multiple names in the report")
		sources[code] = row["employee_name"]
	mappings = []
	# Check both directions across all previous files, not only codes in this upload.
	remembered = saved_mappings(company)
	for code, name in sources.items():
		employee, reason = suggest_employee(code, name, employees)
		saved = remembered.get(mapping_key(company, code))
		is_saved = False
		if saved:
			if normalize_name(saved.get("report_name")) != normalize_name(name):
				employee, reason = None, "Report name changed; review saved mapping"
			elif saved.get("employee") not in allowed:
				employee, reason = None, "Saved employee is inactive or inaccessible; select again"
			else:
				employee, reason = saved["employee"], "Saved mapping"
				is_saved = True
		if mapping is not None:
			employee = mapping.get(code)
			reason = "Selected mapping" if employee else "Select an ERPNext employee"
			is_saved = bool(
				saved
				and employee == saved.get("employee")
				and normalize_name(saved.get("report_name")) == normalize_name(name)
			)
		if employee and employee not in allowed:
			frappe.throw(f"Employee mapped to {code} is not an accessible active employee in this company")
		if employee:
			conflict = None
			if saved and normalize_name(saved.get("report_name")) != normalize_name(name):
				conflict = f"Report code {code} was saved for a different report employee. Correct the source code or clear its previous mapping before reassigning it."
			updates = {mapping_key(company, item): target for item, target in (mapping or {}).items()}
			for other_key, previous in remembered.items():
				if other_key == mapping_key(company, code) or previous.get("employee") != employee:
					continue
				if other_key in updates and updates[other_key] != employee:
					continue
				previous_code = previous.get("code", "another report code")
				conflict = f"{employee} is already mapped to {previous_code} ({previous.get('report_name', '')}) in a previous file for {company}. Report employee {code} ({name}) must use a different ERPNext Employee, or the previous mapping must be cleared first."
				break
			if conflict:
				if mapping is not None:
					frappe.throw(escape(conflict))
				employee, reason, is_saved = None, conflict, False
		mappings.append(
			{"code": code, "report_name": name, "employee": employee, "reason": reason, "saved": is_saved}
		)
	targets = [row["employee"] for row in mappings if row["employee"]]
	if len(targets) != len(set(targets)):
		duplicates = {target for target in targets if targets.count(target) > 1}
		if mapping is not None:
			conflicts = []
			for target in sorted(duplicates):
				reports = ", ".join(
					f"{row['code']} ({row['report_name']})" for row in mappings if row["employee"] == target
				)
				conflicts.append(f"{target}: report employees {reports}")
			frappe.throw(
				"Each report employee must map to a different ERPNext Employee. "
				"Correct these conflicting selections: " + escape("; ".join(conflicts))
			)
		for row in mappings:
			if row["employee"] in duplicates:
				row.update(
					employee=None,
					saved=False,
					reason="Multiple report employees suggest the same match; select manually",
				)
	return mappings, allowed


@frappe.whitelist(allow_guest=False, methods=["POST"])
def save_mappings(file_url, company, employee_map):
	"""Save reviewed company/code mappings after rechecking employee scope and source."""
	from frappe.defaults import clear_default, set_default

	check_access()
	if not frappe.has_permission("Attendance", "create"):
		frappe.throw("Attendance create permission required to save import mappings", frappe.PermissionError)
	records, _errors = load_report(file_url)
	mapping = frappe.parse_json(employee_map)
	if not isinstance(mapping, dict):
		frappe.throw("Employee mappings must be an object")
	# Serialise first-time writes as well as updates; DefaultValue has no unique key.
	frappe.db.get_value("Company", company, "name", for_update=True)
	rows, _employees = employee_mappings(records, company, mapping)
	count = 0
	for row in rows:
		key = mapping_key(company, row["code"])
		if row["employee"]:
			value = {
				"company": company,
				"code": row["code"],
				"report_name": row["report_name"],
				"employee": row["employee"],
			}
			set_default(key, json.dumps(value), MAPPING_PARENT)
			count += 1
		else:
			clear_default(key, parent=MAPPING_PARENT)
	return {"saved": count}


def assigned_shift(employee, row):
	"""Use ERPNext assignments/defaults on the attendance date, never report codes."""
	assignments = frappe.get_all(
		"Shift Assignment",
		filters={
			"employee": employee.name,
			"docstatus": 1,
			"status": "Active",
			"start_date": ["<=", row["attendance_date"]],
		},
		or_filters=[["end_date", ">=", row["attendance_date"]], ["end_date", "is", "not set"]],
		pluck="shift_type",
	)
	shifts = set(assignments)
	if len(shifts) == 1:
		return next(iter(shifts))
	if len(shifts) > 1:
		from hrms.hr.doctype.shift_assignment.shift_assignment import get_employee_shift

		timestamp = row["in_time"] or datetime.combine(getdate(row["attendance_date"]), time(12))
		shift = get_employee_shift(employee.name, timestamp, consider_default_shift=False)
		if shift and shift.shift_type.name in shifts:
			return shift.shift_type.name
		raise ValueError("Multiple shift assignments: ERPNext cannot determine a unique shift")
	return employee.default_shift or None


def invalid_log_reason(row):
	if not (row.get("in_time") and row.get("out_time")):
		return "Missing IN or OUT punch; no records will be created"
	if row["out_time"] <= row["in_time"]:
		return "Invalid punch interval; no records will be created"
	if row["status"] == "Absent":
		return "Absent status conflicts with supplied punches; no records will be created"
	return None


def prepare(file_url, company, employee_map=None):
	records, errors = load_report(file_url)
	mapping = frappe.parse_json(employee_map) if employee_map is not None else None
	if mapping is not None and not isinstance(mapping, dict):
		frappe.throw("Employee mappings must be an object")
	mappings, employees = employee_mappings(records, company, mapping)
	selected = {item["code"]: item["employee"] for item in mappings}
	shift_cache = {}
	for row in records:
		row["employee"] = selected[row["employee_code"]]
		row["warnings"] = []
		row["error"] = None
		row["shift"] = None
		row["existing_attendance"] = None
		row["existing_checkins"] = []
		row["skip_reason"] = invalid_log_reason(row)
		row["action"] = "Skip invalid logs" if row["skip_reason"] else "Create"
		if row["skip_reason"]:
			row["warnings"].append(row["skip_reason"])
			continue
		if not row["employee"]:
			row["error"] = "Employee mapping required"
			continue
		employee = employees[row["employee"]]
		try:
			if employee.date_of_joining and getdate(row["attendance_date"]) < getdate(
				employee.date_of_joining
			):
				raise ValueError("Attendance date is before employee joining date")
			key = (employee.name, row["attendance_date"], row["in_time"])
			if key not in shift_cache:
				shift_cache[key] = assigned_shift(employee, row)
			row["shift"] = shift_cache[key]
		except ValueError as exc:
			row["error"] = str(exc)
		if not row["shift"]:
			row["warnings"].append("No ERPNext shift assignment or default shift")
		row["existing_attendance"] = frappe.db.get_value(
			"Attendance",
			{
				"employee": employee.name,
				"attendance_date": row["attendance_date"],
				"docstatus": ["!=", 2],
			},
			"name",
		)
		for field, log_type in (("in_time", "IN"), ("out_time", "OUT")):
			if row[field]:
				existing = frappe.db.get_value(
					"Employee Checkin",
					{
						"employee": employee.name,
						"time": row[field],
					},
					["name", "log_type", "attendance"],
					as_dict=True,
				)
				if existing:
					row["existing_checkins"].append(existing.name)
					if existing.log_type and existing.log_type != log_type:
						row["error"] = "An existing checkin has a conflicting punch direction"
					if existing.attendance and existing.attendance != row["existing_attendance"]:
						row["error"] = "A punch is linked to a different Attendance record"
		# Keep existing Attendance and its checkins unchanged; report the whole day as skipped.
		row["action"] = "Skip existing attendance" if row["existing_attendance"] else "Create"
	return records, errors, mappings


@frappe.whitelist(allow_guest=False)
def preview(file_url, company, employee_map=None):
	check_access()
	records, errors, mappings = prepare(file_url, company, employee_map)
	return {
		"employees": mappings,
		"rows": records,
		"errors": errors,
		"blocked": any(row["error"] for row in records),
	}


def create_day(row, company, submit):
	# Guard before any database operation, including when called outside the preview flow.
	if invalid_log_reason(row):
		return {"skipped": True}
	# Lock the employee so simultaneous imports cannot create duplicate punches/days.
	frappe.db.get_value("Employee", row["employee"], "name", for_update=True)
	if frappe.db.exists(
		"Attendance",
		{"employee": row["employee"], "attendance_date": row["attendance_date"], "docstatus": ["!=", 2]},
	):
		return {"skipped": True}
	checkins = []
	for field, log_type in (("in_time", "IN"), ("out_time", "OUT")):
		if not row[field]:
			continue
		existing = frappe.db.get_value(
			"Employee Checkin",
			{"employee": row["employee"], "time": row[field]},
			["name", "log_type", "attendance"],
			as_dict=True,
		)
		if existing:
			if existing.attendance or (existing.log_type and existing.log_type != log_type):
				raise ValueError(
					"Existing punch is linked or has a conflicting direction; refresh the preview"
				)
			# Reuse synced punches without overwriting their timestamps or directions.
			checkin = frappe.get_doc("Employee Checkin", existing.name)
			checkin.check_permission("write")
		else:
			checkin = frappe.get_doc(
				{
					"doctype": "Employee Checkin",
					"employee": row["employee"],
					"time": row[field],
					"log_type": log_type,
					"skip_auto_attendance": 1,
					"device_id": "eSSL report import",
				}
			)
			checkin.insert()
		checkins.append((checkin, not existing))
	attendance = frappe.get_doc(
		{
			"doctype": "Attendance",
			"employee": row["employee"],
			"company": company,
			"attendance_date": getdate(row["attendance_date"]),
			"status": row["status"],
			"shift": row["shift"],
			"in_time": row["in_time"],
			"out_time": row["out_time"],
			"working_hours": row["working_hours"],
		}
	)
	attendance.insert()
	if submit:
		attendance.submit()
	for checkin, _created in checkins:
		checkin.db_set({"attendance": attendance.name, "skip_auto_attendance": 1})
	return {
		"attendance": attendance.name,
		"checkins_created": sum(created for _, created in checkins),
		"checkins_reused": sum(not created for _, created in checkins),
	}


def execute_import(file_url, company, employee_map, submit_attendance=0):
	submit = bool(cint(submit_attendance))
	check_access(submit)
	for doctype in ("Attendance", "Employee Checkin"):
		if not frappe.has_permission(doctype, "create"):
			frappe.throw(f"Create permission required for {doctype}", frappe.PermissionError)
	records, errors, _mappings = prepare(file_url, company, employee_map)
	if any(row["error"] for row in records):
		frappe.throw("Resolve all errors and employee mappings in the preview before importing")
	result = {
		"attendance_created": 0,
		"checkins_created": 0,
		"checkins_reused": 0,
		"skipped": len(errors),
		"errors": list(errors),
	}
	for row in records:
		frappe.db.savepoint("essl_day")
		try:
			outcome = create_day(row, company, submit)
			if outcome.get("skipped"):
				result["skipped"] += 1
			else:
				result["attendance_created"] += 1
				result["checkins_created"] += outcome["checkins_created"]
				result["checkins_reused"] += outcome["checkins_reused"]
		except Exception as exc:
			frappe.db.rollback(save_point="essl_day")
			result["errors"].append({"source": row["source"], "error": str(exc)})
	return result


@frappe.whitelist(allow_guest=False, methods=["POST"])
def import_report(file_url, company, employee_map, submit_attendance=0):
	check_access(bool(cint(submit_attendance)))
	# Import is an explicit confirmation of the reviewed employee selections.
	save_mappings(file_url, company, employee_map)
	token = frappe.generate_hash(length=20)
	frappe.cache.set_value(
		f"essl_import:{token}",
		{
			"user": frappe.session.user,
			"status": "Queued",
		},
		expires_in_sec=86400,
	)
	frappe.enqueue(
		run_import_job,
		queue="long",
		timeout=1800,
		enqueue_after_commit=True,
		token=token,
		file_url=file_url,
		company=company,
		employee_map=employee_map,
		submit_attendance=submit_attendance,
	)
	return {"token": token}


def run_import_job(token, **kwargs):
	key = f"essl_import:{token}"
	state = {"user": frappe.session.user, "status": "Running"}
	frappe.cache.set_value(key, state, expires_in_sec=86400)
	try:
		result = execute_import(**kwargs)
		# Publish completion only after records are committed, so a retry sees them.
		frappe.db.commit()
		state.update(status="Completed", result=result)
	except Exception as exc:
		frappe.db.rollback()
		state.update(status="Failed", error=str(exc))
		frappe.log_error(title="eSSL report import failed", message=frappe.get_traceback())
	frappe.cache.set_value(key, state, expires_in_sec=86400)


@frappe.whitelist(allow_guest=False)
def import_status(token):
	check_access()
	state = frappe.cache.get_value(f"essl_import:{token}")
	if not state or state.get("user") != frappe.session.user:
		frappe.throw("Import not found or not accessible", frappe.PermissionError)
	return state
