"""Read eSSL Detailed Work Duration reports without inferring missing punches."""

import re
from datetime import datetime, time, timedelta

import xlrd

STATUSES = {
	"P": "Present",
	"A": "Absent",
	"½P": "Half Day",
	"H½P": "Half Day",
	"WOP": "Present",
	"HP": "Present",
}
DAY_OFF = {"WO", "H"}


def text(value):
	if isinstance(value, float) and value.is_integer():
		return str(int(value))
	return str(value or "").strip()


def clock(value):
	if value in ("", None):
		return None
	if isinstance(value, (float, int)):
		seconds = round(value * 86400)
		if not 0 <= seconds < 86400:
			raise ValueError("Invalid Excel time")
		return (datetime.min + timedelta(seconds=seconds)).time()
	parts = text(value).split(":")
	if len(parts) not in (2, 3):
		raise ValueError("Invalid punch time")
	return time(*(int(part) for part in parts))


def duration(value):
	if value in ("", None):
		return 0.0
	if isinstance(value, (float, int)):
		return value * 24
	parts = text(value).split(":")
	if len(parts) not in (2, 3):
		raise ValueError("Invalid work duration")
	hours, minutes = int(parts[0]), int(parts[1])
	seconds = int(parts[2]) if len(parts) == 3 else 0
	if hours < 0 or not 0 <= minutes < 60 or not 0 <= seconds < 60:
		raise ValueError("Invalid work duration")
	return hours + minutes / 60 + seconds / 3600


def parse_report(content):
	book = xlrd.open_workbook(file_contents=content)
	records, errors = [], []
	for sheet in book.sheets():
		if sheet.nrows * sheet.ncols > 2_000_000:
			raise ValueError("Report is too large; upload a smaller report")
		rows = [sheet.row_values(i) for i in range(sheet.nrows)]
		period = None
		columns = {}
		employee = None
		block = {}

		def flush():
			if employee is None:
				return
			if not period or not columns or not all(key in block for key in ("Status", "InTime", "OutTime")):
				raise ValueError(f"Incomplete employee block in {sheet.name}: {employee[0]}")
			for col, day in columns.items():
				status = text(block["Status"][col])
				if not status:
					continue
				source = f"{sheet.name}: employee {employee[0]}, day {day}"
				try:
					attendance_date = period[0].replace(day=day)
					if not period[0] <= attendance_date <= period[1]:
						raise ValueError("Day is outside report period")
					in_clock = clock(block["InTime"][col])
					out_clock = clock(block["OutTime"][col])
					in_time = datetime.combine(attendance_date, in_clock) if in_clock else None
					out_time = datetime.combine(attendance_date, out_clock) if out_clock else None
					if in_time and out_time and out_time < in_time:
						out_time += timedelta(days=1)
					if status in DAY_OFF and not (in_time or out_time):
						continue
					mapped = STATUSES.get(status)
					if status in DAY_OFF:
						mapped = "Present"
					if not mapped:
						raise ValueError(f"Unsupported status: {status}")
					records.append(
						{
							"employee_code": employee[0],
							"employee_name": employee[1],
							"attendance_date": attendance_date.isoformat(),
							"status": mapped,
							"source_status": status,
							"in_time": in_time,
							"out_time": out_time,
							"working_hours": duration(block.get("Duration", [""] * sheet.ncols)[col]),
							"shift_code": text(block.get("Shift", [""] * sheet.ncols)[col]),
							"source": source,
						}
					)
				except (ValueError, TypeError) as exc:
					errors.append({"source": source, "error": str(exc)})

		for row in rows:
			label = text(row[0]) if row else ""
			if label == "Employee:":
				flush()
				descriptor = next((text(v) for v in row[1:] if ":" in text(v)), "")
				code, separator, name = descriptor.partition(":")
				if not separator or not code.strip() or not name.strip():
					raise ValueError(f"Invalid employee header in {sheet.name}")
				employee = (code.strip(), name.strip())
				block = {}
			elif label == "Days":
				flush()
				employee = None
				columns = {}
				for col, value in enumerate(row):
					match = re.fullmatch(r"(\d{1,2})\s+\S+", text(value))
					if match:
						day = int(match[1])
						if day in columns.values():
							raise ValueError("Duplicate day column")
						columns[col] = day
			elif label in ("Status", "InTime", "OutTime", "Duration", "Shift") and employee:
				block[label] = row
			else:
				for value in row:
					match = re.fullmatch(
						r"([A-Za-z]{3} \d{1,2} \d{4})\s+To\s+([A-Za-z]{3} \d{1,2} \d{4})", text(value)
					)
					if match:
						start, end = (datetime.strptime(v, "%b %d %Y").date() for v in match.groups())
						if start > end or (start.year, start.month) != (end.year, end.month):
							raise ValueError("Only single-month reports are supported")
						period = (start, end)
		flush()
	if not records:
		raise ValueError(
			"No daily attendance records found. Use the eSSL Detailed Work Duration .xls report."
		)
	seen = set()
	for record in records:
		key = (record["employee_code"], record["attendance_date"])
		if key in seen:
			raise ValueError(f"Duplicate employee/day in report: {key}")
		seen.add(key)
	return records, errors
