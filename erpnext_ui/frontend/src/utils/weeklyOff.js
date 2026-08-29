import { get } from "../services/api";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Normalize any date value to a "YYYY-MM-DD" string.
const toDateString = (value) => {
  if (typeof value === "string" && DATE_RE.test(value)) return value;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

const isInMonth = (dateStr, month) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getFullYear() === month.getFullYear() &&
    d.getMonth() === month.getMonth()
  );
};

/**
 * Build a weekly-off map: { employee: Set<"YYYY-MM-DD"> }
 *
 * `employees` is an array of employee records that must contain `name`
 * and (optionally) `holiday_list`. Weekly-off dates are read from the
 * employee's Holiday List children where `weekly_off` is checked.
 */
export async function fetchWeeklyOffMap(month, employees) {
  const map = {};

  const withHolidayList = (employees || []).filter((e) => e.holiday_list);
  if (!withHolidayList.length) return map;

  const holidayListNames = [
    ...new Set(withHolidayList.map((e) => e.holiday_list)),
  ];

  let lists = [];
  try {
    const res = await get("resource/Holiday List", {
      fields: JSON.stringify(["name", "holidays"]),
      filters: JSON.stringify([["name", "in", holidayListNames]]),
      limit_page_length: 200,
    });
    lists = res.data || [];
  } catch (e) {
    console.error("Failed to load holiday lists for weekly off:", e);
    return map;
  }

  // holiday list name -> Set of weekly-off dates within the viewed month
  const weeklyOffByList = {};
  lists.forEach((list) => {
    const dates = new Set();
    (list.holidays || []).forEach((h) => {
      if (h.weekly_off && h.holiday_date && isInMonth(h.holiday_date, month)) {
        const dateStr = toDateString(h.holiday_date);
        if (dateStr) dates.add(dateStr);
      }
    });
    if (dates.size) weeklyOffByList[list.name] = dates;
  });

  withHolidayList.forEach((e) => {
    const dates = weeklyOffByList[e.holiday_list];
    if (dates) map[e.name] = dates;
  });

  return map;
}

/**
 * Convenience wrapper for single-employee views (e.g. the calendar).
 * Resolves the employee's holiday list and returns their weekly-off dates.
 */
export async function fetchEmployeeWeeklyOff(month, employeeName) {
  if (!employeeName) return new Set();

  try {
    const res = await get("resource/Employee", {
      fields: JSON.stringify(["name", "holiday_list"]),
      filters: JSON.stringify([["name", "=", employeeName]]),
      limit_page_length: 1,
    });

    const emp = (res.data || [])[0];
    if (!emp || !emp.holiday_list) return new Set();

    const map = await fetchWeeklyOffMap(month, [{ name: emp.name, holiday_list: emp.holiday_list }]);
    return map[emp.name] || new Set();
  } catch (e) {
    console.error("Failed to load weekly off for employee:", e);
    return new Set();
  }
}