import frappe

HR_ROLES = {"HR Manager", "HR User", "Administrator"}


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
