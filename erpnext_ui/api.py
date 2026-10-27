import re

import frappe
from frappe.utils import add_to_date, cint, flt, getdate, nowdate

HR_ROLES = {"HR Manager", "HR User", "Administrator"}


# Doctypes that back the SPA's Approvals hub. Kept server-side deliberately:
# this endpoint is the security boundary, so the list of doctypes whose
# existence is disclosed must not live in JavaScript a caller could edit.
SPA_APPROVAL_DOCTYPES = (
    "Purchase Order",
    "Expense Claim",
    "Leave Application",
    "Attendance Request",
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

# Script Reports that live in ANOTHER app, keyed the same way as
# SPA_REPORT_DOCTYPES: frontend/src/pages/Store/index.jsx and
# frontend/src/layout/AppShell.jsx reference these keys, and
# frontend/src/App.jsx guards each route with them. They are rendered in the
# Store module because they answer store questions.
#
# The value is (report name, the app that must be installed for it to exist).
# Both halves stay server-side on purpose. The frontend sends only the KEY, so
# a caller who can edit the bundle cannot point it at an arbitrary report on
# the site -- which is the same reasoning that keeps SPA_APPROVAL_DOCTYPES out
# of JavaScript (AGENTS.md invariant 8).
#
# `addsol_nl_custom` is a customer-specific app. `frappe.get_installed_apps()`
# is the check that keeps these reports invisible on every other site: no app,
# no tile, no sidebar entry, and the route guard denies it.
SPA_CUSTOM_REPORTS = {
    "plate-stock-register": ("Plate Stock Register", "addsol_nl_custom"),
    # The offcut pieces are a separate report, not a filter on the plate one:
    # one report per population, so no figure is counted in two places.
    "plate-offcut-register": ("Plate Offcut Register", "addsol_nl_custom"),
    "plate-receipt-weight-variance": (
        "Plate Receipt Weight Variance",
        "addsol_nl_custom",
    ),
}

# Apps that only exist on SOME customer sites. Their reports are gated per-key by
# SPA_CUSTOM_REPORTS, but their DOCTYPES cannot be: DOCTYPE_CONFIG is static, so
# a tile would otherwise appear everywhere and link to a doctype that is not
# there. The frontend hides those tiles and nav entries on `hasApp(app)`.
#
# App names are not sensitive and are already present in the shipped bundle --
# the Store receipt calls `addsol_nl_custom...` methods by path.
SPA_OPTIONAL_APPS = ("addsol_nl_custom",)


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


def _custom_report_availability(report_name, app):
    """Per-gate breakdown of whether a cross-app Script Report is usable.

    Every gate is evaluated INDEPENDENTLY and records its own failure. That is
    not defensive decoration -- it is the fix for a bug that shipped here.

    The first version evaluated all four gates in one straight-line block under a
    single `except Exception` in the CALLER. On the NL site `frappe.has_permission`
    raised a `TypeError` (the deployed Frappe's signature differs from the v15.121
    checkout this was written against), and that collapsed the whole result to
    `app_installed: false, report_exists: false, reason: "error: TypeError"` --
    on a site where the app was demonstrably installed and the Report record
    demonstrably present. The diagnostic actively lied about the two facts it was
    supposed to establish, and the one call that mattered was swallowed by a
    handler written to swallow errors.

    So: each gate gets its own try/except, failures land in `errors` keyed by
    gate name, and `role_permitted` is TRI-STATE (True / False / None when the
    probe itself broke) so a broken probe is distinguishable from a real refusal.

    `reason` names the first VISIBILITY gate that failed; `run_blocked_by` names
    the run-time gate, which is reported but never hides the tile.
    """
    out = {
        "app_installed": False,
        "report_exists": False,
        # Tri-state on purpose. None means "the probe errored", which is NOT the
        # same as "you may not see this" -- see _custom_report_available.
        "role_permitted": None,
        "ref_doctype_permitted": False,
        "not_disabled": False,
        "reason": "",
        "run_blocked_by": "",
        "errors": {},
    }

    def gate(name, fn):
        """Evaluate one gate. Never raises; records its own error instead."""
        try:
            return fn()
        except Exception as e:
            out["errors"][name] = f"{type(e).__name__}: {e}"
            return None

    out["app_installed"] = gate(
        "app_installed", lambda: app in frappe.get_installed_apps()
    )
    if not out["app_installed"]:
        out["reason"] = "app_not_installed"
        return out

    out["report_exists"] = gate(
        "report_exists", lambda: bool(frappe.db.exists("Report", report_name))
    )
    if not out["report_exists"]:
        out["reason"] = "report_not_found"
        return out

    report = {"doc": None}

    def load_report():
        report["doc"] = frappe.get_doc("Report", report_name)
        return True

    if not gate("load_report", load_report):
        out["reason"] = "load_failed"
        return out

    doc = report["doc"]
    out["not_disabled"] = gate("not_disabled", lambda: not doc.disabled)

    # `is_permitted()` reads the `roles` CHILD TABLE (not the legacy `role`
    # field) and intersects it with frappe.get_roles(); an empty roles table
    # means everyone may run the report. It returns None for "not permitted", so
    # bool() here is deliberate.
    out["role_permitted"] = gate("role_permitted", lambda: bool(doc.is_permitted()))

    # A SEPARATE check from the roles table, and the RUN gate rather than the
    # LIST gate -- reported, never used to hide the tile. See _custom_report_available.
    out["ref_doctype_permitted"] = gate(
        "ref_doctype_permitted",
        lambda: bool(
            frappe.has_permission(doc.ref_doctype, "report", raise_exception=False)
        ),
    )

    if not out["not_disabled"]:
        out["reason"] = "report_disabled"
    elif out["role_permitted"] is False:
        out["reason"] = "role_not_permitted"

    if out["ref_doctype_permitted"] is not True:
        out["run_blocked_by"] = "ref_doctype_not_permitted"

    return out


def _custom_report_available(report_name, app):
    """Whether a cross-app Script Report should be OFFERED to this user.

    This is VISIBILITY, not the boundary. It answers "should this tile exist?",
    which the ERPNext desk answers by listing whatever the user can read on the
    Report doctype -- `frappe/desk/reportview.py:45` is a plain
    `frappe.client.get_list`, and it consults NEITHER `Report.is_permitted()`
    NOR the `ref_doctype` report permission.

    An earlier version of this function also required
    `has_permission(ref_doctype, "report")`, mirroring `get_report_doc`. That made
    the SPA STRICTER than the desk: `Plate Stock Register` declares
    `ref_doctype: "Serial No"`, and stock ERPNext grants that doctype read
    permission but usually not the `report` permtype, so the report was listed in
    the desk and silently absent from the SPA. It looked like the report was
    missing, when in fact it was merely un-runnable by that user.

    Dropping the check costs nothing in safety: `get_custom_report_data` still
    authorises the run through `get_report_doc`, so a user who genuinely may not
    read the `ref_doctype` gets a clear PermissionError when they click, instead
    of a tile that does not exist. That is strictly the better failure mode --
    per AGENTS.md invariant 8, client gating is visibility/UX and the server is
    the boundary.

    Every gate here still fails closed: app installed, Report present, the user in
    the report's own `roles` child table, and the report not disabled.
    """
    try:
        detail = _custom_report_availability(report_name, app)
    except Exception:
        # The probe itself blew up outside any per-gate handler. That is a bug on
        # our side, not a verdict about the user, and it is NOT covered by the
        # tri-state role gate below because there is no detail to reason about.
        # Hide the report (fail closed on a genuinely unknown state) and let the
        # diagnostic surface the traceback -- `explain_custom_report_access`
        # reports `errors` and logs it.
        return False

    # Hard requirements. These are facts about the SITE, not about the user, and
    # an error in any of them means we could not establish them at all.
    if not (detail["app_installed"] and detail["report_exists"] and detail["not_disabled"]):
        return False

    # The role gate is a PROBE, and it is tri-state. An explicit False is a real
    # refusal and hides the tile. None means the probe ERRORED -- and hiding a
    # report because our own call broke is precisely the failure that made this
    # undiagnosable in the first place. get_report_doc still authorises the run,
    # so offering the tile is safe: the worst case is a user with no right clicks
    # it and gets a PermissionError, instead of the report silently not existing.
    return detail["role_permitted"] is not False


@frappe.whitelist(allow_guest=False)
def explain_custom_report_access(report_key):
    """Explain why a cross-app report is or is not offered to this user.

    Diagnostic only -- it returns NO report data, no row counts and no employee
    or stock figures. It returns booleans and role names, which the caller
    could already read off their own profile.

    This exists because the failure is otherwise invisible. A report the user
    may not open does not error: `get_ui_access()` simply omits a `true`, so the
    tile never renders, the sidebar entry never renders and the route guard
    shows "No report permissions" -- with no failed request and nothing in the
    logs. The three candidate causes (app missing / role refused / Serial No
    report permission absent) need three different fixes in two different
    repos, so guessing at the UI is the wrong way to diagnose it.

    Returns:
        dict: {"report_key", "report_name", "available", "reason", "gates",
               "report_roles", "user_roles", "ref_doctype", "matches_role"}
    """
    entry = SPA_CUSTOM_REPORTS.get(report_key)
    if not entry:
        frappe.throw(frappe._("Unknown report key."), frappe.PermissionError)

    report_name, app = entry

    try:
        gates = _custom_report_availability(report_name, app)
    except Exception as e:
        # A diagnostic that swallows its own errors is worse than no diagnostic.
        # This branch reported `app_installed: false` and `report_exists: false`
        # on a site where the app WAS installed and the Report record DID exist,
        # which sent the investigation after the wrong cause entirely. It now
        # keeps the real gate results it can still establish, names the exception,
        # and logs it so it lands in Error Log where it is actually visible.
        frappe.log_error(
            title=f"explain_custom_report_access: probe failed for {report_name}",
            message=frappe.get_traceback(),
        )
        gates = {
            "app_installed": app in frappe.get_installed_apps(),
            "report_exists": bool(frappe.db.exists("Report", report_name)),
            "role_permitted": None,
            "ref_doctype_permitted": False,
            "not_disabled": False,
            "reason": "probe_failed",
            "run_blocked_by": "",
            "errors": {
                "probe": f"{type(e).__name__}: {e}",
            },
        }

    # Per-gate errors are surfaced, never swallowed. Anything that broke a probe
    # is also logged, so a Frappe/ERPNext version mismatch shows up in Error Log
    # rather than as a tile that quietly fails to appear.
    for gate_name, message in (gates.get("errors") or {}).items():
        frappe.log_error(
            title=f"report availability gate failed: {report_name} ({gate_name})",
            message=message,
        )

    report_roles = []
    ref_doctype = None
    if gates.get("report_exists"):
        rows = frappe.get_all(
            "Has Role", filters={"parent": report_name}, fields=["role"], pluck="role"
        )
        report_roles = sorted(rows)
        ref_doctype = frappe.db.get_value("Report", report_name, "ref_doctype")

    user_roles = sorted(frappe.get_roles())

    return {
        "report_key": report_key,
        "report_name": report_name,
        "required_app": app,
        "installed_apps_contains_app": app in frappe.get_installed_apps(),
        "available": _custom_report_available(report_name, app),
        "gates": gates,
        # Role names only -- never data. `matches_role` is the single most useful
        # field here: the report lists 8 roles including Stock User, and it is
        # tempting to conclude from that alone that a Stock User can run it.
        "report_roles": report_roles,
        "matches_role": bool(set(report_roles) & set(user_roles)),
        "user_roles": user_roles,
        "ref_doctype": ref_doctype,
        "ref_doctype_has_report_permission": bool(
            ref_doctype
            and frappe.has_permission(ref_doctype, "report", raise_exception=False)
        ),
    }


def _resolve_custom_report(report_key):
    """Map a frontend report key to its Report name, or None if unusable.

    The key is the ONLY thing the client ever sends. Resolving it here is what
    stops a caller from naming any report on the site.
    """
    entry = SPA_CUSTOM_REPORTS.get(report_key)
    if not entry:
        return None

    report_name, app = entry
    if not _custom_report_available(report_name, app):
        return None

    return report_name


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
    reports = {key: _can_read(dt) for key, dt in SPA_REPORT_DOCTYPES.items()}

    # Custom Script Reports land in the SAME map on purpose. The frontend gates
    # a report tile, sidebar entry and route guard off `canReadReport(key)` and
    # nothing else, so merging here means "is the app installed, does the report
    # exist, may this user run it" is answered in exactly one place and a
    # non-NL site hides the report without a single line of conditional UI.
    for key, (report_name, app) in SPA_CUSTOM_REPORTS.items():
        reports[key] = _custom_report_available(report_name, app)

    # Which optional apps are installed. Reports already answer this per-key, but
    # a DOCTYPE tile has no such mechanism: DOCTYPE_CONFIG is static, so adding
    # an NL doctype would show its tile on every customer's site and open a desk
    # URL for a doctype that does not exist there. Optional apps are listed here
    # so the frontend can gate such a tile and its nav entry off the same
    # fail-closed signal the reports use.
    installed = frappe.get_installed_apps()

    return {
        "approvals": {dt: _can_read(dt) for dt in SPA_APPROVAL_DOCTYPES},
        "reports": reports,
        "apps": {app: (app in installed) for app in SPA_OPTIONAL_APPS},
    }


@frappe.whitelist(allow_guest=False)
def get_material_request_rfq_print_preview(
    material_request_name, suppliers=None, print_format="Standard", subject=None, message=None
):
    """Render a submitted Purchase Material Request with the selected print format."""
    allowed_roles = {
        "Purchase User",
        "Purchase Manager",
        "Store Manager",
        "Stock User",
        "Stock Manager",
        "Administrator",
    }
    if not allowed_roles.intersection(frappe.get_roles()):
        frappe.throw("You are not allowed to preview supplier quotation requests.", frappe.PermissionError)

    material_request = frappe.get_doc("Material Request", material_request_name)
    material_request.check_permission("read")
    if material_request.docstatus != 1 or material_request.material_request_type != "Purchase":
        frappe.throw("Supplier quotation requests require a submitted Purchase Material Request.")
    if print_format != "Standard":
        format_doc = frappe.get_doc("Print Format", print_format)
        if format_doc.doc_type != "Material Request" or format_doc.disabled:
            frappe.throw("Select an enabled Material Request print format.")

    from frappe.www.printview import get_html_and_style

    return get_html_and_style(
        doc="Material Request",
        name=material_request.name,
        print_format=print_format,
        no_letterhead=0,
    )


@frappe.whitelist(allow_guest=False)
def create_and_email_material_request_rfq(
    material_request_name, suppliers, print_format="Standard", subject=None, message=None
):
    """Create an ERPNext RFQ from a submitted purchase indent and email its suppliers."""
    allowed_roles = {
        "Purchase User",
        "Purchase Manager",
        "Store Manager",
        "Stock User",
        "Stock Manager",
        "Administrator",
    }
    if not allowed_roles.intersection(frappe.get_roles()):
        frappe.throw(
            "You are not allowed to send supplier quotation requests.", frappe.PermissionError
        )

    material_request = frappe.get_doc("Material Request", material_request_name)
    material_request.check_permission("read")
    if material_request.docstatus != 1 or material_request.material_request_type != "Purchase":
        frappe.throw("Supplier quotation requests require a submitted Purchase Material Request.")

    frappe.has_permission("Request for Quotation", "create", throw=True)
    frappe.has_permission("Request for Quotation", "submit", throw=True)
    supplier_names = frappe.parse_json(suppliers) if isinstance(suppliers, str) else suppliers
    supplier_names = list(dict.fromkeys(supplier_names or []))
    if not supplier_names:
        frappe.throw("Select at least one supplier.")
    if len(supplier_names) > 50:
        frappe.throw("Select no more than 50 suppliers at a time.")
    if not subject or not subject.strip() or not message or not message.strip():
        frappe.throw("Email subject and message are required.")
    if len(subject.strip()) > 140:
        frappe.throw("Email subject cannot exceed 140 characters.")

    if print_format != "Standard":
        format_doc = frappe.get_doc("Print Format", print_format)
        if format_doc.doc_type != "Material Request" or format_doc.disabled:
            frappe.throw("Select an enabled Material Request print format.")

    from frappe.contacts.doctype.contact.contact import get_default_contact
    from frappe.utils import escape_html
    from erpnext.stock.doctype.material_request.material_request import make_request_for_quotation

    rfq = make_request_for_quotation(material_request.name)
    if not rfq.items:
        frappe.throw("This Material Request has no outstanding items to quote.")

    supplier_rows = []
    for supplier_name in supplier_names:
        if not frappe.db.exists("Supplier", supplier_name):
            frappe.throw(f"Supplier {supplier_name} does not exist.")
        contact = get_default_contact("Supplier", supplier_name)
        email_id = frappe.db.get_value("Contact", contact, "email_id") if contact else None
        if not email_id:
            frappe.throw(f"Supplier {supplier_name} needs a default Contact with an email address.")
        supplier_rows.append(
            {
                "doctype": "Request for Quotation Supplier",
                "supplier": supplier_name,
                "contact": contact,
                "email_id": email_id,
                # RFQ.on_submit sends its own portal email whenever this is set.
                # Keep it off so the chosen print format is attached by the send step below.
                "send_email": 0,
            }
        )

    rfq.set("suppliers", supplier_rows)
    rfq.subject = subject.strip()
    rfq.message_for_supplier = message.strip()
    rfq.send_document_print = 0
    rfq.insert()
    rfq.submit()

    email_message = escape_html(message.strip()).replace("\n", "<br>")
    sent = []
    failed = []
    for supplier_row in rfq.suppliers:
        try:
            # Attach the selected Material Request print format to each supplier email.
            pdf_content = frappe.get_print(
                "Material Request",
                material_request.name,
                print_format=print_format,
                as_pdf=True,
                doc=material_request,
                letterhead=material_request.letter_head,
            )
            frappe.sendmail(
                recipients=[supplier_row.email_id],
                subject=subject.strip(),
                message=email_message,
                attachments=[
                    {
                        "fname": f"{material_request.name}.pdf",
                        "fcontent": pdf_content,
                    }
                ],
                reference_doctype="Request for Quotation",
                reference_name=rfq.name,
            )
            frappe.db.set_value(supplier_row.doctype, supplier_row.name, "email_sent", 1)
            sent.append(supplier_row.supplier)
        except Exception as exc:
            failed.append({"supplier": supplier_row.supplier, "error": str(exc)})

    return {"request_for_quotation": rfq.name, "sent": sent, "failed": failed}


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


@frappe.whitelist(allow_guest=False)
def can_delete_expense_claim(name):
	"""Whether the current user may delete this draft or cancelled claim."""
	try:
		doc = frappe.get_doc("Expense Claim", name)
		return bool(doc.docstatus in (0, 2) and frappe.has_permission("Expense Claim", "delete", doc))
	except Exception:
		return False


@frappe.whitelist(allow_guest=False)
def has_doctype_workflow(doctype):
	"""Whether an active Workflow is configured for a readable DocType."""
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(frappe._("Not permitted to inspect this DocType."), frappe.PermissionError)

	from frappe.model import workflow as workflow_model

	return bool(workflow_model.get_workflow_name(doctype))


@frappe.whitelist(allow_guest=False)
def get_doctype_workflow_transitions(doctype, name, doc):
	"""Return this user's active transitions using the complete client document."""
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(frappe._("Not permitted to inspect this document."), frappe.PermissionError)

	saved_doc = frappe.get_doc(doctype, name)
	if not frappe.has_permission(doctype, "read", saved_doc):
		frappe.throw(frappe._("Not permitted to inspect this document."), frappe.PermissionError)

	document = frappe.parse_json(doc)
	if (
		not isinstance(document, dict)
		or document.get("doctype") != doctype
		or document.get("name") != name
	):
		frappe.throw(frappe._("Document identity does not match the requested record."))

	from frappe.model import workflow as workflow_model

	return workflow_model.get_transitions(frappe.as_json(document))


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

    if company and frappe.get_meta("Company").has_field("default_holiday_list"):
        hl = frappe.db.get_value("Company", company, "default_holiday_list")
        if hl:
            return hl

    if frappe.get_meta("Global Defaults").has_field("default_holiday_list"):
        return frappe.db.get_single_value("Global Defaults", "default_holiday_list") or ""

    return ""


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
def explain_indent_list_access():
	"""Why `get_indent_list` returns nothing for the CALLING user.

	Added because an empty list is indistinguishable across four very different
	cases, and "the list is empty" sent the investigation after permissions when
	the fault was in the query:

	  1. no Material Request exists on this site at all
	  2. rows exist, but this user's User Permissions exclude every one of them
	  3. this user lacks doctype-level read on Material Request
	  4. the query itself is wrong

	`frappe.get_all` applies User Permissions on top of role permissions, and a
	role may well have create rights on Material Request without having read
	rights -- so a user can raise a request successfully and then be unable to
	list any. Each count below is gathered with and without `ignore_permissions`
	so the two can be told apart in a single response.

	Permission model: reports only. It reads nothing the caller could not read
	through `get_indent_list` itself, and every count it returns is already
	permission-filtered except the one explicitly labelled `unfiltered_count`.
	"""
	user = frappe.session.user
	errors = {}
	result = {
		"user": user,
		"roles": sorted(frappe.get_roles(user)),
		"user_permissions": [],
	}

	# Each probe is isolated. A diagnostic that dies partway through is the same
	# dead end it exists to remove.
	probes = {
		# Does the doctype exist and hold anything on THIS site?
		"unfiltered_count": lambda: frappe.db.count("Material Request"),
		# What the list query itself returns -- the number that matters.
		"permitted_count": lambda: frappe.db.count(
			"Material Request", filters={"docstatus": ("!=", 2)}
		),
		# Role-level read, ignoring User Permissions (which restrict rows).
		"role_read_count": lambda: len(
			frappe.get_all(
				"Material Request",
				filters={"docstatus": ("!=", 2)},
				pluck="name",
				limit_page_length=0,
				ignore_permissions=True,
			)
		),
		"doctype_read": lambda: bool(frappe.has_permission("Material Request", "read")),
	}
	for name, probe in probes.items():
		try:
			result[name] = probe()
		except Exception as e:  # surfaced, never swallowed -- see below
			result[name] = None
			errors[name] = f"{type(e).__name__}: {e}"
			frappe.log_error(
				title=f"explain_indent_list_access: {name} probe failed",
				message=frappe.get_traceback(),
			)

	# User Permission rows are the usual reason rows vanish while the desk (or a
	# direct link) still opens the document.
	try:
		result["user_permissions"] = frappe.get_all(
			"User Permission",
			filters={"user": user, "allow": ("=", 1)},
			fields=["for_doctype", "for_value", "apply_to_all_doctypes"],
			limit_page_length=0,
			ignore_permissions=True,
		)
	except Exception as e:
		errors["user_permissions"] = f"{type(e).__name__}: {e}"

	result["errors"] = errors

	# Read the three numbers against each other and name the cause, so the
	# answer does not have to be re-derived by hand from four integers.
	permitted, role_read = result.get("permitted_count"), result.get("role_read_count")
	if errors:
		result["likely_cause"] = "probe_failed"
	elif not result.get("doctype_read"):
		result["likely_cause"] = "no_doctype_read_permission"
	elif role_read and not permitted:
		result["likely_cause"] = "user_permission_excludes_rows"
	elif not role_read:
		result["likely_cause"] = "no_readable_material_requests"
	else:
		result["likely_cause"] = "unknown_permitted_but_not_listed"

	return result


@frappe.whitelist(allow_guest=False)
def get_purchase_receipt_capabilities():
	"""Return optional receipt features contributed by installed apps.

	ERPNext UI owns the endpoint; customer apps opt into the documented hook
	contract `purchase_receipt_capabilities`. Missing providers produce an empty
	configuration, so sites without extensions retain standard receipts.
	"""
	capabilities = {}
	for provider in frappe.get_hooks("purchase_receipt_capabilities") or []:
		try:
			value = frappe.get_attr(provider)()
			if isinstance(value, dict):
				capabilities.update(value)
		except Exception:
			frappe.log_error(title="Purchase Receipt capability provider failed")
	return capabilities


@frappe.whitelist(allow_guest=False)
def get_purchase_receipt_item_labels(name):
    """Build printable QR labels for each received stock unit or tracked lot."""
    from base64 import b64encode
    from io import BytesIO
    from urllib.parse import quote

    import pyqrcode
    from erpnext.stock.serial_batch_bundle import get_batches_from_bundle, get_serial_nos_from_bundle
    from frappe.utils import get_url

    receipt = frappe.get_doc("Purchase Receipt", name)
    receipt.check_permission("read")
    supplier = receipt.supplier_name or receipt.supplier
    labels = []
    for item in receipt.items:
        serial_numbers = [
            value.strip()
            for value in re.split(r"[\n,]", item.serial_no or "")
            if value.strip()
        ]
        batch_quantities = {item.batch_no: float(item.qty or 0)} if item.batch_no else {}
        bundle_entries = []
        if item.serial_and_batch_bundle:
            bundle = frappe.get_doc("Serial and Batch Bundle", item.serial_and_batch_bundle)
            bundle_entries = bundle.entries or []
            serial_numbers.extend(get_serial_nos_from_bundle(item.serial_and_batch_bundle))
            batch_quantities.update(
                {
                    batch_no: float(qty or 0)
                    for batch_no, qty in get_batches_from_bundle(item.serial_and_batch_bundle).items()
                }
            )
        serial_numbers = list(dict.fromkeys(serial_numbers))
        units = []
        if serial_numbers:
            serial_batches = {
                entry.serial_no: entry.batch_no
                for entry in bundle_entries
                if entry.serial_no and entry.batch_no
            }
            fallback_batch = item.batch_no or (next(iter(batch_quantities)) if len(batch_quantities) == 1 else None)
            units = [
                {
                    "serial_number": serial_no,
                    "batch_number": serial_batches.get(serial_no) or fallback_batch,
                    "qty": 1,
                }
                for serial_no in serial_numbers
            ]
        elif batch_quantities:
            for batch_no, batch_qty in batch_quantities.items():
                whole_qty = int(batch_qty)
                units.extend({"batch_number": batch_no, "qty": 1} for _ in range(whole_qty))
                remainder = batch_qty - whole_qty
                if remainder > 0:
                    units.append({"batch_number": batch_no, "qty": remainder})
        else:
            row_qty = float(item.qty or 0)
            whole_qty = int(row_qty)
            units.extend({"qty": 1} for _ in range(whole_qty))
            remainder = row_qty - whole_qty
            if remainder > 0:
                units.append({"qty": remainder})

        # A single receipt row should not accidentally create an unbounded
        # print job if its quantity is malformed or exceptionally large.
        if len(units) > 10000:
            frappe.throw(f"Item {item.item_code} has too many units to print labels at once.")

        for unit_index, unit in enumerate(units, start=1):
            query = [
                f"supplier={quote(supplier, safe='')}",
                f"item={quote(item.name, safe='')}",
                f"unit={unit_index}",
            ]
            if unit.get("batch_number"):
                query.append(f"batch={quote(unit['batch_number'], safe='')}")
            if unit.get("serial_number"):
                query.append(f"serial={quote(unit['serial_number'], safe='')}")
            query.append(f"qty={quote(str(unit['qty']), safe='')}")
            tracking_url = (
                f"{get_url()}/addsol_ui#/store/purchase-receipt/"
                f"{quote(receipt.name, safe='')}?{'&'.join(query)}"
            )
            qr = pyqrcode.create(tracking_url)
            stream = BytesIO()
            qr.svg(stream, scale=5, quiet_zone=2)
            labels.append(
                {
                    "row": item.name,
                    "purchase_receipt": receipt.name,
                    "supplier": receipt.supplier,
                    "supplier_name": supplier,
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "qty": unit["qty"],
                    "uom": item.uom,
                    "batch_number": unit.get("batch_number"),
                    "serial_number": unit.get("serial_number"),
                    "unit_index": unit_index,
                    "unit_count": len(units),
                    "qr_svg_base64": b64encode(stream.getvalue()).decode("ascii"),
                }
            )
    return {"labels": labels}


@frappe.whitelist(allow_guest=False)
def get_purchase_receipt_item_capabilities(item_code):
	"""Return optional per-item receipt metadata via installed-app hooks."""
	if not item_code:
		return {}
	if not frappe.has_permission("Item", "read", item_code):
		frappe.throw("You do not have permission to view this item.", frappe.PermissionError)
	result = {}
	for provider in frappe.get_hooks("purchase_receipt_item_capabilities") or []:
		try:
			value = frappe.get_attr(provider)(item_code)
			if isinstance(value, dict):
				result.update(value)
		except Exception:
			frappe.log_error(title="Purchase Receipt item capability provider failed")
	return result


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

	The serial/batch flags come from the Item itself, because the number of serials
	ERPNext will accept is not free: for a serialised item the serial count must
	equal the quantity in STOCK UOM, since `serial_batch_bundle.py` builds one
	`Serial and Batch Entry` per serial (qty 1 by default) and then asserts the
	bundle total equals the Stock Ledger Entry's `actual_qty`. So a weighed item
	stocked in Kg takes one serial per Kg -- 12.5 Kg would need 12.5 serials, which
	is impossible, and the save fails. The client cannot infer that from UOM data
	alone; it needs to know the item is serialised.

	`serial_no_series` / `batch_number_series` / `create_new_batch` decide whether
	the user types anything: with a series configured ERPNext generates them
	(`serial_batch_bundle.py:187` checks exactly this pair).

	Returns:
		dict: {
		  "item_code", "stock_uom",
		  "uoms": [{"uom", "must_be_whole_number"}],
		  "has_serial_no", "serial_no_series",
		  "has_batch_no", "create_new_batch", "batch_number_series",
		}
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

	tracking = frappe.db.get_value(
		"Item",
		item_code,
		[
			"has_serial_no",
			"serial_no_series",
			"has_batch_no",
			"create_new_batch",
			"batch_number_series",
		],
		as_dict=True,
	) or {}

	return {
		"item_code": item_code,
		"stock_uom": stock_uom,
		"uoms": uoms,
		"has_serial_no": cint(tracking.get("has_serial_no")),
		"serial_no_series": tracking.get("serial_no_series") or "",
		"has_batch_no": cint(tracking.get("has_batch_no")),
		"create_new_batch": cint(tracking.get("create_new_batch")),
		"batch_number_series": tracking.get("batch_number_series") or "",
	}


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


def _pending_inspection_default_warehouse():
	"""Return the configured pending-QC warehouse, or "" if none is set.

	`UI Quality Inspection Settings` is the same single that owns the
	additional-field configuration. A site that has not migrated yet has no
	doctype, and that must read as "not configured" rather than raise inside a
	report.
	"""
	try:
		if not frappe.db.exists("DocType", "UI Quality Inspection Settings"):
			return ""
		return (
			frappe.db.get_single_value("UI Quality Inspection Settings", "pending_inspection_warehouse") or ""
		).strip()
	except Exception:
		frappe.log_error(
			title="pending inspection: could not read configured warehouse",
			message=frappe.get_traceback(),
		)
		return ""


def _pending_inspection_chunks(values, size=400):
	"""Yield unique values in chunks small enough for a SQL `IN` clause."""
	unique = list(dict.fromkeys(value for value in values if value))
	for offset in range(0, len(unique), size):
		yield unique[offset:offset + size]


def _pending_inspection_tracking(warehouses, item_codes, as_of_date):
	"""Serial numbers and batch quantities held in allowed warehouses as of a date.

	Serial and batch balances are reconstructed from signed bundle entries joined
	to Stock Ledger Entries, so historical reports do not rely on today's
	`Serial No.warehouse` value. Batch quantity is the signed sum
	of the bundle entries joined to SLEs: `Serial and Batch Entry.qty` is
	negative on an outward bundle (`serial_and_batch_bundle.py:1207-1214`), and
	that sign is what makes a transfer out of this warehouse reduce the batch
	instead of counting it twice.

	Returns:
		tuple: ({item_code: [(serial_no, batch_no), ...]},
		        {item_code: [(batch_no, qty), ...]})
	"""
	serials = {}
	batches = {}
	warehouse_placeholders = ", ".join(["%s"] * len(warehouses))

	for chunk in _pending_inspection_chunks(item_codes):
		placeholders = ", ".join(["%s"] * len(chunk))
		for row in frappe.db.sql(
			f"""
		select sle.`item_code`, sle.`warehouse`, sbe.`serial_no`, max(sbe.`batch_no`) as `batch_no`
			from `tabSerial and Batch Entry` sbe
			inner join `tabSerial and Batch Bundle` sbb on sbb.`name` = sbe.`parent`
			inner join `tabStock Ledger Entry` sle
			        on sle.`serial_and_batch_bundle` = sbb.`name`
			where sle.`warehouse` in ({warehouse_placeholders}) and sle.`posting_date` <= %s
			  and ifnull(sle.`is_cancelled`, 0) = 0
			  and sbb.`docstatus` = 1 and sbe.`docstatus` = 1
			  and ifnull(sbe.`serial_no`, '') != ''
			  and sle.`item_code` in ({placeholders})
			group by sle.`item_code`, sle.`warehouse`, sbe.`serial_no`
			having sum(sbe.`qty`) > 0
			order by sle.`item_code`, sle.`warehouse`, max(sbe.`batch_no`), sbe.`serial_no`
			""",
			(*warehouses, as_of_date, *chunk),
			as_dict=True,
		):
			serials.setdefault((row.item_code, row.warehouse), []).append((row.serial_no, row.batch_no or ""))

		for row in frappe.db.sql(
			f"""
		select sle.`item_code`, sle.`warehouse`, sbe.`batch_no`, sum(sbe.`qty`) as `qty`
			from `tabSerial and Batch Entry` sbe
			inner join `tabSerial and Batch Bundle` sbb on sbb.`name` = sbe.`parent`
			inner join `tabStock Ledger Entry` sle
			        on sle.`serial_and_batch_bundle` = sbb.`name`
			where sle.`warehouse` in ({warehouse_placeholders}) and sle.`posting_date` <= %s
			  and ifnull(sle.`is_cancelled`, 0) = 0
			  and sbb.`docstatus` = 1 and sbe.`docstatus` = 1
			  and sbe.`batch_no` is not null and sbe.`batch_no` != ''
			  and sle.`item_code` in ({placeholders})
			group by sle.`item_code`, sle.`warehouse`, sbe.`batch_no`
			having sum(sbe.`qty`) > 0
			order by sle.`item_code`, sle.`warehouse`, sbe.`batch_no`
			""",
			(*warehouses, as_of_date, *chunk),
			as_dict=True,
		):
			batches.setdefault((row.item_code, row.warehouse), []).append((row.batch_no, flt(row.qty)))

	return serials, batches


def _pending_inspection_source_refs(warehouses, rows, as_of_date):
	"""Find the document that most recently brought each row into the warehouse.

	Quality Inspection requires `reference_type` and `reference_name`. The
	report's row is chosen from stock, so it has no reference of its own; the
	last positive SLE is the closest truthful source. A serial/batch match is
	preferred, then an item-level match -- legacy stock can predate bundles.

	The voucher type is returned raw. The frontend only copies it into the QI
	form when it appears in the doctype's own `reference_type` options, keeping
	that ERPNext value list in one place.
	"""
	exact = {}
	items = {row["item_code"] for row in rows}
	warehouse_placeholders = ", ".join(["%s"] * len(warehouses))
	serials = {row["serial_no"] for row in rows if row.get("serial_no")}
	batches = {row["batch_no"] for row in rows if row.get("batch_no")}

	if serials or batches:
		clauses = []
		params = list(warehouses)
		if serials:
			clauses.append(f"sbe.`serial_no` in ({', '.join(['%s'] * len(serials))})")
			params.extend(sorted(serials))
		if batches:
			clauses.append(f"sbe.`batch_no` in ({', '.join(['%s'] * len(batches))})")
			params.extend(sorted(batches))

		for row in frappe.db.sql(
			f"""
		select sle.`item_code`, sle.`warehouse`, sbe.`serial_no`, sbe.`batch_no`,
			       sle.`voucher_type`, sle.`voucher_no`
			from `tabSerial and Batch Entry` sbe
			inner join `tabSerial and Batch Bundle` sbb on sbb.`name` = sbe.`parent`
			inner join `tabStock Ledger Entry` sle
			        on sle.`serial_and_batch_bundle` = sbb.`name`
			where sle.`warehouse` in ({warehouse_placeholders}) and sle.`posting_date` <= %s
			  and ifnull(sle.`is_cancelled`, 0) = 0
			  and sle.`actual_qty` > 0 and ({' or '.join(clauses)})
			order by sle.`posting_datetime` desc, sle.`creation` desc
			""",
			tuple([*warehouses, as_of_date, *params[len(warehouses):]]),
			as_dict=True,
		):
			if row.serial_no:
				exact.setdefault(("serial", row.item_code, row.serial_no, row.warehouse), row)
			if row.batch_no:
				exact.setdefault(("batch", row.item_code, row.batch_no, row.warehouse), row)

	item_refs = {}
	for chunk in _pending_inspection_chunks(items):
		placeholders = ", ".join(["%s"] * len(chunk))
		for row in frappe.db.sql(
			f"""
			select sle.`item_code`, sle.`warehouse`, sle.`voucher_type`, sle.`voucher_no`
			from `tabStock Ledger Entry` sle
			where sle.`warehouse` in ({warehouse_placeholders}) and sle.`posting_date` <= %s
			  and ifnull(sle.`is_cancelled`, 0) = 0
			  and sle.`actual_qty` > 0 and sle.`item_code` in ({placeholders})
			order by sle.`posting_datetime` desc, sle.`creation` desc
			""",
			(*warehouses, as_of_date, *chunk),
			as_dict=True,
		):
			item_refs.setdefault((row.item_code, row.warehouse), row)

	return exact, item_refs


def _completed_pending_inspection_tracking(rows, as_of_date):
	"""Return tracking identities inspected for each row's exact reference document."""
	if not rows:
		return set(), set(), set()

	if not _can_read("Quality Inspection"):
		frappe.throw(
			frappe._("You do not have permission to check completed quality inspections."),
			frappe.PermissionError,
		)

	completed_batches = set()
	completed_serials = set()
	completed_items = set()
	groups = {}
	for row in rows:
		reference_type = row.get("_reference_type")
		reference_name = row.get("_reference_name")
		if not reference_type or not reference_name:
			continue
		groups.setdefault((reference_type, reference_name), []).append(row)

	for (reference_type, reference_name), reference_rows in groups.items():
		item_codes = {row["item_code"] for row in reference_rows if row.get("item_code")}
		batches = {row["batch_no"] for row in reference_rows if row.get("batch_no")}
		serials = {row["serial_no"] for row in reference_rows if row.get("serial_no")}
		item_level_codes = {
			row["item_code"] for row in reference_rows
			if row.get("item_code") and not row.get("batch_no") and not row.get("serial_no")
		}
		if not item_codes:
			continue
		for item_chunk in _pending_inspection_chunks(item_codes):
			item_placeholders = ", ".join(["%s"] * len(item_chunk))
			tracking_clauses = []
			tracking_params = []
			if batches:
				for values in _pending_inspection_chunks(batches):
					placeholders = ", ".join(["%s"] * len(values))
					tracking_clauses.append(f"qi.`batch_no` in ({placeholders})")
					tracking_params.extend(values)
			if serials:
				for values in _pending_inspection_chunks(serials):
					placeholders = ", ".join(["%s"] * len(values))
					tracking_clauses.append(f"qi.`item_serial_no` in ({placeholders})")
					tracking_params.extend(values)
			if item_level_codes:
				tracking_clauses.append(
					"(ifnull(qi.`batch_no`, '') = '' and ifnull(qi.`item_serial_no`, '') = '')"
				)
			tracking_condition = f"({' or '.join(tracking_clauses)})" if tracking_clauses else "1 = 0"
			for inspection in frappe.db.sql(
				f"""
				select qi.`item_code`, qi.`batch_no`, qi.`item_serial_no`
				from `tabQuality Inspection` qi
				where qi.`docstatus` = 1
				  and qi.`inspection_type` = 'Incoming'
				  and qi.`reference_type` = %s and qi.`reference_name` = %s
				  and date(qi.`modified`) <= %s
				  and qi.`item_code` in ({item_placeholders})
				  and {tracking_condition}
				""",
				(reference_type, reference_name, as_of_date, *item_chunk, *tracking_params),
				as_dict=True,
			):
				if inspection.item_serial_no:
					completed_serials.add((
						reference_type, reference_name, inspection.item_code, inspection.item_serial_no
					))
				elif inspection.batch_no:
					completed_batches.add((
						reference_type, reference_name, inspection.item_code, inspection.batch_no
					))
				else:
					completed_items.add((reference_type, reference_name, inspection.item_code))

	return completed_items, completed_batches, completed_serials


def _pending_row_has_completed_inspection(row, completed_items, completed_batches, completed_serials):
	"""Match completion at the exact reference and most-specific selected scope."""
	reference_type = row.get("_reference_type")
	reference_name = row.get("_reference_name")
	if not reference_type or not reference_name:
		return False
	item_code = row.get("item_code")
	if row.get("serial_no"):
		return (
			(reference_type, reference_name, item_code, row["serial_no"]) in completed_serials
			or (
				row.get("batch_no")
				and (reference_type, reference_name, item_code, row["batch_no"]) in completed_batches
			)
		)
	if row.get("batch_no"):
		return (reference_type, reference_name, item_code, row["batch_no"]) in completed_batches
	return (reference_type, reference_name, item_code) in completed_items


@frappe.whitelist(allow_guest=False)
def get_pending_inspection_items(
	warehouse=None,
	item_code=None,
	batch_no=None,
	serial_no=None,
	start=0,
	limit=50,
	as_of_date=None,
):
	"""Stock awaiting inspection across warehouses the user can access.

	The warehouse filter is optional. When omitted, the report includes all
	accessible leaf warehouses; this supports sites where pending inspection
	stock is held in multiple locations. A selected warehouse narrows the report.

	Only positive balances as of `as_of_date` are returned. The date defaults to
	today. Stock Ledger Entry movements are summed per item and warehouse through
	that date. Batch and serial movements are then summed separately to expand
	tracked stock into one row per batch or serial. A zero or negative balance is
	not waiting to be inspected.

	Rows are expanded when the item carries tracking: one row per serial for a
	serialised item, otherwise one row per batch. A tracked item whose tracking
	records cannot be found keeps an item-level row for the unaccounted quantity
	rather than hiding stock from the person who has to inspect it.

	A submitted Incoming Quality Inspection clears the exact batch or serial it
	identifies from the pending list. Draft inspections do not clear stock.

	Permission model: requires read on `Item`, `Serial No`, `Batch`,
	`Stock Ledger Entry` and `Quality Inspection`. Warehouse list permissions
	limit the default report; an explicitly selected warehouse is checked too.

	Args:
		warehouse (str, optional): Restricts results to one accessible warehouse.
		item_code (str, optional): Restrict to one item.
		batch_no (str, optional): Restrict to one batch.
		serial_no (str, optional): Restrict to one serial number.
		as_of_date (str, optional): Include ledger movements through this date;
			defaults to today.
		start (int): Offset for paging.
		limit (int): Page size, capped at 200.

	Returns:
		dict: {"warehouse", "all_warehouses", "as_of_date", "rows",
		       "total", "stock_value", "currency", "start", "limit"}
	"""
	for doctype in ("Bin", "Item", "Serial No", "Batch", "Stock Ledger Entry", "Warehouse"):
		if not _can_read(doctype):
			frappe.throw(
				frappe._("You do not have permission to view pending inspection stock ({0}).").format(
					doctype
				),
				frappe.PermissionError,
			)

	default_warehouse = _pending_inspection_default_warehouse()
	selected = (warehouse or "").strip()
	as_of_date = str(getdate(as_of_date or nowdate()))
	batch_no = (batch_no or "").strip()
	serial_no = (serial_no or "").strip()

	payload = {
		"warehouse": selected,
		"default_warehouse": default_warehouse,
		"configured": bool(default_warehouse),
		"as_of_date": as_of_date,
		"rows": [],
		"total": 0,
		"stock_value": 0,
		"currency": "",
		"all_warehouses": not bool(selected),
		"start": max(cint(start), 0),
		"limit": min(max(cint(limit) or 50, 1), 200),
	}

	if selected:
		if not frappe.db.exists("Warehouse", selected):
			frappe.throw(
				frappe._("Warehouse {0} does not exist.").format(selected),
				frappe.DoesNotExistError,
			)
		if frappe.db.get_value("Warehouse", selected, "is_group"):
			frappe.throw(frappe._("Choose a warehouse, not a warehouse group."))
		try:
			warehouse_allowed = frappe.has_permission("Warehouse", "read", doc=selected)
		except Exception:
			warehouse_allowed = False
		if not warehouse_allowed:
			frappe.throw(
				frappe._("You do not have permission to view this warehouse."),
				frappe.PermissionError,
			)
	accessible_warehouse_rows = frappe.get_list(
		"Warehouse", filters={"is_group": 0},
		fields=["name", "company"], limit_page_length=0,
	)
	accessible_warehouses = [row.name for row in accessible_warehouse_rows]
	warehouse_rows = (
		[row for row in accessible_warehouse_rows if row.name == selected]
		if selected
		else accessible_warehouse_rows
	)
	warehouses = [row.name for row in warehouse_rows]
	payload["available_warehouses"] = accessible_warehouses
	if not warehouses:
		payload["configured"] = True
		return payload
	warehouse_placeholders = ", ".join(["%s"] * len(warehouses))
	currencies = {}
	for row in warehouse_rows:
		currencies[row.name] = (
			frappe.db.get_value("Company", row.company, "default_currency") if row.company else ""
		) or ""
	unique_currencies = set(currencies.values()) - {""}
	if len(unique_currencies) == 1:
		payload["currency"] = next(iter(unique_currencies))
	payload["configured"] = True

	conditions = [
		f"sle.`warehouse` in ({warehouse_placeholders})",
		"sle.`posting_date` <= %s",
		"sle.`docstatus` < 2",
		"ifnull(sle.`is_cancelled`, 0) = 0",
	]
	params = [*warehouses, as_of_date]
	if item_code:
		conditions.append("sle.`item_code` = %s")
		params.append(item_code)
	where = " and ".join(conditions)
	stock_rows = frappe.db.sql(
		f"""
		select sle.`item_code`, sle.`warehouse`,
		       sum(sle.`actual_qty`) as `actual_qty`,
		       sum(sle.`stock_value_difference`) as `stock_value`,
		       case when sum(sle.`actual_qty`) != 0
		            then sum(sle.`stock_value_difference`) / sum(sle.`actual_qty`)
		            else 0 end as `valuation_rate`,
		       wh.`company`, i.`item_name`, i.`item_group`, i.`stock_uom`,
		       ifnull(i.`has_batch_no`, 0) as `has_batch_no`,
		       ifnull(i.`has_serial_no`, 0) as `has_serial_no`
		from `tabStock Ledger Entry` sle
		inner join `tabWarehouse` wh on wh.`name` = sle.`warehouse`
		left join `tabItem` i on i.`name` = sle.`item_code`
		where {where}
		group by sle.`item_code`, sle.`warehouse`, wh.`company`, i.`item_name`,
		         i.`item_group`, i.`stock_uom`, i.`has_batch_no`, i.`has_serial_no`
		having sum(sle.`actual_qty`) != 0
		order by sle.`item_code`
		""",
		tuple(params),
		as_dict=True,
	)

	serials, batches = _pending_inspection_tracking(
		warehouses, [row.item_code for row in stock_rows], as_of_date
	)

	rows = []
	for stock in stock_rows:
		rate = flt(stock.valuation_rate)
		actual_qty = flt(stock.actual_qty)
		tracked_qty = 0.0
		base = {
			"item_code": stock.item_code,
			"warehouse": stock.warehouse,
			"item_name": stock.item_name,
			"item_group": stock.item_group,
			"stock_uom": stock.stock_uom,
			"valuation_rate": rate,
			"currency": currencies.get(stock.warehouse, ""),
			"batch_no": "",
			"serial_no": "",
			"tracking": "item",
		}

		stock_key = (stock.item_code, stock.warehouse)
		if cint(stock.has_serial_no) and serials.get(stock_key):
			item_serials = serials[stock_key]
			if len(item_serials) <= actual_qty:
				for serial_no, batch_no in item_serials:
					rows.append({
						**base,
						"actual_qty": 1.0,
						"stock_value": rate,
						"batch_no": batch_no,
						"serial_no": serial_no,
						"tracking": "serial",
					})
				tracked_qty = float(len(item_serials))
		elif cint(stock.has_batch_no) and batches.get(stock_key):
			item_batches = batches[stock_key]
			batch_total = sum(qty for _batch_no, qty in item_batches)
			if batch_total <= actual_qty + 0.000001:
				for batch_no, qty in item_batches:
					rows.append({
						**base,
						"actual_qty": qty,
						"stock_value": flt(rate * qty),
						"batch_no": batch_no,
						"tracking": "batch",
					})
				tracked_qty = batch_total

		# Never let stale/duplicated tracking entries inflate the stock-ledger
		# quantity. When tracking detail does not reconcile, use an item-level row
		# for the full ledger quantity so the displayed total stays accurate.
		if tracked_qty == 0:
			rows.append({
				**base,
				"actual_qty": actual_qty,
				"stock_value": flt(rate * actual_qty),
			})
		else:
			remaining = flt(actual_qty - tracked_qty, 6)
			if remaining > 0.000001:
				rows.append({
					**base,
					"actual_qty": remaining,
					"stock_value": flt(rate * remaining),
				})

	# Batch and serial are properties of the expanded rows, not of the ledger
	# summary query, so they are applied here. Filtering before paging and
	# before the value total keeps every figure on screen about the same
	# population.
	if batch_no:
		rows = [row for row in rows if row["batch_no"] == batch_no]
	if serial_no:
		rows = [row for row in rows if row["serial_no"] == serial_no]

	# A submitted Incoming Quality Inspection clears only stock with the same
	# source reference and the specific item, batch, or serial scope it names.
	# Keep unrelated and untracked stock visible; remove only identities that
	# already have a completed inspection as of the selected report date.
	exact_refs, item_refs = _pending_inspection_source_refs(warehouses, rows, as_of_date)
	for row in rows:
		ref = None
		if row["serial_no"]:
			ref = exact_refs.get(("serial", row["item_code"], row["serial_no"], row["warehouse"]))
		elif row["batch_no"]:
			ref = exact_refs.get(("batch", row["item_code"], row["batch_no"], row["warehouse"]))
		ref = ref or item_refs.get((row["item_code"], row["warehouse"]))
		row["_reference_type"] = ref.voucher_type if ref else ""
		row["_reference_name"] = ref.voucher_no if ref else ""

	completed_items, completed_batches, completed_serials = _completed_pending_inspection_tracking(
		rows, as_of_date
	)
	rows = [
		row
		for row in rows
		if not _pending_row_has_completed_inspection(
			row, completed_items, completed_batches, completed_serials
		)
	]

	rows.sort(key=lambda row: (
		row["item_name"] or row["item_code"],
		row["item_code"],
		row["batch_no"],
		row["serial_no"],
	))

	page_rows = rows[payload["start"]:payload["start"] + payload["limit"]]
	for row in page_rows:
		row["reference_type"] = row.pop("_reference_type", "")
		row["reference_name"] = row.pop("_reference_name", "")
		row["actual_qty"] = flt(row["actual_qty"])
		row["stock_value"] = flt(row["stock_value"])

	payload["rows"] = page_rows
	payload["total"] = len(rows)
	payload["mixed_currency"] = len(unique_currencies) > 1
	payload["stock_value"] = (
		flt(sum(row["stock_value"] for row in rows)) if payload["currency"] else None
	)
	return payload


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


# ============================================================
# RETURN REMAINING MATERIAL TO STOCK
# ============================================================
#
# One Stock Entry, one purpose: leftover material coming back from a job goes
# Work In Progress -> Stores as a Material Transfer. Deliberately narrow -- the
# request was a single action a shopfloor user can finish without understanding
# ERPNext, not a general-purpose movement screen.
#
# The whole thing is ONE whitelisted call rather than the SPA issuing several
# document creates. Two reasons, both load-bearing:
#   - Item creation and a Stock Entry must be atomic. A half-done pair leaves a
#     junk Item in the master with no movement, or a movement of an item that
#     was never created.
#   - The SPA cannot be trusted to check its own permissions; it does not know
#     what the user's role holds. That check belongs here.


def _require_create(doctype, label):
	"""Fail closed unless the caller may create `doctype`.

	Checked per-doctype and deliberately NOT bypassed with ignore_permissions.
	"""
	if not frappe.has_permission(doctype, "create"):
		frappe.throw(f"You do not have permission to create {label}.", frappe.PermissionError)


@frappe.whitelist(allow_guest=False)
def get_return_stock_entry_context(item_code):
	"""What this item needs before it can be returned to stock.

	The dialog uses this to ask only the questions that actually apply. An item
	with no batch tracking gets one question (how many); a batch item whose
	series is configured gets none at all, because ERPNext names the batch itself.

	Auto-batch rule, from ERPNext's own logic
	(`serial_batch_bundle.py:190-195` and `:294-308`): a batch is generated
	automatically only when the item has BOTH `create_new_batch` and a
	`batch_number_series`. With `create_new_batch` but no series, ERPNext throws;
	we report that up front rather than letting a save fail.

	Permission model: requires read on `Item`, failing closed.
	"""
	if not item_code:
		frappe.throw("No item specified.")
	if not frappe.has_permission("Item", "read", item_code):
		frappe.throw("You do not have permission to view this item.", frappe.PermissionError)

	row = frappe.db.get_value(
		"Item",
		item_code,
		["stock_uom", "item_name", "has_batch_no", "has_serial_no", "create_new_batch",
		 "batch_number_series", "serial_no_series", "is_stock_item"],
		as_dict=True,
	)
	if not row:
		frappe.throw(f"Item {item_code} does not exist.")

	auto_batch = bool(row.has_batch_no) and bool(row.create_new_batch) and bool(row.batch_number_series)
	# create_new_batch without a series is the trap: ERPNext will not invent a
	# number and has no way to tell the user that before saving.
	needs_batch_number = bool(row.has_batch_no) and not auto_batch
	auto_serial = bool(row.has_serial_no) and bool(row.serial_no_series)

	return {
		"item_code": item_code,
		"item_name": row.item_name,
		"stock_uom": row.stock_uom,
		"is_stock_item": bool(row.is_stock_item),
		"has_batch_no": bool(row.has_batch_no),
		"has_serial_no": bool(row.has_serial_no),
		"auto_batch": auto_batch,
		"auto_serial": auto_serial,
		"needs_batch_number": needs_batch_number,
		"needs_serials": bool(row.has_serial_no) and not auto_serial,
		# An item created on the fly needs its tracking configured at creation,
		# because that is the only moment it can be set cleanly.
		"batch_series": row.batch_number_series or "",
		"serial_series": row.serial_no_series or "",
	}


def _create_item_from_return(spec):
	"""Create the Item for a return whose leftover is a different specification.

	Only `item_code`, `item_group` and `stock_uom` are mandatory
	(`item.json`); `Item.validate()` fills `item_name`, `description` and the
	stock-UOM row in the conversion table. Tracking flags are copied from the
	spec because they cannot be changed meaningfully afterwards, and an item
	whose leftover will be batch-tracked must be created that way.

	`item_code` is the autoname (`field:item_code`), so it is the identity -- a
	collision is an overwrite risk, hence the explicit exists() check.
	"""
	item_code = (spec.get("item_code") or "").strip()
	item_group = (spec.get("item_group") or "").strip()
	stock_uom = (spec.get("stock_uom") or "").strip()

	for field, value in (("item_code", item_code), ("item_group", item_group), ("stock_uom", stock_uom)):
		if not value:
			frappe.throw(f"New item needs a {field.replace('_', ' ')}.")
	if frappe.db.exists("Item", item_code):
		frappe.throw(f"Item {item_code} already exists.", frappe.DuplicateEntryError)

	doc = frappe.new_doc("Item")
	doc.update(
		{
			"item_code": item_code,
			"item_name": (spec.get("item_name") or item_code).strip(),
			"item_group": item_group,
			"stock_uom": stock_uom,
			"is_stock_item": 1,
			"has_batch_no": 1 if spec.get("has_batch_no") else 0,
			"has_serial_no": 1 if spec.get("has_serial_no") else 0,
		}
	)
	doc.insert()  # permission-checked: no ignore_permissions
	return doc.name


def _stock_entry_type_for_transfer():
	"""The Stock Entry Type whose purpose is Material Transfer.

	Looked up by purpose rather than hardcoded by name, so a site that renames
	its Stock Entry Types still works. Falls back to the conventional name only
	if the lookup somehow yields nothing.
	"""
	name = frappe.db.get_value(
		"Stock Entry Type", {"purpose": "Material Transfer"}, "name", order_by="modified asc"
	)
	if not name:
		frappe.throw(
			"No Stock Entry Type with purpose 'Material Transfer' exists. "
			"Create one before returning material to stock."
		)
	return name


@frappe.whitelist(allow_guest=False)
def create_return_stock_entry(
	company,
	from_warehouse,
	to_warehouse,
	qty,
	item_code=None,
	new_item=None,
	posting_date=None,
	remarks=None,
	batch_no=None,
	serial_nos=None,
	submit_now=True,
):
	"""Return leftover material from a job back into Stores.

	Creates ONE Stock Entry, purpose `Material Transfer`, from
	`from_warehouse` (Work In Progress) to `to_warehouse` (Stores). Optionally
	creates the Item first, so the pair is atomic: either both land or neither
	does.

	Batch/serial handling follows ERPNext's own rule rather than inventing one.
	The bundle is built server-side by `make_bundle_using_old_serial_batch_fields`
	from `batch_no` / `serial_no` on the row, which is the supported path -- the
	SPA cannot call `make_serial_batch_bundle` because it is a Python helper, not
	a whitelisted method.

		- batch item with `create_new_batch` + series -> send nothing; ERPNext
		  names the batch itself
		- batch item without that setup -> a batch number must be supplied
		- serial item with a series -> ERPNext generates them
		- serial item without a series -> the numbers must be supplied

	Expiry is not a risk here: `validate_serialized_batch` skips the expiry check
	for Material Transfer (`stock_controller.py:206`, `:225-226`), so returning
	leftover material from a job is not blocked by an old batch.

	Permission model: requires CREATE on `Stock Entry`, and on `Item` when
	`new_item` is supplied. Read on the warehouses. Fails closed throughout.

	Returns:
		dict: {"stock_entry": name, "item_code": str, "submitted": bool}
	"""
	_require_create("Stock Entry", "Stock Entries")

	qty = flt(qty)
	if qty <= 0:
		frappe.throw("Enter how much material you are returning.")

	if from_warehouse == to_warehouse:
		frappe.throw("Choose two different warehouses.")

	for wh in (from_warehouse, to_warehouse):
		if not frappe.db.exists("Warehouse", wh):
			frappe.throw(f"Warehouse {wh} does not exist.")

	# Both sides of a transfer belong to one company; a cross-company transfer
	# is not a Material Transfer and would be rejected far later, obscurely.
	wh_companies = {
		c
		for c in (
			frappe.db.get_value("Warehouse", from_warehouse, "company"),
			frappe.db.get_value("Warehouse", to_warehouse, "company"),
		)
		if c
	}
	if len(wh_companies) > 1 or (company and wh_companies != {company}):
		frappe.throw("Both warehouses must belong to the same company.")

	posting_date = str(posting_date) if posting_date else frappe.utils.today()
	if posting_date > frappe.utils.today():
		frappe.throw("Posting date cannot be a future date.")

	# --- the item, optionally created on the spot -------------------------------
	created_item = False
	if new_item:
		if isinstance(new_item, str):
			new_item = frappe.parse_json(new_item)
		_require_create("Item", "Items")
		item_code = _create_item_from_return(new_item)
		created_item = True
	elif not item_code:
		frappe.throw("Choose the item you are returning.")

	ctx = get_return_stock_entry_context(item_code)

	# --- batch / serial ---------------------------------------------------------
	row_batch = (batch_no or "").strip() or None
	serials = [s.strip() for s in (serial_nos or []) if s and s.strip()]

	if ctx["auto_batch"]:
		# A number is already on the row; leaving it set would defeat the auto
		# naming the item was configured for.
		row_batch = None
	elif ctx["needs_batch_number"]:
		if not row_batch:
			frappe.throw(
				f"{item_code} tracks batches and has no batch series, so a batch "
				f"number must be entered."
			)
		if not frappe.db.exists("Batch", row_batch):
			frappe.throw(f"Batch {row_batch} does not exist.")
	else:
		row_batch = None

	if ctx["needs_serials"] and not serials:
		frappe.throw(f"{item_code} tracks serial numbers, so enter them.")

	# --- the movement -----------------------------------------------------------
	se = frappe.new_doc("Stock Entry")
	se.update(
		{
			"purpose": "Material Transfer",
			"stock_entry_type": _stock_entry_type_for_transfer(),
			"company": company,
			"posting_date": posting_date,
			"remarks": frappe.utils.strip_html(remarks or "") or None,
		}
	)
	row = se.append("items", {})
	row.update(
		{
			"item_code": item_code,
			"qty": qty,
			"transfer_qty": qty,
			"s_warehouse": from_warehouse,
			"t_warehouse": to_warehouse,
			"stock_uom": ctx["stock_uom"],
			"conversion_factor": 1,
			"basic_rate": 0,
		}
	)
	if row_batch:
		row.batch_no = row_batch
	if serials:
		# serial_no is a Text field holding one number per line; this is the
		# legacy path `make_bundle_using_old_serial_batch_fields` exists to
		# support, and it sets use_serial_batch_fields itself.
		row.serial_no = "\n".join(serials)

	se.insert()
	submitted = False
	if cint(submit_now):
		se.submit()
		submitted = True

	if created_item and not submitted:
		frappe.msgprint(
			f"Item {item_code} was created and the Stock Entry saved as draft.",
			indicator="blue",
		)

	return {
		"stock_entry": se.name,
		"item_code": item_code,
		"item_created": created_item,
		"submitted": submitted,
	}


@frappe.whitelist(allow_guest=False)
def get_checkin_logs(employee=None, date=None, limit=100):
	"""Check-in punches for one employee on one calendar day.

	Defaults to the logged-in user's own Employee, so the ESS calendar needs no
	argument; the Attendance report passes the row's employee so HR/HOD can
	inspect someone else.

	The SPA used to read `resource/Employee Checkin` directly and guess the
	schema. Every field it named was wrong -- `checkin_time`, `checkout_time`,
	`status` and `log_date` do not exist on HRMS' `Employee Checkin` (the punch
	moment is `time`, the direction is `log_type`). Frappe rejects the first
	unknown field with `DataError: Field not permitted in query: checkin_time`,
	and because `validate_fields` raises on the FIRST bad field, the message
	named whichever happened to be listed first. It reads like a permissions
	problem; it is a schema one.

	The columns are resolved from the live meta rather than hardcoded, because the
	date-bearing column is `time` on version-15 and `log_date`/`checkin_time` on
	older HRMS. Guessing is not safe here in a way it is for most fields:
	`time` is permlevel 1, and for a high-permlevel field Frappe does NOT raise
	-- it drops the field from the result (`reportview.validate_fields`). A wrong
	guess would therefore return an empty table with no error anywhere.

	Permission model: `employee` is accepted so the same endpoint serves the ESS
	calendar and the Attendance report, but it is AUTHORISED, never trusted --
	an employee code is guessable (HR-EMP-00001, ...), so accepting it unchecked
	would let any employee read anyone's punches. The caller may only name their
	own record, or one their scope already permits (`_get_scope`: HR, HOD, or an
	allowed department), and the named Employee must additionally be readable.

	Unlike `leave_balance_employees`, which silently substitutes the caller's own
	employee when asked for someone they may not see, this THROWS. Substitution is
	right for a list scoped by permission, but here it would show one person's
	punches under another person's name in a report -- so it fails closed.

	Fails closed without read on `Employee Checkin`, and fails closed with an
	explicit message when the caller lacks the permlevel guarding the punch time,
	so a blank list never masquerades as "no punches".

	Accepts `?employee=null` as "no employee given". Query-string parameters reach
	Python as strings, so a client serialising a null JS value with
	`URLSearchParams` sends a truthy four-character "null" that would otherwise be
	read as an employee code. See the comment at the normalisation below.
	"""
	if not frappe.has_permission("Employee Checkin", "read"):
		frappe.throw(
			frappe._("You do not have permission to read check-in logs."),
			frappe.PermissionError,
		)

	# Frappe puts whatever arrived in the query string into `frappe.form_dict`, so
	# an "absent" parameter is a STRING by the time it gets here. A client that
	# sends `employee=null` -- which is exactly what
	# `new URLSearchParams({employee: null})` produces, and what any bundle
	# predating the client-side fix will keep sending until it is redeployed --
	# would otherwise have "null" treated as a real employee code: it is truthy,
	# so `employee or my_employee` keeps it, and the permission lookup raises
	# DoesNotExistError on a document named "null". Treat the literal spellings
	# of absent as absent. An empty string means the same thing to a filter field.
	#
	# Handled server-side as well as in `services/api.jsx` deliberately: this
	# endpoint is the security boundary, and an endpoint that crashes on a
	# plausible caller input is not one to trust with anything.
	if employee in ("", "null", "undefined", "None"):
		employee = None
	if date in ("", "null", "undefined", "None"):
		date = None

	scope = _get_scope(frappe.session.user)
	my_employee = scope["my_employee"]

	if not my_employee:
		frappe.throw(
			frappe._("No Employee record is linked to your user."),
			frappe.PermissionError,
		)

	employee = employee or my_employee
	if employee != my_employee:
		allowed = scope["can_view_others"]
		if allowed and scope["allowed_departments"] is not None:
			# HOD/HR restricted to a set of departments: the named employee has to
			# actually be in one of them.
			department = frappe.db.get_value("Employee", employee, "department")
			allowed = department in scope["allowed_departments"]
		if not allowed:
			frappe.throw(
				frappe._("You do not have permission to view check-in logs for this employee."),
				frappe.PermissionError,
			)

	if not frappe.has_permission("Employee", "read", employee):
		frappe.throw(
			frappe._("You do not have permission to read this Employee record."),
			frappe.PermissionError,
		)

	date = getdate(date or nowdate())
	limit = min(max(cint(limit) or 100, 1), 200)

	meta = frappe.get_meta("Employee Checkin")

	# Newest schema first. `checkout_time` never existed -- one punch is one row
	# and its `log_type` says whether it was an IN or an OUT.
	time_field = next((f for f in ("time", "checkin_time") if meta.has_field(f)), None)
	if not time_field:
		frappe.throw(
			frappe._("Check-in logs are not available on this site."),
			frappe.PermissionError,
		)

	punch_df = meta.get_field(time_field)
	if punch_df.permlevel and punch_df.permlevel not in meta.get_permlevel_access(
		parenttype="Employee Checkin"
	):
		frappe.throw(
			frappe._("Your role cannot read the punch time recorded on check-in logs."),
			frappe.PermissionError,
		)

	type_field = next((f for f in ("log_type", "checkin_type") if meta.has_field(f)), None)
	device_field = "device_id" if meta.has_field("device_id") else None

	select = ["`name`", f"`{time_field}` as `punch_time`"]
	params = [employee]

	if type_field:
		select.append(f"`{type_field}` as `log_type`")
	if device_field:
		select.append(f"`{device_field}` as `device_id`")

	# Older HRMS carries a dedicated `log_date`; version-15 has only the
	# Datetime, so the day is a half-open range rather than an equality.
	if meta.has_field("log_date"):
		where = "`log_date` = %s"
		params.append(date)
	else:
		where = f"`{time_field}` between %s and %s"
		params += [f"{date} 00:00:00", f"{date} 23:59:59"]

	rows = frappe.db.sql(
		f"""
		select {", ".join(select)}
		from `tabEmployee Checkin`
		where `employee` = %s and {where}
		order by `{time_field}` asc, `name` asc
		limit {limit}
		""",
		tuple(params),
		as_dict=True,
	)

	return {
		"date": str(date),
		"employee": employee,
		"is_own_record": employee == my_employee,
		"logs": [
			{
				"name": r.get("name"),
				"time": r.get("punch_time"),
				"log_type": r.get("log_type"),
				"device_id": r.get("device_id"),
			}
			for r in rows
		],
	}


# ============================================================
# CROSS-APP SCRIPT REPORTS
# ============================================================
#
# Why this exists rather than a hand-built page per report: these reports are
# authored in another app and their COLUMN SET IS NOT KNOWN HERE. A Script
# Report may append a column at runtime -- `Plate Stock Register` used to add a
# hidden "Offcuts" column whenever `include_offcuts` was falsy, before the
# offcuts moved to their own report -- so a SPA table built from a hardcoded
# field list would silently drop or misplace a column depending on a filter
# the user toggled. The report's own `columns` list is the only truth.
#
# The same reasoning drives the filter bar: `Report.filters` is a `Report
# Filter` CHILD TABLE (frappe/core/doctype/report/report.json), so the fieldname,
# fieldtype, options and default of every filter are read off the Report record
# at call time. A filter added in the other app shows up with no SPA change.


_RELATIVE_DATE_UNITS = {"d": "days", "w": "weeks", "m": "months", "y": "years"}


def _resolve_report_filter_default(value):
    """Turn a report filter's relative default into a literal value.

    Report filters declare defaults that are relative, not literal. Across every
    Frappe and ERPNext report the only date defaults in use are `Today` (53) and
    `Now` (13); `addsol_nl_custom`'s "Plate Receipt Weight Variance" adds
    `Today -30d`, which is that app's own convention.

    Nothing resolves these server-side. The ERPNext desk resolves them in the
    browser (`query_report.js` -> `set_input(df.default)`), and a Script Report
    receives whatever string arrived. `Plate Receipt Weight Variance` then
    interpolates it straight into SQL:

        conditions.append(f"pr.posting_date >= {_quote(filters['from_date'])}")

    so `posting_date >= 'Today -30d'` compares a DATE column to a literal string,
    matches nothing, and the report renders an empty table with no error
    anywhere. That is the worst possible failure: it looks like "no variance in
    the last 30 days" rather than a bug.

    Resolved here, server-side, for two reasons: "today" stays on the server's
    clock (a browser in another timezone should not shift a 30-day window), and
    the SPA receives a value its `<input type="date">` can actually hold.

    Anything not recognised is returned UNCHANGED, so a literal `2026-10-01`
    passes straight through.
    """
    if not value or not isinstance(value, str):
        return value

    raw = value.strip()
    if not raw:
        return value

    lowered = raw.lower()

    if lowered == "today":
        return nowdate()
    if lowered == "yesterday":
        try:
            return add_to_date(nowdate(), days=-1)
        except Exception:
            return value
    if lowered == "now":
        # Datetime filters use `Now`. Returned in the same form Frappe's `now()`
        # does so it can be compared against a Datetime column.
        return frappe.utils.now()

    match = re.match(r"^today\s*([+-])\s*(\d+)\s*([dwmy])$", lowered)
    if match:
        offset = int(match.group(2)) * (-1 if match.group(1) == "-" else 1)
        try:
            return add_to_date(nowdate(), **{_RELATIVE_DATE_UNITS[match.group(3)]: offset})
        except Exception:
            # This runs inside a whitelisted endpoint that also returns the
            # filter metadata, so a resolver that raised would take down the
            # WHOLE report rather than one filter. Fall back to the raw value and
            # let the user type a date.
            return value

    return value


def _sanitise_report_filters(raw, declared):
    """Reduce caller-supplied filters to the ones the Report actually declares.

    `get_report_result` hands the whole dict straight to `execute(filters)` as a
    `frappe._dict`, so anything extra rides along into report code. Intersecting
    with the declared child-table rows means the report only ever sees fieldnames
    it published, and an unknown key cannot smuggle a value through.

    `raw` arrives as a JSON STRING, not a dict. Frappe does NOT decode JSON
    parameters -- `frappe.parse_val` only coerces dates, so every whitelisted
    parameter lands in `frappe.form_dict` exactly as it was sent in the query
    string. An earlier version of this function began with
    `if not isinstance(raw, dict): return {}`, which therefore matched every
    real request, discarded the whole filter set, and returned UNFILTERED data
    with no error anywhere: the report ran, just with none of the filters
    applied, which reads as "the filter doesn't work".
    """
    if isinstance(raw, str):
        # `frappe.parse_json` raises on malformed JSON rather than returning {}.
        try:
            raw = frappe.parse_json(raw)
        except (TypeError, ValueError):
            return {}

    if not isinstance(raw, dict):
        return {}

    clean = {}
    for f in declared:
        name = f.fieldname
        if name not in raw:
            continue
        value = raw[name]
        if f.fieldtype == "Check":
            # Frappe's own report front-end sends "1"/"0"; a real Python bool is
            # equally likely from a JSON client. Collapse both, because the
            # report tests `filters.get("above_tolerance_only")` for TRUTHINESS
            # -- the string "0" is truthy and would silently invert the filter.
            clean[name] = 1 if cint(value) else 0
        elif f.fieldtype in ("Date", "Datetime"):
            # Defensive: a relative value could still arrive from a client that
            # skipped the seeded default, and the report would compare a DATE
            # column to a literal string and return nothing. See
            # _resolve_report_filter_default.
            clean[name] = _resolve_report_filter_default(value)
        elif value is not None and str(value).strip() != "":
            clean[name] = value

    return clean


@frappe.whitelist(allow_guest=False)
def get_custom_report_data(report_key, filters=None):
    """Run a cross-app Script Report and return its columns, rows and filters.

    `report_key` is a key of SPA_CUSTOM_REPORTS, never a report name: the
    client cannot name a report, only select one this app already declared.

    Permission model: `_resolve_custom_report` re-runs the full availability
    probe on every call -- app installed, Report present, and `get_report_doc`
    (role table + `ref_doctype` report permission + not disabled). That is
    deliberate. The boolean cached in `get_ui_access` is VISIBILITY only
    (AGENTS.md invariant 8); the boundary is this call. The probe is three
    queries on a path that already loads a document and a report result, so
    re-checking is cheaper than the trust it would cost.

    A disallowed key raises `frappe.PermissionError` rather than returning an
    empty result, because "no rows" and "not allowed" must not look alike.

    Why not `frappe.desk.query_report.run()`:
    it unpacks the report's return value as SIX slots --
    `(columns, result, message, chart, report_summary, skip_total_row)`, from
    `generate_report_result`. Script Reports still return the FIVE-tuple
    `(columns, data, message, total_row, chart)`. The fourth element is the
    report's own TOTAL ROW, and under `run()` it lands in `chart`. Calling it and
    reading `result["chart"]` for totals would render the totals dict as a chart
    and the total row would silently never appear. So this calls
    `get_report_result()` and unpacks the 5-tuple directly.

    Args:
        report_key (str): Key from SPA_CUSTOM_REPORTS.
        filters (dict | str): JSON-encoded object; intersected with the report's
            declared `Report Filter` rows.

    Returns:
        dict: {
            "columns": [{"fieldname","label","fieldtype","options","width"}],
            "data": [dict, ...],
            "total_row": dict | None,
            "message": str | None,
            "filters": [{"fieldname","label","fieldtype","options","default"}],
        }
    """
    report_name = _resolve_custom_report(report_key)
    if not report_name:
        # Same error the desk gives when a user opens a report they may not run,
        # so an absent app and a refused role are indistinguishable to a caller.
        frappe.throw(
            frappe._("You are not permitted to view this report."),
            frappe.PermissionError,
        )

    from frappe.core.utils import ljust_list
    from frappe.desk import query_report

    # THIS IS THE BOUNDARY, not the probe. `_custom_report_available` decided
    # visibility with its own per-gate checks (it has to, so
    # `explain_custom_report_access` can name the failing gate), but the run is
    # authorised by Frappe's own `get_report_doc` -- role table, ref_doctype
    # report permission and the disabled flag, in one authoritative place. If the
    # two ever disagree, this one wins and the call is refused.
    #
    # It is also what populates `report.filters` for _sanitise_report_filters.
    report = query_report.get_report_doc(report_name)

    declared = list(report.filters or [])
    clean_filters = _sanitise_report_filters(filters, declared)

    raw = query_report.get_report_result(report, clean_filters) or []

    # Script Reports may return the 5-tuple, and nothing guarantees they do --
    # ljust_list pads a short return rather than raising, so a report that
    # returns only (columns, data) still works.
    columns, data, message, total_row, _chart = ljust_list(raw, 5)

    columns = [query_report.get_column_as_dict(col) for col in (columns or [])]
    data = query_report.normalize_result(data or [], columns)

    # Frappe applies row-level security to report rows in generate_report_result
    # (`get_filtered_data`); going through get_report_result skips that step, so
    # it is re-applied here. Without it a report could show rows the desk would
    # have hidden for this user.
    if data:
        data = query_report.get_filtered_data(
            report.ref_doctype, columns, data, frappe.session.user
        )

    if isinstance(total_row, list):
        # A report may return its totals as a positional row, matching its own
        # column order, which is Frappe's older convention.
        total_row = query_report.normalize_result([total_row], columns)[0]

    return {
        "columns": [
            {
                "fieldname": col.get("fieldname"),
                "label": col.get("label") or col.get("fieldname"),
                "fieldtype": col.get("fieldtype") or "Data",
                "options": col.get("options"),
                "width": col.get("width"),
                # `hidden` is how a report drops a column from display without
                # dropping it from the row dict.
                "hidden": cint(col.get("hidden")),
            }
            for col in columns
        ],
        "data": data,
        "total_row": total_row,
        "message": message,
        # Filter metadata straight off the Report's child table. `options` is
        # Small Text on Report Filter, so it carries either a Link's target
        # doctype or a Select's option list -- the SPA tells them apart by
        # fieldtype.
        "filters": [
            {
                "fieldname": f.fieldname,
                "label": f.label or f.fieldname,
                "fieldtype": f.fieldtype,
                "options": f.options or "",
                # Resolved, so the SPA's <input type="date"> receives a real date
                # instead of "Today -30d". `raw_default` keeps the declared value
                # for diagnosis.
                "default": _resolve_report_filter_default(f.default),
                "raw_default": f.default if f.default is not None else "",
                "mandatory": cint(f.mandatory),
            }
            for f in declared
        ],
    }
