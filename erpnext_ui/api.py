import frappe
from frappe.utils import cint, flt

HR_ROLES = {"HR Manager", "HR User", "Administrator"}


# Doctypes that back the SPA's Approvals hub. Kept server-side deliberately:
# this endpoint is the security boundary, so the list of doctypes whose
# existence is disclosed must not live in JavaScript a caller could edit.
SPA_APPROVAL_DOCTYPES = (
    "Purchase Order",
    "Expense Claim",
    "Leave Application",
    "Quotation",
    "Overtime Log",
)

# Report key -> the doctype whose read permission governs that report. The
# frontend sends/uses these keys, so keep them aligned with the `key` values in
# frontend/src/pages/Reports/index.jsx.
#
# - attendance delegates to HRMS/ERPNext's built-in Monthly Attendance Sheet,
#   which reads `Attendance`.
# - overtime is a plain `resource/Overtime Log` list view.
# - leave-balance is computed from `Leave Allocation` + `Leave Application`.
SPA_REPORT_DOCTYPES = {
    "attendance": "Attendance",
    "overtime": "Overtime Log",
    "leave-balance": "Leave Allocation",
}


def _can_read(doctype):
    """Whether the session user holds doctype-level read permission.

    Fails closed: any error resolving the permission (unknown/child doctype,
    permission cache miss, thrown validation) counts as "no access" so a
    backend hiccup can never widen what the SPA reveals.
    """
    try:
        return bool(frappe.has_permission(doctype, "read"))
    except Exception:
        return False


@frappe.whitelist(allow_guest=False)
def get_ui_access():
    """Return real doctype read permissions for the SPA's gated surfaces.

    The frontend used to decide this from a hardcoded role-name table
    (frontend/src/config/moduleAccess.js) with `"*"` for ESS, Approvals and
    Reports, which meant every authenticated user was shown the Approvals hub
    and the Reports page regardless of whether their roles could read the
    underlying doctypes. That is a disclosure problem, not a cosmetic one: the
    tiles leaked the existence of Purchase Orders, Expenses and payroll
    documents to people who cannot open a single one.

    Reading `frappe.has_permission(doctype, "read")` instead makes this track
    whatever Role permissions are configured in ERPNext desk, with no second
    place to keep in sync.

    Only booleans are returned -- never role names or doctype metadata -- so
    the response says nothing the caller could not already probe, and nothing
    about permissions beyond read.

    Returns:
        dict: {"approvals": {doctype: bool}, "reports": {report_key: bool}}
    """
    return {
        "approvals": {dt: _can_read(dt) for dt in SPA_APPROVAL_DOCTYPES},
        "reports": {
            key: _can_read(dt) for key, dt in SPA_REPORT_DOCTYPES.items()
        },
    }


def has_app_permission():
    """Permission check for the add_to_apps_screen hook.
    All authenticated users can see the Addsol UI app tile.
    """
    return True


@frappe.whitelist(allow_guest=False)
def get_current_user():
    """Return the logged-in user and their roles.

    This endpoint is accessible by all authenticated users regardless of role.
    It uses server-side frappe.get_roles() to retrieve the full role list,
    filtering out built-in roles like "All" and "Guest".

    Returns:
        dict: {"user": str, "roles": list[str]}
    """
    user = frappe.session.user
    roles = frappe.get_roles()

    # Filter out system-only roles that aren't meaningful for UI access control
    filtered = [r for r in roles if r not in ("All", "Guest")]

    return {"user": user, "roles": filtered}


def boot_session(bootinfo):
    """Redirect operational users to the custom UI after login.

    This hook runs after login during boot info generation. It sets the user's
    home_page to /addsol_ui so that Employee/Self Employee users land on the
    tile-based SPA instead of the standard Frappe desk.

    Users who need the standard desk can always return via the "Back to ERPNext"
    option in the custom UI's header dropdown menu.

    Args:
        bootinfo: The boot info dict that will be sent to the client.
    """
    user = frappe.session.user
    if user and user != "Administrator":
        # Redirect all non-Administrator users to the custom UI.
        # ESS, Approvals, and Reports modules are accessible by "*" (all users),
        # so every authenticated user has access to at least parts of the SPA.
        # The "Back to ERPNext" dropdown option provides access to the standard desk.
        bootinfo["user"]["home_page"] = "/addsol_ui"


@frappe.whitelist(allow_guest=False)
def get_csrf_token():
    """Return the CSRF token of the current session.

    Frappe validates CSRF on every unsafe HTTP method (POST/PUT/PATCH/DELETE)
    and reads the token from the `X-Frappe-CSRF-Token` header or a `csrf_token`
    form field. The desk gets it for free because `frappe/www/app.py` renders
    the boot payload, but this SPA is served as static assets and never
    evaluates that boot script, so `frappe.csrf_token` does not exist on the
    client. Without the header, every write call made from the SPA fails with
    `CSRFTokenError: Invalid Request`.

    This only exposes the caller's own session token, so it grants no access
    beyond what the session already has.
    """
    # Imported lazily: `frappe.sessions` is not necessarily loaded by `import frappe`.
    from frappe.sessions import get_csrf_token as _get_csrf_token

    return {"csrf_token": _get_csrf_token()}


# ============================================================
# LEAVE BALANCE REPORT
# ============================================================

def _get_current_fiscal_year():
    """Return the Fiscal Year the current date falls in, as a dict."""
    today = frappe.utils.today()
    rows = frappe.db.sql(
        """
        select name, year_start_date, year_end_date
        from `tabFiscal Year`
        where %s between year_start_date and year_end_date and disabled = 0
        order by year_start_date desc
        limit 1
        """,
        today,
        as_dict=True,
    )
    if not rows:
        return None
    return {
        "name": rows[0]["name"],
        "start_date": str(rows[0]["year_start_date"]),
        "end_date": str(rows[0]["year_end_date"]),
    }


def _get_scope(user):
    """Decide what the current user is allowed to see.

    Returns:
        dict with keys:
          is_hr, is_hod, can_view_others, allowed_departments (list or None=all),
          my_employee, my_department
    """
    roles = set(frappe.get_roles(user))
    is_hr = bool(roles & HR_ROLES)

    my_emp = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        ["name", "department"],
        as_dict=True,
    ) or {}

    my_employee = my_emp.get("name") or ""
    my_department = my_emp.get("department") or ""

    # HOD detection: Department.hod (user link) and/or Department.head_of_department
    # (employee link). Field presence is checked so older/custom schemas that only
    # expose one of the two don't raise "Unknown column" errors.
    dept_meta = frappe.get_meta("Department")
    has_hod = dept_meta.has_field("hod")
    has_head_of_department = dept_meta.has_field("head_of_department")

    hod_departments = []
    if user and user != "Guest":
        if has_hod:
            hod_departments += [
                d["name"]
                for d in frappe.get_all(
                    "Department",
                    filters={"hod": user},
                    fields=["name"],
                    ignore_permissions=True,
                )
            ]
            if my_employee:
                hod_departments += [
                    d["name"]
                    for d in frappe.get_all(
                        "Department",
                        filters={"hod": my_employee},
                        fields=["name"],
                        ignore_permissions=True,
                    )
                ]
        if has_head_of_department and my_employee:
            hod_departments += [
                d["name"]
                for d in frappe.get_all(
                    "Department",
                    filters={"head_of_department": my_employee},
                    fields=["name"],
                    ignore_permissions=True,
                )
            ]
        hod_departments = list(dict.fromkeys(hod_departments))  # dedupe

    is_hod = bool(hod_departments)

    # Manager = has direct reports
    is_manager = False
    if my_employee:
        is_manager = bool(
            frappe.get_all(
                "Employee",
                filters={"reports_to": my_employee, "status": "Active"},
                limit=1,
                ignore_permissions=True,
            )
        )

    can_view_others = is_hr or is_hod or is_manager

    # Departments the user may look at (None = all)
    allowed_departments = None
    if is_hr:
        allowed_departments = None
    elif is_hod:
        allowed_departments = hod_departments
    elif is_manager and my_department:
        allowed_departments = [my_department]

    return {
        "is_hr": is_hr,
        "is_hod": is_hod,
        "can_view_others": can_view_others,
        "allowed_departments": allowed_departments,
        "my_employee": my_employee,
        "my_department": my_department,
    }


def _aggregate_leaves(employees, fy, leave_types):
    """Compute allocated/used/balance per leave type for a list of employees.

    Every employee is seeded with ALL leave types (0 allocated/used when there
    is no allocation/application), so the report is a complete matrix where a
    missing allocation simply shows a zero balance.

    Allocated = new_leaves_allocated + unused_leaves (carry-forward) of the most
    recent approved Leave Allocation; used = approved Leave Applications
    overlapping the fiscal year window.
    """
    emp_names = [e["name"] for e in employees]
    if not emp_names:
        return []

    # Allocations overlapping the fiscal year (keep the most recent per leave type)
    allocations = frappe.get_all(
        "Leave Allocation",
        filters={
            "employee": ["in", emp_names],
            "docstatus": 1,
            "from_date": ["<=", fy["end_date"]],
            "to_date": [">=", fy["start_date"]],
        },
        fields=[
            "employee",
            "leave_type",
            "from_date",
            "new_leaves_allocated",
            "unused_leaves",
        ],
        order_by="from_date desc",
        ignore_permissions=True,
    )

    # Approved leave applications overlapping the fiscal year
    applications = frappe.get_all(
        "Leave Application",
        filters={
            "employee": ["in", emp_names],
            "docstatus": 1,
            "status": "Approved",
            "from_date": ["<=", fy["end_date"]],
            "to_date": [">=", fy["start_date"]],
        },
        fields=["employee", "leave_type", "total_leave_days"],
        ignore_permissions=True,
    )

    # employee -> leave_type -> allocated (most recent allocation wins)
    best_alloc = {}
    for a in allocations:
        key = (a["employee"], a["leave_type"])
        prev = best_alloc.get(key)
        if prev is None or (a["from_date"] or "") >= (prev["from_date"] or ""):
            best_alloc[key] = a

    # employee -> leave_type -> used days
    used = {}
    for ap in applications:
        key = (ap["employee"], ap["leave_type"])
        used[key] = used.get(key, 0) + (ap["total_leave_days"] or 0)

    result = []
    for emp in employees:
        leaves = {}
        for lt in leave_types:
            alloc_row = best_alloc.get((emp["name"], lt))
            if alloc_row:
                # Allocated = new + carry-forward (works across ERPNext versions)
                allocated = (alloc_row["new_leaves_allocated"] or 0) + (
                    alloc_row["unused_leaves"] or 0
                )
            else:
                allocated = 0
            used_days = used.get((emp["name"], lt), 0)
            leaves[lt] = {
                "leave_type": lt,
                "allocated": round(allocated, 1),
                "used": round(used_days, 1),
                "balance": round(allocated - used_days, 1),
            }
        result.append({
            "employee": emp["name"],
            "employee_name": emp.get("employee_name") or emp["name"],
            "department": emp.get("department") or "",
            "leaves": [leaves[k] for k in leave_types],
        })
    return result


@frappe.whitelist()
def leave_balance_report(department=None, employee=None, fiscal_year=None):
    """Leave balance report for the current fiscal year.

    - Regular employees -> only their own record.
    - HOD (Department.hod) or manager (Employee.reports_to) -> their department/team.
    - HR/Admin -> all employees, optional department/employee filter.

    Args:
        department (str, optional): Department name to filter by.
        employee (str, optional): Employee name to filter by.
        fiscal_year (str, optional): Fiscal Year name; defaults to the current one.

    Returns:
        dict: fiscal_year info, access flags, allowed departments and rows:
        {
          "fiscal_year": {...},
          "is_hr": bool, "is_hod": bool, "can_view_others": bool,
"departments": [str],            # departments the user can filter by
      "leave_types": [str],            # all Leave Types (matrix columns)
      "employees": [
            {"employee", "employee_name", "department",
             "leaves": [{"leave_type", "allocated", "used", "balance"}]}
          ]
        }
    """
    user = frappe.session.user

    fy_obj = None
    if fiscal_year:
        st, en = frappe.db.get_value("Fiscal Year", fiscal_year, ["year_start_date", "year_end_date"])
        if st and en:
            fy_obj = {"name": fiscal_year, "start_date": str(st), "end_date": str(en)}
    if not fy_obj:
        fy_obj = _get_current_fiscal_year()
        if not fy_obj:
            frappe.throw("No Fiscal Year found for the current date.")

    scope = _get_scope(user)

    # ----- Resolve target employees -----
    target = None  # None = all allowed
    emp_filters = {"status": "Active"}

    if employee:
        # Only allow if the user can view others, or it is their own record
        if scope["my_employee"] == employee:
            emp_filters["name"] = employee
            target = "employee"
        elif scope["can_view_others"]:
            emp_filters["name"] = employee
            target = "employee"
        else:
            emp_filters["name"] = scope["my_employee"]
            target = "employee"
    elif scope["can_view_others"]:
        if department:
            # Restrict to allowed departments
            allowed = scope["allowed_departments"]
            if allowed is not None and department not in allowed:
                department = None
            if department:
                emp_filters["department"] = department
        elif scope["allowed_departments"] is not None:
            emp_filters["department"] = ["in", scope["allowed_departments"]]
    else:
        emp_filters["name"] = scope["my_employee"]

    if not emp_filters.get("name"):
        # scope owns record but no employee mapping
        pass

    employees = frappe.get_all(
        "Employee",
        filters=emp_filters,
        fields=["name", "employee_name", "department"],
        order_by="employee_name asc",
        ignore_permissions=True,
    )

    # ----- All leave types (matrix columns) -----
    leave_types = [
        t["name"]
        for t in frappe.get_all(
            "Leave Type",
            fields=["name"],
            order_by="name asc",
            ignore_permissions=True,
        )
    ]

    if not employees and not scope["can_view_others"] and not scope["my_employee"]:
        return {
            "fiscal_year": fy_obj,
            "is_hr": scope["is_hr"],
            "is_hod": scope["is_hod"],
            "can_view_others": scope["can_view_others"],
            "departments": [],
            "leave_types": leave_types,
            "employees": [],
        }

    # ----- Departments available for the filter dropdown -----
    if scope["allowed_departments"] is not None:
        dept_names = scope["allowed_departments"]
    else:
        dept_names = [
            d["name"]
            for d in frappe.get_all(
                "Department",
                filters={"disabled": 0},
                fields=["name"],
                order_by="name asc",
                ignore_permissions=True,
            )
        ]

    rows = _aggregate_leaves(employees, fy_obj, leave_types)

    # Sort employees by name
    rows.sort(key=lambda r: (r["employee_name"] or "").lower())

    return {
        "fiscal_year": fy_obj,
        "is_hr": scope["is_hr"],
        "is_hod": scope["is_hod"],
        "can_view_others": scope["can_view_others"],
        "departments": dept_names,
        "leave_types": leave_types,
        "employees": rows,
        "my_employee": scope["my_employee"],
    }


@frappe.whitelist()
def leave_balance_employees(department=None):
    """Permission-scoped employee list for the Leave Balance employee filter.

    Returns the active employees the current user is allowed to see for the
    leave balance report (same scoping as leave_balance_report).

    Args:
        department (str, optional): Restrict to a single department.

    Returns:
        dict: {"employees": [{"name", "employee_name", "department"}]}
    """
    user = frappe.session.user
    scope = _get_scope(user)

    emp_filters = {"status": "Active"}

    if scope["can_view_others"]:
        if department:
            allowed = scope["allowed_departments"]
            if allowed is not None and department not in allowed:
                department = None
            if department:
                emp_filters["department"] = department
        elif scope["allowed_departments"] is not None:
            emp_filters["department"] = ["in", scope["allowed_departments"]]
    else:
        emp_filters["name"] = scope["my_employee"]

    employees = frappe.get_all(
        "Employee",
        filters=emp_filters,
        fields=["name", "employee_name", "department"],
        order_by="employee_name asc",
        ignore_permissions=True,
    )

    return {"employees": employees}


def _get_effective_holiday_list(employee, company, as_on):
    """Resolve an employee's holiday list for a date.

    Precedence:
      1. Holiday List Assignment (HLA) for the employee, then the company.
      2. Legacy Employee.holiday_list field.
      3. Legacy Company.default_holiday_list.
      4. Global Defaults.default_holiday_list.

    Returns the holiday list name, or "" if none can be found.
    """
    try:
        from hrms.utils.holiday_list import get_assigned_holiday_list
    except ImportError:
        try:
            from erpnext.utils.holiday_list import get_assigned_holiday_list
        except ImportError:
            get_assigned_holiday_list = None

    if get_assigned_holiday_list:
        for assigned_to in (employee, company):
            if assigned_to:
                hl = get_assigned_holiday_list(assigned_to, as_on)
                if hl:
                    return hl

    if employee:
        hl = frappe.db.get_value("Employee", employee, "holiday_list")
        if hl:
            return hl

    if company:
        hl = frappe.db.get_value("Company", company, "default_holiday_list")
        if hl:
            return hl

    return frappe.db.get_single_value("Global Defaults", "default_holiday_list") or ""


def _fetch_month_holidays(holiday_list, start_date, end_date):
    """Holiday child rows for a holiday list in a date range.

    Returns a list of {"holiday_date": "YYYY-MM-DD", "weekly_off": 0|1}.
    The child date field is `holiday_date` in HRMS (older schemas used
    `holiday`); the meta is checked so either version works.
    """
    if not holiday_list:
        return []

    date_field = (
        "holiday_date"
        if frappe.get_meta("Holiday").has_field("holiday_date")
        else "holiday"
    )

    rows = frappe.get_all(
        "Holiday",
        filters={
            "parent": holiday_list,
            date_field: ["between", [start_date, end_date]],
        },
        fields=[date_field, "weekly_off"],
        ignore_permissions=True,
    )

    return [
        {"holiday_date": str(r[date_field]), "weekly_off": r.get("weekly_off") or 0}
        for r in rows
    ]


@frappe.whitelist()
def monthly_attendance(year, month, department=None, employee=None, company=None):
    """Monthly attendance matrix for the attendance report.

    Reuses the built-in "Monthly Attendance Sheet" report logic server-side, so
    weekly off (WO) and holiday (H) days are computed exactly like ERPNext does
    (from each employee's / company's Holiday List). Access is scoped per user
    (HR/HOD/manager/self) the same way as leave_balance_report.

    Args:
        year (int): Calendar year, e.g. 2026.
        month (int): Calendar month 1-12.
        department (str, optional): Department to filter by.
        employee (str, optional): Employee name to filter by.
        company (str, optional): Company; defaults to the employee's / default.

    Returns:
        dict: {
          "company", "year", "month",
          "days": ["YYYY-MM-DD", ...],
          "rows": [{
            "employee", "employee_name", "department", "designation",
            "statuses": {"YYYY-MM-DD": "P|A|HD/L/WO/H|..."}  # "" = no data
          }],
          "is_hr", "is_hod", "can_view_others"
        }
    """
    import calendar
    from datetime import date as _date

    user = frappe.session.user
    scope = _get_scope(user)

    try:
        year = int(year)
        month = int(month)
    except (TypeError, ValueError):
        frappe.throw("Invalid year/month.")

    total_days = calendar.monthrange(year, month)[1]
    days = [_date(year, month, d).isoformat() for d in range(1, total_days + 1)]

    # ----- Resolve the employees the user may see -----
    emp_filters = {"status": "Active"}

    if employee:
        if scope["my_employee"] == employee or scope["can_view_others"]:
            emp_filters["name"] = employee
        else:
            emp_filters["name"] = scope["my_employee"]
    elif scope["can_view_others"]:
        if department:
            allowed = scope["allowed_departments"]
            if allowed is not None and department not in allowed:
                department = None
            if department:
                emp_filters["department"] = department
        elif scope["allowed_departments"] is not None:
            emp_filters["department"] = ["in", scope["allowed_departments"]]
    else:
        emp_filters["name"] = scope["my_employee"]

    employees = frappe.get_all(
        "Employee",
        filters=emp_filters,
        fields=["name", "employee_name", "department", "designation", "company"],
        order_by="employee_name asc",
        ignore_permissions=True,
    )

    if not employees:
        return {
            "company": company or "",
            "year": year,
            "month": month,
            "days": days,
            "rows": [],
            "is_hr": scope["is_hr"],
            "is_hod": scope["is_hod"],
            "can_view_others": scope["can_view_others"],
        }

    # ----- Company for the report filter -----
    if not company:
        company = next(
            (e.get("company") for e in employees if e.get("company")), ""
        ) or frappe.db.get_default("company")
    if not company:
        company = frappe.db.get_single_value("Global Defaults", "default_company")

    # Seed the matrix with ALL scoped employees so people with zero attendance
    # still appear (all-blank cells).
    rows = {}
    for e in employees:
        rows[e["name"]] = {
            "employee": e["name"],
            "employee_name": e.get("employee_name") or e["name"],
            "department": e.get("department") or "",
            "designation": e.get("designation") or "",
            "statuses": {d: "" for d in days},
        }

    # ----- Run the built-in Monthly Attendance Sheet report -----
    report_data = []
    try:
        try:
            from hrms.hr.report.monthly_attendance_sheet.monthly_attendance_sheet import (
                execute as _report_execute,
            )
        except ImportError:
            from erpnext.hr.report.monthly_attendance_sheet.monthly_attendance_sheet import (
                execute as _report_execute,
            )

        report_filters = frappe._dict(
            {
                "filter_based_on": "Month",
                "month": month,
                "year": year,
                "company": company,
                "include_company_descendants": True,
            }
        )
        if not scope["can_view_others"] and scope["my_employee"]:
            # Regular employees only need their own row.
            report_filters["employee"] = scope["my_employee"]
        _columns, report_data, _message, _chart = _report_execute(report_filters)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "erpnext_ui.monthly_attendance")

    # ----- Merge report rows (per employee x shift) into the matrix -----
    # The report keys day cells as "DD-MM-YYYY"; per day we keep the first
    # non-blank value across an employee's shift rows.
    for row in report_data or []:
        emp_key = row.get("employee")
        if emp_key not in rows:
            continue
        target = rows[emp_key]
        for d in days:
            date_part = _date.fromisoformat(d)
            key = date_part.strftime("%d-%m-%Y")
            value = row.get(key) or ""
            if value and not target["statuses"][d]:
                target["statuses"][d] = value
        if row.get("department") and not target["department"]:
            target["department"] = row["department"]
        if row.get("designation") and not target["designation"]:
            target["designation"] = row["designation"]

    # ----- Overlay weekly off / holiday on blank days -----
    # The built-in report only resolves holiday lists via Holiday List
    # Assignment, so installs using the classic Employee.holiday_list field
    # would otherwise get no WO/H at all. We fill those blanks ourselves;
    # attendance statuses from the report always win.
    for row in rows.values():
        hl = _get_effective_holiday_list(row["employee"], company, days[0])
        if not hl:
            continue
        day_off = {}
        for h in _fetch_month_holidays(hl, days[0], days[-1]):
            day_off[h["holiday_date"]] = "WO" if h["weekly_off"] else "H"
        statuses = row["statuses"]
        for d in days:
            if not statuses[d] and d in day_off:
                statuses[d] = day_off[d]

    return {
        "company": company or "",
        "year": year,
        "month": month,
        "days": days,
        "rows": list(rows.values()),
        "is_hr": scope["is_hr"],
        "is_hod": scope["is_hod"],
        "can_view_others": scope["can_view_others"],
    }


# ============================================================
# STORE — INDENTS (MATERIAL REQUEST) AND PROJECT ITEMS
# ============================================================
#
# The Store UI is reorganised around *purposes* rather than doctypes: a person
# picks "Raise an Indent" or "Give Items", and the doctype and field values are
# decided server-side by config/storePurposes.js. Everything below exists to
# support that, and deliberately uses stock ERPNext doctypes unchanged:
#
#   Material Request            -> the request itself (an "indent")
#   Material Request Item       -> carries `project` and `bom_no`
#   Stock Entry Detail          -> carries `material_request`/`material_request_item`
#   BOM                        -> the Project -> items bridge (`BOM.project`)
#
# Nothing here writes a doctype. These are read-only projections that let the UI
# answer "what does this project need?" and "what is still owed to me?" without
# duplicating ERPNext's quantity arithmetic on the client.


# `BOM.project` is the only link from a Project to a list of items. ERPNext's
# `Project` doctype has no item child table (and `Project Template` has only
# tasks), so a project with no tagged BOM has no items and the UI must say so
# rather than silently falling back to an empty list.
def _project_boms(project):
	"""Active BOMs tagged to a project, that the caller may actually read.

	A project may legitimately have several BOMs (different variants, revisions).
	We return the list and let the UI ask, rather than guessing: picking the
	wrong BOM silently would put the wrong item codes on an indent.

	The permission check is per document, not just per doctype -- a user limited
	to their own BOMs by a User Permission must not be able to read another one
	by naming the project it belongs to.
	"""
	if not frappe.db.exists("DocType", "Project") or not frappe.db.exists("DocType", "BOM"):
		return []

	if not frappe.has_permission("BOM", "read"):
		return []

	boms = frappe.get_all(
		"BOM",
		filters={"project": project, "docstatus": ("!=", 2)},
		fields=["name", "item", "quantity", "uom", "is_default", "modified"],
		order_by="is_default desc, modified desc",
		limit=20,
	)

	return [b for b in boms if frappe.has_permission("BOM", "read", b.name)]


def _requested_qty_by_project_item(project):
	"""Sum of still-outstanding request qty per item for one project.

	Outstanding is `stock_qty - ordered_qty` on the Material Request Item, which
	is the same expression ERPNext uses when it maps a request onto a Stock Entry
	(`update_item` in material_request.py). Only submitted, not-stopped,
	not-cancelled requests count, because those are the only ones the store can
	still act on.

	`ordered_qty` is labelled "Completed Qty" on the child table. `received_qty`
	deliberately is NOT used: it is only driven by the Purchase flow and stays 0
	for Stock-Entry-backed requests, so using it would report everything as still
	owed.
	"""
	outstanding = {}

	if not frappe.db.exists("DocType", "Material Request Item"):
		return outstanding

	parents = frappe.get_all(
		"Material Request",
		filters={
			"docstatus": 1,
			"status": ("not in", ["Stopped", "Cancelled"]),
		},
		fields=["name"],
		order_by="creation desc",
		# Bounded on purpose: this becomes an `IN (...)` list, and a site with a
		# few years of submitted indents would otherwise build an unbounded
		# query. Recent requests are the ones a person is actually still
		# tracking; anything older has been issued or re-raised.
		limit=1000,
		ignore_permissions=True,
	)
	parent_names = [p.name for p in parents]
	if not parent_names:
		return outstanding

	# Positional `%s` with a tuple, NOT `%(name)s`. frappe.db.sql hands the
	# values straight to pymysql, which has no named-parameter support: a dict of
	# names was being str()-ed straight into the statement, so this raised
	# "You have an error in your SQL syntax ... near ''project': \"'W-0268'\"".
	# This is ERPNext's own convention for an IN list -- see general_ledger.py:745
	# (`where name in %s` with `tuple(gle_names)`).
	for row in frappe.db.sql(
		"""
		select item_code, sum(greatest(stock_qty - coalesce(ordered_qty, 0), 0)) as pending
		from `tabMaterial Request Item`
		where project = %s
			and parent in %s
		group by item_code
		""",
		(project, tuple(parent_names)),
		as_dict=True,
	):
		outstanding[row.item_code] = flt(row.pending)

	return outstanding


def _explode_bom(bom, company, qty):
	"""Flatten a BOM into a list of stock item rows with usable UOM values.

	Why not call ERPNext's whitelisted `bom.get_bom_items` directly? Two reasons,
	both load-bearing:

	1. It has no permission check. Calling it from the SPA would let any
	   authenticated user read the bill of materials of a project they cannot see.
	   This function is only reachable after the caller has been checked, so the
	   disclosure stops here.

	2. It hardcodes `include_non_stock_items=True` (bom.py:1259), so it returns
	   consumables and services that can never appear on an indent -- a Stock
	   Entry rejects them with "is not a stock Item".

	It also cannot be used with `fetch_exploded=1` for form prefill: the exploded
	read comes from `BOM Explosion Item`, which has no `uom` or
	`conversion_factor` column at all, and Material Request Item requires both.
	"""
	from erpnext.manufacturing.doctype.bom.bom import get_bom_items_as_dict

	rows = get_bom_items_as_dict(
		bom,
		company,
		qty=qty,
		fetch_exploded=0,
		include_non_stock_items=False,
	)

	if not rows:
		return []

	# get_bom_items_as_dict resolves per-company defaults but not UOM. Fill them
	# from the Item master so every row is immediately submittable.
	item_codes = list(rows.keys())
	items = {
		d.name: d
		for d in frappe.get_all(
			"Item",
			filters={"name": ("in", item_codes)},
			fields=["name", "item_name", "stock_uom", "item_group"],
		)
	}

	result = []
	for item_code, row in sorted(rows.items()):
		item = items.get(item_code)
		if not item:
			continue

		stock_uom = item.stock_uom
		if not stock_uom:
			continue

		result.append(
			{
				"item_code": item_code,
				"item_name": item.item_name,
				"item_group": item.item_group,
				"uom": row.get("uom") or stock_uom,
				"stock_uom": stock_uom,
				"conversion_factor": flt(row.get("conversion_factor")) or 1.0,
				# The quantity column is always aliased `qty`, even when it is
				# read from BOM Item.stock_qty -- `get_bom_items_as_dict` names
				# the result `... * %(qty)s as qty` either way. Reading
				# `stock_qty` first would always miss and silently fall through.
				"required_qty": flt(row.get("qty") or row.get("stock_qty")),
				"source_warehouse": row.get("source_warehouse") or row.get("default_warehouse"),
				"rate": flt(row.get("rate")),
				"operation": row.get("operation"),
			}
		)

	return result


@frappe.whitelist(allow_guest=False)
def get_project_items(project=None, company=None, bom=None, qty=1):
	"""Items a Project needs, taken from the BOM tagged to that project.

	The Store module answers "what material does this project need?" by reading
	the BOM whose `project` field matches. That is the only available bridge --
	ERPNext's `Project` doctype carries no item list -- so a project with no
	tagged BOM genuinely has no items to show and the response says so instead of
	looking like an empty project.

	Permission model: the caller must be able to read `Project` and `BOM`. BOM
	read is checked explicitly here because ERPNext's own BOM explosion helper
	does not check it. Fails closed: any error raises rather than degrading to an
	empty list, because an empty list reads as "this project needs nothing" and
	would push the user to free-text an item list that should have been
	generated.

	Args:
		project (str, optional): Project name. Ignored when `bom` is given.
		company (str, optional): Company; defaults to the default company.
		bom (str, optional): Explicit BOM, for a project with several.
		qty (float, optional): Multiply the BOM quantity, e.g. 2 for two units
			of the finished item. Defaults to 1.

	Returns:
		dict: {
		  "project", "company",
		  "boms": [{"name", "item", "quantity", "is_default"}],  # for the picker
		  "bom": "BOM-...",                                        # the one used
		  "has_bom": bool,
		  "items": [{"item_code", "item_name", "uom", "stock_uom",
		             "conversion_factor", "required_qty",
		             "requested_qty", "outstanding_qty"}]
		}
	"""
	if not project and not bom:
		frappe.throw("Select a project to see the items it needs.")

	if project:
		# Document-level, not doctype-level. A user who can read *some* projects
		# must not be able to read the bill of materials of every project by
		# naming it. Frappe's own BOM explosion does not check at all, which is
		# why this endpoint exists.
		if not frappe.has_permission("Project", "read", project):
			frappe.throw("You do not have permission to view this project.", frappe.PermissionError)

		available_boms = _project_boms(project)
		if not available_boms:
			return {
				"project": project,
				"company": company or "",
				"boms": [],
				"bom": None,
				"has_bom": False,
				"items": [],
			}

		if bom:
			if not any(b.name == bom for b in available_boms):
				# Do not let a caller pass a BOM that is not tagged to this
				# project: it would silently return another project's items.
				frappe.throw("That bill of materials is not linked to this project.")
			bom_name = bom
		else:
			bom_name = available_boms[0].name
	elif bom:
		if not frappe.has_permission("BOM", "read", bom):
			frappe.throw("You do not have permission to view this bill of materials.", frappe.PermissionError)
		bom_name = bom
		project = frappe.db.get_value("BOM", bom_name, "project")
		available_boms = _project_boms(project) if project else []
	else:  # pragma: no cover - guarded by the first `if`
		frappe.throw("Select a project to see the items it needs.")

	if not company:
		company = frappe.db.get_default("company") or frappe.db.get_single_value(
			"Global Defaults", "default_company"
		)

	try:
		qty = flt(qty) or 1.0
		items = _explode_bom(bom_name, company, qty)
	except frappe.PermissionError:
		raise
	except Exception:
		# Raising rather than returning []: a failure here must not be readable
		# as "this project needs no material".
		frappe.log_error(frappe.get_traceback(), "erpnext_ui.get_project_items")
		frappe.throw("Could not read the bill of materials for this project.")

	requested = _requested_qty_by_project_item(project) if project else {}

	for row in items:
		requested_qty = flt(requested.get(row["item_code"]))
		row["project"] = project
		row["requested_qty"] = requested_qty
		row["outstanding_qty"] = round(row["required_qty"] - requested_qty, 3)

	return {
		"project": project,
		"company": company,
		"boms": [
			{
				"name": b.name,
				"item": b.item,
				"quantity": flt(b.quantity),
				"uom": b.uom,
				"is_default": cint(b.is_default),
			}
			for b in available_boms
		],
		"bom": bom_name,
		"has_bom": True,
		"items": items,
	}


@frappe.whitelist(allow_guest=False)
def get_indent_queue(company=None):
	"""Submitted, still-unfulfilled indents for the store keeper to act on.

	An "indent" is a Material Request the store can hand material against --
	Material Issue, Material Transfer or Customer Provided. Purchase and
	Manufacture requests are excluded because ERPNext's own
	`make_stock_entry` refuses to map them (material_request.py:816-822); showing
	them here would offer a "Give Items" action that can only fail.

	Outstanding quantity is `stock_qty - ordered_qty` per item, the same figure
	that becomes the Stock Entry's qty when the storekeeper issues.

	Permission model: requires read on `Material Request` and `Stock Entry`.
	Fails closed.

	Args:
		company (str, optional): Restrict to one company.

	Returns:
		dict: {"total": int, "requests": [
			{"name", "company", "transaction_date", "schedule_date",
			 "material_request_type", "status", "per_ordered",
			 "projects": [str], "warehouse": str,
			 "items": [{"name", "item_code", "item_name", "project",
			            "requested_qty", "issued_qty", "outstanding_qty",
			                "uom", "stock_uom", "warehouse"}]}
		]}
	"""
	if not frappe.has_permission("Material Request", "read"):
		frappe.throw("You do not have permission to view indent requests.", frappe.PermissionError)
	if not frappe.has_permission("Stock Entry", "read"):
		frappe.throw("You do not have permission to view stock entries.", frappe.PermissionError)

	fulfillable = ("Material Issue", "Material Transfer", "Customer Provided")

	filters = {
		"docstatus": 1,
		"material_request_type": ("in", fulfillable),
		"status": ("not in", ["Stopped", "Cancelled"]),
	}
	if company:
		filters["company"] = company

	requests = frappe.get_all(
		"Material Request",
		filters=filters,
		fields=[
			"name",
			"company",
			"transaction_date",
			"schedule_date",
			"material_request_type",
			"status",
			"per_ordered",
			"owner",
		],
		order_by="transaction_date asc, name asc",
		limit=100,
	)
	if not requests:
		return {"total": 0, "requests": []}

	by_name = {r.name: dict(r) for r in requests}
	names = list(by_name)

	item_rows = frappe.get_all(
		"Material Request Item",
		filters={"parent": ("in", names)},
		fields=[
			"name",
			"parent",
			"item_code",
			"item_name",
			"project",
			"qty",
			"stock_qty",
			"ordered_qty",
			"uom",
			"stock_uom",
			"warehouse",
			"from_warehouse",
		],
		order_by="idx asc",
		ignore_permissions=True,
	)

	for request in by_name.values():
		request["projects"] = []

	for row in item_rows:
		request = by_name.get(row.parent)
		if not request:
			continue

		requested_qty = flt(row.stock_qty)
		issued_qty = flt(row.ordered_qty)
		outstanding = round(max(requested_qty - issued_qty, 0), 3)

		# A fully-issued item is not outstanding work. Dropping it here keeps a
		# 200-line request from rendering 200 rows the storekeeper cannot act on.
		if outstanding <= 0:
			continue

		# Material Transfer reads the source off from_warehouse; the other two
		# read the target off warehouse. This mirrors `update_item` in
		# material_request.py, which is what will actually consume the value.
		source = (
			row.from_warehouse if request["material_request_type"] == "Material Transfer" else row.warehouse
		)

		request.setdefault("items", []).append(
			{
				"name": row.name,
				"item_code": row.item_code,
				"item_name": row.item_name or row.item_code,
				"project": row.project or "",
				"requested_qty": requested_qty,
				"issued_qty": issued_qty,
				"outstanding_qty": outstanding,
				"uom": row.uom,
				"stock_uom": row.stock_uom,
				"warehouse": source or "",
			}
		)

		if row.project and row.project not in request["projects"]:
			request["projects"].append(row.project)

	# A request whose every line is already issued is finished work, not a
	# queue entry, even though it is still Submitted.
	pending = []
	for request in by_name.values():
		if not request.get("items"):
			continue
		request.setdefault("items", [])
		request["projects"] = request.get("projects", [])
		request["outstanding_total"] = round(sum(item["outstanding_qty"] for item in request["items"]), 3)
		pending.append(request)

	return {"total": len(pending), "requests": pending}


# Purpose key -> Material Request `material_request_type`.
#
# This is the SERVER-side authority for the Store module's request purposes. The
# client sends a purpose key ("indent"), never a `material_request_type` string:
# if it could send the type directly, a caller could create a request of a type
# this map never vetted.
#
# frontend/src/config/storePurposes.js mirrors this mapping for display and for
# building the document payload, and must be kept in step. The two are separate
# on purpose -- the browser copy cannot be trusted to enforce anything, and the
# Node smoke suite cannot import Python -- so any change here needs the same
# change there.
#
# The values must stay inside `Material Request.material_request_type`'s Select
# options, or Frappe's `_validate_selects` rejects the save with a bare HTTP 417.
SPA_REQUEST_PURPOSES = {
	"indent": "Material Issue",
	"purchase": "Purchase",
	"transfer": "Material Transfer",
	"production": "Manufacture",
	"customerProvided": "Customer Provided",
}

# The subset the store can actually hand material against. Mirrors ERPNext's own
# gate in `material_request.make_stock_entry` (material_request.py:816-822),
# which refuses anything outside this set.
SPA_STORE_FULFILLABLE_TYPES = ("Material Issue", "Material Transfer", "Customer Provided")


@frappe.whitelist(allow_guest=False)
def get_indent_list(
	purpose=None,
	scope="all",
	company=None,
	status=None,
	search=None,
	start=0,
	limit=20,
):
	"""Material Requests for one purpose, split by whether they carry a project.

	The Store module separates "project indents" from "general indents". That
	split is computed here rather than in the browser because **Frappe cannot
	express it as a list filter**: `get_filter` resolves a dotted fieldname
	(`items.project`) against the *parent* meta and then appends the child table
	with no join, which is a cross join -- an indent with three items on a project
	comes back three times and paginates wrongly (verified against MariaDB).
	An EXISTS subquery is the only correct formulation, so it lives here.

	Selection and pagination stay permission-checked: the candidate set comes
	from `frappe.get_all`, which applies the caller's read permissions, and only
	the split and the page window are computed in Python.

	Args:
		purpose (str, optional): Purpose key from config/storePurposes.js.
			Omit to list every request type.
		scope (str): "project" (at least one item has a project), "general"
			(no item has one), or "all". Defaults to "all".
		company (str, optional): Restrict to one company.
		status (str, optional): Exact `status` match.
		search (str, optional): Substring of the request name.
		start (int): Row offset. Defaults to 0.
		limit (int): Page size. Defaults to 20.

	Returns:
		dict: {"total": int, "scope": str, "counts": {"project": int,
		          "general": int}, "rows": [ ... ]}
	"""
	if not frappe.has_permission("Material Request", "read"):
		frappe.throw("You do not have permission to view indent requests.", frappe.PermissionError)

	# The purpose key is a UI concept; translate it here so the client never has
	# to send (or guess) a `material_request_type` string.
	material_request_type = None
	if purpose:
		if purpose not in SPA_REQUEST_PURPOSES:
			frappe.throw(f"Unknown request purpose: {purpose}")
		material_request_type = SPA_REQUEST_PURPOSES[purpose]

	filters = {"docstatus": ("!=", 2)}
	if material_request_type:
		filters["material_request_type"] = material_request_type
	if company:
		filters["company"] = company
	if status:
		filters["status"] = status

	# Candidate names, permission-filtered and ordered. Bounded: this becomes an
	# IN (...) list, and an unbounded store system would otherwise build a query
	# with tens of thousands of ids in it.
	CANDIDATE_CAP = 2000
	candidates = frappe.get_all(
		"Material Request",
		filters=filters,
		fields=["name"],
		order_by="modified desc",
		limit_page_length=CANDIDATE_CAP,
		pluck="name",
	)
	if not candidates:
		return {"total": 0, "scope": scope, "counts": {"project": 0, "general": 0}, "rows": []}

	# One query for every item's project, rather than one per request.
	project_rows = frappe.get_all(
		"Material Request Item",
		filters={"parent": ("in", candidates)},
		fields=["parent", "project"],
		limit_page_length=0,
		ignore_permissions=True,
	)

	projects_by_request = {}
	for row in project_rows:
		if not row.project:
			continue
		bucket = projects_by_request.setdefault(row.parent, set())
		bucket.add(row.project)

	def is_project_indent(name):
		return bool(projects_by_request.get(name))

	split = {
		"project": [n for n in candidates if is_project_indent(n)],
		"general": [n for n in candidates if not is_project_indent(n)],
	}

	counts = {k: len(v) for k, v in split.items()}

	if scope == "project":
		ordered = split["project"]
	elif scope == "general":
		ordered = split["general"]
	elif scope == "all":
		# Interleave so the default view is not "all project indents, then all
		# general ones" — a user wants their own recent work either way.
		interleaved = [n for pair in zip(split["project"], split["general"], strict=False) for n in pair]
		interleaved += split["project"][len(split["general"]) :]
		interleaved += split["general"][len(split["project"]) :]
		ordered = interleaved
	else:
		frappe.throw("Scope must be one of: project, general, all")

	if search:
		needle = str(search).lower()
		ordered = [n for n in ordered if needle in n.lower()]

	total = len(ordered)
	try:
		start = max(int(start or 0), 0)
		limit = max(int(limit or 20), 1)
	except (TypeError, ValueError):
		frappe.throw("Invalid pagination.")

	page_names = ordered[start : start + limit]
	if not page_names:
		return {"total": total, "scope": scope, "counts": counts, "rows": []}

	rows = frappe.get_all(
		"Material Request",
		filters={"name": ("in", page_names)},
		fields=[
			"name",
			"company",
			"transaction_date",
			"schedule_date",
			"material_request_type",
			"status",
			"docstatus",
			"per_ordered",
			"modified",
		],
		limit_page_length=0,
	)
	by_name = {r.name: r for r in rows}

	# Preserve the ordering computed above rather than whatever get_all returned.
	ordered_rows = [by_name[n] for n in page_names if n in by_name]

	for row in ordered_rows:
		row.projects = sorted(projects_by_request.get(row.name, ()))

	return {
		"total": total,
		"scope": scope,
		"counts": counts,
		"rows": [dict(r) for r in ordered_rows],
	}


@frappe.whitelist(allow_guest=False)
def get_item_uom_options(item_code):
	"""The UOMs an item may be transacted in, with their whole-number flags.

	Deliberately does NOT return `conversion_factor`. A weighed receipt derives
	its own factor from a measured total (`total / qty`, see
	`lib/receiptConversion.js`), because the nominal figure in UOM Conversion
	Detail is wrong for every delivery -- 10 plates weighing 25.4 Kg are 2.54 Kg
	each, and the next delivery will not weigh the same. Shipping the master
	value to the client invited exactly that mistake. What the client still
	needs is: which UOMs exist, which one is the stock UOM, and which of them
	forbid a fraction.

	`must_be_whole_number` is a property of the UOM, and ERPNext enforces it
	against TWO different fields on a Purchase Receipt:

	- `validate_uom_is_integer("stock_uom", "stock_qty")`
	  (purchase_receipt.py:276-278) -- the *stock* qty must be whole.
	- and the transaction qty against the *transaction* UOM.

	So both flags are needed, keyed by UOM, for the form to check the right pair.

	Permission model: requires read on `Item`. Fails closed -- a caller with no
	Item permission gets a PermissionError, never an empty list, because an
	empty list would read as "this item has one UOM" and silently drop the
	measured-total field.

	Args:
		item_code (str): Item name.

	Returns:
		dict: {"item_code", "stock_uom", "uoms": [{"uom", "must_be_whole_number"}]}
	"""
	if not item_code:
		frappe.throw("No item specified.")

	if not frappe.has_permission("Item", "read", item_code):
		frappe.throw("You do not have permission to view this item.", frappe.PermissionError)

	stock_uom = frappe.db.get_value("Item", item_code, "stock_uom")
	if not stock_uom:
		frappe.throw(f"Item {item_code} has no stock UOM configured.")

	rows = frappe.get_all(
		"UOM Conversion Detail",
		filters={"parent": item_code},
		fields=["uom"],
		order_by="idx asc",
		ignore_permissions=True,
	)

	# `must_be_whole_number` is read per UOM rather than joined: it is a handful
	# of rows and this keeps the query to a single table.
	whole_number = {
		row.name: cint(row.must_be_whole_number)
		for row in frappe.get_all(
			"UOM",
			filters={"name": ("in", list({r.uom for r in rows} | {stock_uom}))},
			fields=["name", "must_be_whole_number"],
		)
	}

	uoms = [{"uom": row.uom, "must_be_whole_number": whole_number.get(row.uom, 0)} for row in rows if row.uom]

	# The stock UOM must always be listed even if no conversion row exists for
	# it: it is by definition what the item is stocked in.
	if not any(u["uom"] == stock_uom for u in uoms):
		uoms.append({"uom": stock_uom, "must_be_whole_number": whole_number.get(stock_uom, 0)})

	# Stock UOM first: it is the common case and the safest default.
	uoms.sort(key=lambda u: (u["uom"] != stock_uom, u["uom"]))

	return {"item_code": item_code, "stock_uom": stock_uom, "uoms": uoms}


# ============================================================
# STOCK BALANCE + TRACEABILITY
# ============================================================
#
# Why this exists rather than a `resource/Bin` list: `Bin` is a single current
# snapshot per item+warehouse. It answers "how much" and nothing else -- not
# where the stock came from, what it cost, or what has happened to it. On QA,
# item `CORE` holds 3 Kg that all arrived on one Purchase Receipt at two
# different rates (2 Kg @ 1000, 1 Kg @ 1200). The old 4-field list rendered that
# as "3 Kg @ 1066.67" and hid the only interesting fact about it.
#
# Two SQL rules learned the hard way here, both in this file:
#   - `frappe.db.sql` has NO support for `%(name)s` named parameters. Using
#     them str()-s the dict into the statement. That shipped once, in
#     `_requested_qty_by_project_item`, and only failed when a live site called
#     it. Everything below uses positional `%s`.
#   - `IN %s` takes a tuple (see ERPNext's own general_ledger.py:745-750).


def _stock_balance_defaults(from_date=None, to_date=None):
	"""Resolve the reporting window, defaulting to the current month.

	The default is a cost decision, not a convenience one: an opening balance is
	everything posted *before* `from_date`, so defaulting to "forever ago" makes
	the default query the most expensive one available.
	"""
	today = frappe.utils.today()
	to_date = str(to_date) if to_date else today
	from_date = (
		str(from_date)
		if from_date
		else frappe.utils.get_first_day(to_date, as_str=True)
	)

	if from_date > to_date:
		from_date, to_date = to_date, from_date

	return from_date, to_date, today


def _require_stock_read():
	"""Fail closed unless the caller may read both sides of the report.

	`Bin` and `Stock Ledger Entry` are separate doctypes with separate
	permissions. This report reads both -- a balance with no provenance is
	exactly the thin report being replaced -- so if either is denied the whole
	thing is denied rather than quietly degraded to quantities without a trail.
	"""
	for doctype in ("Bin", "Stock Ledger Entry"):
		try:
			allowed = frappe.has_permission(doctype, "read")
		except Exception:
			# Unknown doctype, permission cache miss, thrown validation: all mean
			# "cannot prove access", which must read as "no access".
			allowed = False
		if not allowed:
			frappe.throw(
				f"You do not have permission to view stock balances ({doctype}).",
				frappe.PermissionError,
			)


def _where(filters, extra=()):
	"""Build a WHERE fragment and its positional params, in matching order.

	Keeping the clauses and the values in one place is the only reliable way to
	stay aligned when the filter set is conditional -- which is precisely how
	the `%(name)s` bug happened: the values and the `%s` count drifted apart.
	"""
	clauses = []
	params = []
	# `extra` is (clause, value) pairs, and their values have to land in `params`
	# too -- the clause text and the values must be appended together or the
	# two lists drift apart. Previously only the filter values were collected
	# and every caller had to prepend its date bounds by hand; getting that
	# wrong duplicated a bound into the values while the SQL still had one %s
	# for it.
	for clause, value in extra:
		clauses.append(clause)
		params.append(value)
	for field, value in filters:
		if value:
			clauses.append(f"`{field}` = %s")
			params.append(value)
	return (" where " + " and ".join(clauses)) if clauses else "", params


@frappe.whitelist(allow_guest=False)
def get_stock_balance_summary(
	from_date=None, to_date=None, item_code=None, warehouse=None, company=None, start=0, limit=20
):
	"""Opening -> in -> out -> closing stock, valued and ready to be traced.

	The arithmetic is `closing = opening + in - out`, and the opening is *solved
	for*, not scanned: the closing position is read directly -- from `Bin` when
	the period ends today, which needs no scan at all -- and then
	`opening = closing - in + out`. Computing it independently would mean
	reading every ledger row ever written before the window.

	For a period ending in the past there is no `Bin` snapshot, so the closing
	position is summed from the ledger up to `to_date` instead.

	Returns `valuation_current` rather than pretending otherwise:
	`Bin.valuation_rate` is today's moving average, so it is only meaningful
	beside a balance as of today. The caller leaves value blank for an earlier
	period instead of showing a rate that did not apply then.

	Permission model: requires read on `Bin` AND `Stock Ledger Entry`, checked
	up front, failing closed.

	Args:
		from_date (str, optional): Window start; defaults to the first of the
			month containing `to_date`.
		to_date (str, optional): Window end; defaults to today.
		item_code (str, optional): Restrict to one item.
		warehouse (str, optional): Restrict to one warehouse.
		company (str, optional): Restrict to one company.
		start (int): Offset for paging.
		limit (int): Page size, capped at 200.

	Returns:
		dict: {"rows", "total", "from_date", "to_date", "valuation_current",
		       "today", "performance_warning"}
	"""
	_require_stock_read()

	from_date, to_date, today = _stock_balance_defaults(from_date, to_date)
	start = max(cint(start), 0)
	limit = min(max(cint(limit) or 20, 1), 200)

	filters = [("item_code", item_code), ("warehouse", warehouse), ("company", company)]

	# --- movement inside the window --------------------------------------------
	# Split by the SIGN of actual_qty, not by voucher type: a Purchase Return is
	# an inward movement that happens to have a "return" name.
	window_sql, window_params = _where(
		filters, [("`posting_date` >= %s", from_date), ("`posting_date` <= %s", to_date)]
	)
	movements = frappe.db.sql(
		f"""
		select `item_code`, `warehouse`,
		       sum(case when `actual_qty` > 0 then `actual_qty` else 0 end) as `in_qty`,
		       sum(case when `actual_qty` < 0 then -`actual_qty` else 0 end) as `out_qty`
		from `tabStock Ledger Entry`
		{window_sql}
		group by `item_code`, `warehouse`
		""",
		tuple(window_params),
		as_dict=True,
	)
	movement_by_key = {
		(r.item_code, r.warehouse): (flt(r.in_qty), flt(r.out_qty)) for r in movements
	}

	# --- the closing position ----------------------------------------------------
	valuation_current = to_date >= today
	balance_by_key = {}

	if valuation_current:
		bin_sql, bin_params = _where(filters)
		balance_by_key = {
			(r.item_code, r.warehouse): r
			for r in frappe.db.sql(
				f"""
				select `item_code`, `warehouse`, `stock_uom`, `actual_qty`,
				       `reserved_qty`, `projected_qty`, `stock_value`, `valuation_rate`
				from `tabBin`
				{bin_sql + (" and" if bin_sql else " where")} `actual_qty` != 0
				""",
				tuple(bin_params),
				as_dict=True,
			)
		}
	else:
		to_sql, to_params = _where(filters, [("`posting_date` <= %s", to_date)])
		balance_by_key = {
			(r.item_code, r.warehouse): r
			for r in frappe.db.sql(
				f"""
				select `item_code`, `warehouse`, sum(`actual_qty`) as `actual_qty`
				from `tabStock Ledger Entry`
				{to_sql}
				group by `item_code`, `warehouse`
				""",
				tuple(to_params),
				as_dict=True,
			)
		}

	# --- merge, derive the opening, reconcile -------------------------------------
	rows = []
	for key in set(balance_by_key) | set(movement_by_key):
		item, wh = key
		bal = balance_by_key.get(key)
		in_qty, out_qty = movement_by_key.get(key, (0.0, 0.0))

		closing_qty = flt(bal.actual_qty) if bal else 0.0
		if closing_qty == 0 and in_qty == 0 and out_qty == 0:
			continue

		rows.append(
			{
				"item_code": item,
				"warehouse": wh,
				# .get(), not attribute access: the past-period closing query
				# selects only item_code/warehouse/actual_qty, and a `_dict`
				# raises AttributeError for a key it does not have.
				"stock_uom": (bal.get("stock_uom") if bal else None) or "",
				"opening_qty": closing_qty - in_qty + out_qty,
				"in_qty": in_qty,
				"out_qty": out_qty,
				"closing_qty": closing_qty,
				"reserved_qty": flt(bal.get("reserved_qty")) if bal else 0.0,
				"free_qty": closing_qty - (flt(bal.get("reserved_qty")) if bal else 0.0),
				# Blank, never zero, when the rate does not describe the period.
				"stock_value": flt(bal.stock_value) if valuation_current and bal else None,
				"valuation_rate": flt(bal.valuation_rate) if valuation_current and bal else None,
				"projected_qty": flt(bal.projected_qty) if valuation_current and bal else None,
			}
		)

	rows.sort(key=lambda r: (-abs(flt(r["closing_qty"])), r["item_code"] or ""))
	total = len(rows)

	performance_warning = None
	if total > 200 and not (item_code or warehouse):
		performance_warning = "Narrow this with an item or warehouse filter."

	return {
		"rows": rows[start : start + limit],
		"total": total,
		"from_date": from_date,
		"to_date": to_date,
		"valuation_current": valuation_current,
		"today": today,
		"performance_warning": performance_warning,
	}


@frappe.whitelist(allow_guest=False)
def get_stock_ledger_trail(
	item_code, warehouse, from_date=None, to_date=None, limit=50, company=None
):
	"""Every stock movement for one item in one warehouse, with a running balance.

	This is the answer to "where did this come from". Each row is a Stock Ledger
	Entry carrying its own voucher, so the receipt that added the stock and the
	entry that consumed it are both named rather than averaged into one rate.

	The running balance starts at the window's opening quantity rather than zero,
	so the first row agrees with the summary sitting above it.

	Permission model: requires read on `Stock Ledger Entry`, failing closed.
	"""
	_require_stock_read()

	if not item_code or not warehouse:
		frappe.throw("Pick an item and a warehouse to see its movement history.")

	from_date, to_date, _today = _stock_balance_defaults(from_date, to_date)
	limit = min(max(cint(limit) or 50, 1), 500)

	filters = [("item_code", item_code), ("warehouse", warehouse), ("company", company)]

	window_sql, window_params = _where(
		filters, [("`posting_date` >= %s", from_date), ("`posting_date` <= %s", to_date)]
	)
	entries = frappe.db.sql(
		f"""
		select `posting_date`, `posting_time`, `voucher_type`, `voucher_no`,
		       `actual_qty`, `incoming_rate`, `outgoing_rate`, `stock_value`,
		       `serial_and_batch_bundle`, `company`
		from `tabStock Ledger Entry`
		{window_sql}
		order by `posting_date` asc, `posting_time` asc, `name` asc
		limit {limit}
		""",
		tuple(window_params),
		as_dict=True,
	)

	before_sql, before_params = _where(filters, [("`posting_date` < %s", from_date)])
	opening = 0.0
	opening_rows = frappe.db.sql(
		f"""
		select coalesce(sum(`actual_qty`), 0) as `opening_qty`
		from `tabStock Ledger Entry`
		{before_sql}
		""",
		tuple(before_params),
		as_dict=True,
	)
	if opening_rows:
		opening = flt(opening_rows[0].opening_qty)

	running = opening
	rows = []
	for e in entries:
		qty = flt(e.actual_qty)
		running += qty
		rows.append(
			{
				"posting_date": e.posting_date,
				"posting_time": str(e.posting_time) if e.posting_time else "",
				"voucher_type": e.voucher_type,
				"voucher_no": e.voucher_no,
				"actual_qty": qty,
				"direction": "in" if qty > 0 else ("out" if qty < 0 else ""),
				"running_balance": running,
				"incoming_rate": flt(e.incoming_rate) if e.incoming_rate is not None else None,
				"outgoing_rate": flt(e.outgoing_rate) if e.outgoing_rate is not None else None,
				"stock_value": flt(e.stock_value) if e.stock_value is not None else None,
				"serial_and_batch_bundle": e.serial_and_batch_bundle,
				"company": e.company,
			}
		)

	return {
		"item_code": item_code,
		"warehouse": warehouse,
		"from_date": from_date,
		"to_date": to_date,
		"opening_qty": opening,
		"closing_qty": running,
		"rows": rows,
		"has_more": len(rows) >= limit,
	}


@frappe.whitelist(allow_guest=False)
def get_bundle_trace(bundles):
	"""Which batches and serial numbers sit inside each Serial and Batch Bundle.

	In this ERPNext version serial tracking lives entirely in
	`Serial and Batch Bundle` and its `Serial and Batch Entry` child table --
	there is no `Serial Number` doctype to read (the virtual one is `Serial No`).
	So a bundle id on a ledger row says "batch-tracked", not which batches.

	That child table is separately permissioned and the shopfloor role does not
	necessarily hold it. Rather than failing the request or returning `{}` --
	both of which read as "this item has no batches", the same lie the old
	report told -- this returns `permission_required` and lets the UI say so.
	That reports a real state; it does not grant access.
	"""
	if not isinstance(bundles, list) or not bundles:
		return {"results": {}, "permission_required": False, "requested": []}

	bundles = [b for b in bundles if b][:50]

	try:
		allowed = frappe.has_permission("Serial and Batch Entry", "read")
	except Exception:
		allowed = False

	if not allowed:
		return {"results": {}, "permission_required": True, "requested": bundles}

	entry_dt = frappe.qb.DocType("Serial and Batch Entry")
	rows = frappe.db.sql(
		frappe.qb.from_(entry_dt)
		.select(
			entry_dt.parent,
			entry_dt.batch_no,
			entry_dt.serial_no,
			entry_dt.qty,
			entry_dt.incoming_rate,
		)
		.where(entry_dt.parent.isin(bundles))
		.run(),
		as_dict=True,
	)

	results = {}
	for r in rows:
		entry = results.setdefault(r.parent, {"batches": [], "serials": [], "qty": 0.0})
		if r.batch_no:
			entry["batches"].append({"batch_no": r.batch_no, "qty": flt(r.qty)})
		if r.serial_no:
			entry["serials"].append({"serial_no": r.serial_no, "qty": flt(r.qty)})
		entry["qty"] += flt(r.qty)

	return {"results": results, "permission_required": False, "requested": bundles}
