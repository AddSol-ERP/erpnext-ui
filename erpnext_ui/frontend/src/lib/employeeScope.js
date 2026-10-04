import { get } from "../services/api";

/**
 * Resolves which Employee the logged-in user is filing requests for.
 *
 * Why this exists
 * ---------------
 * The request forms used to auto-select an Employee with this heuristic:
 *
 *     get_list(Employee, fields: ["name"], limit_page_length: 2)
 *     if (list.length === 1) setEmployee(list[0].name)
 *
 * That is wrong in both directions:
 *   - a self-only user who can read two Employee rows (e.g. an inactive record
 *     or a linked relative) gets nothing auto-filled, and
 *   - a manager is handed whichever employee happened to sort first.
 *
 * Identity is instead resolved the same way the server does it in
 * `erpnext_ui.api._get_scope`: `Employee.user_id == frappe.session.user`.
 *
 * `canSelect` reports whether the user may file on behalf of somebody else.
 * The employee picker is a plain permission-filtered Frappe link, so when this
 * is true the user already sees exactly the Employees they are allowed to
 * read -- no extra filtering is required.
 */

const EMPTY_SCOPE = {
  user: "",
  myEmployee: "",
  myCompany: "",
  canSelect: false,
  loaded: false,
};

/**
 * @returns {Promise<{user: string, myEmployee: string, myCompany: string,
 *                    canSelect: boolean, loaded: boolean}>}
 */
export async function fetchEmployeeScope() {
  let user = "";

  try {
    const res = await get("method/erpnext_ui.api.get_current_user");
    user = res?.user || res?.message?.user || "";
  } catch {
    return { ...EMPTY_SCOPE, loaded: true };
  }

  if (!user) return { ...EMPTY_SCOPE, loaded: true };

  // 1. The user's own Employee record, matched on user_id. `ignore_permissions`
  //    is deliberately NOT used: a user must always be able to see their own
  //    record, and Employee Self Service grants exactly that.
  let myEmployee = "";
  let myCompany = "";

  try {
    const res = await get("method/frappe.client.get_list", {
      doctype: "Employee",
      fields: JSON.stringify(["name", "company"]),
      filters: JSON.stringify({ user_id: user }),
      limit_page_length: 1,
    });

    const list = res?.message || [];
    if (list.length) {
      myEmployee = list[0].name || "";
      myCompany = list[0].company || "";
    }
  } catch {
    // Leave myEmployee empty; the form will surface "Employee is required".
  }

  // 2. Can this user see anybody else? Probe with a second readable Employee.
  //    `limit_page_length: 2` is a cheap existence check -- the permission
  //    system has already filtered the list, so a second row proves access to
  //    another person's record.
  let canSelect = false;

  try {
    const res = await get("method/frappe.client.get_list", {
      doctype: "Employee",
      fields: JSON.stringify(["name"]),
      filters: JSON.stringify({ status: "Active" }),
      limit_page_length: 2,
    });

    const list = res?.message || [];
    canSelect = list.some((row) => row.name !== myEmployee);
  } catch {
    canSelect = false;
  }

  return { user, myEmployee, myCompany, canSelect, loaded: true };
}

/**
 * Applies the resolved scope to a form document.
 *
 * Returns the fields that should be merged in, so callers stay in control of
 * their own state updates:
 *   - self-only  -> employee is pinned to their own record
 *   - multi       -> employee defaults to their own record but stays editable
 *
 * @param {object} doc current form document
 * @param {object} scope result of fetchEmployeeScope()
 * @param {object} extra additional fields to merge (e.g. {company, posting_date})
 */
export function applyEmployeeScope(doc, scope, extra = {}) {
  const patch = { ...extra };

  // Never clobber an employee already chosen by the user (edit mode).
  if (!doc.employee && scope.myEmployee) {
    patch.employee = scope.myEmployee;
  }

  // Self-only users are pinned: force the value even if something tried to
  // set a different one, so the lock cannot be bypassed from the UI.
  if (!scope.canSelect && scope.myEmployee) {
    patch.employee = scope.myEmployee;
  }

  return patch;
}

/**
 * True when the employee field must be rendered as a read-only value.
 */
export function isEmployeeLocked(scope) {
  return !!scope.loaded && !scope.canSelect && !!scope.myEmployee;
}

/**
 * Fetches the extra fields needed to pre-fill a request from its Employee.
 *
 * @param {string} employee
 * @param {string[]} fields
 * @returns {Promise<object>} empty object on failure
 */
export async function fetchEmployeeFields(employee, fields) {
  if (!employee || !fields?.length) return {};

  try {
    const res = await get(`resource/Employee/${employee}`, {
      fields: JSON.stringify(fields),
    });
    return res?.data || {};
  } catch {
    return {};
  }
}
