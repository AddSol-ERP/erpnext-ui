import { get } from "../services/api";

/**
 * Fetch the monthly attendance matrix.
 *
 * Backed by the built-in "Monthly Attendance Sheet" report (run server-side),
 * so weekly off / holiday days are computed per employee exactly like ERPNext
 * does — from the employee's / company's Holiday List.
 *
 * Args:
 *   year, month (int): calendar month to fetch.
 *   department, employee (str, optional): filters (server-scoped per user).
 *
 * Returns:
 *   {
 *     company, year, month,
 *     days: ["YYYY-MM-DD", ...],
 *     rows: [{ employee, employee_name, department, designation,
 *              statuses: { "YYYY-MM-DD": "P" | "A" | "HD/A" | "HD/P" |
 *                          "WFH" | "L" | "WO" | "H" | "" } }],
 *     is_hr, is_hod, can_view_others
 *   }
 */
export async function fetchMonthlyAttendance({ year, month, department, employee }) {
  const params = { year, month };
  if (department) params.department = department;
  if (employee) params.employee = employee;

  const res = await get("method/erpnext_ui.api.monthly_attendance", params);
  return res.message || {};
}

/**
 * Build a Set of "YYYY-MM-DD" for one employee row where the status is one
 * of `statuses` (single status string or array), e.g. "WO" for weekly off.
 */
export function daySetForRow(row, statuses) {
  const wanted = new Set(Array.isArray(statuses) ? statuses : [statuses]);
  const set = new Set();
  Object.entries(row?.statuses || {}).forEach(([date, status]) => {
    if (wanted.has(status)) set.add(date);
  });
  return set;
}