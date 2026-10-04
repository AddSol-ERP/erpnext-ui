import frappe


def setup_workflows():
    """
    Create default workflows only when a DocType has no Workflow.

    Existing workflows are never modified.
    """

    workflows = [
        get_leave_application_workflow(),
        get_attendance_request_workflow(),
        get_expense_claim_workflow(),
        get_employee_approval_workflow(),
    ]

    for config in workflows:
        create_workflow_if_missing(config)


def get_employee_approval_workflow():
    """
    New Employees start life waiting for HR sign-off.

    Every state is `doc_status: "0"`, and that is not a stylistic choice -- it is
    the only shape Employee supports. Employee is NOT submittable: its DocType
    JSON has no `is_submittable`, and all 108 of its fields have an empty
    `allow_on_submit`. So `apply_workflow` takes the draft-to-draft branch and
    calls plain `doc.save()` (frappe/model/workflow.py), which means no
    `submit()`, no `cancel()`, and none of ERPNext's submit-time validation on a
    master record that payroll, attendance and leave all reference.

    Approval is therefore expressed purely through `workflow_state`.

    Why not `status` (Active / Inactive / Suspended / Left)? Three reasons, all
    verified in erpnext/setup/doctype/employee/employee.py:

      1. There is no "pending" value to write. `validate_status` rejects
         anything outside those four options, so an `update_field` of
         "Pending HR Approval" would throw on every approval.
      2. `update_user_status()` flips the linked User's `enabled` flag on every
         Employee save whenever status is not "Active". Gating on status would
         disable the very employees the ESS warning is meant to tell.
      3. `status` defaults to "Active" and is what payroll generation filters
         on, so it is the wrong tool for an approval concept.

    `allow_edit` is intentionally omitted. It has no server-side enforcement
    (`validate_workflow` only checks transitions), and our GenericForm does not
    implement it, so setting it would make records read-only in ERPNext desk but
    not in this app -- an inconsistency that risks locking employees out of their
    own record.
    """
    return {
        "workflow_name": "Employee HR Approval",
        "doctype": "Employee",

        "states": [
            # ORDER IS LOAD-BEARING. `validate_workflow` falls back to
            # `workflow.states[0].state` when workflow_state is unset
            # (frappe/model/workflow.py), so this row is the entry point for
            # every newly created Employee.
            {"state": "Pending HR Approval", "doc_status": "0"},
            {"state": "Approved", "doc_status": "0"},
            {"state": "Rejected", "doc_status": "0"},
        ],

        "transitions": [
            # Workflow Transition.allowed is a single-role Link, so granting two
            # roles needs two rows. `get_transitions` filters by the logged-in
            # role, so each user only ever sees their own row.
            {
                "state": "Pending HR Approval",
                "action": "Approve",
                "next_state": "Approved",
                "allowed": "HR Manager",
            },
            {
                "state": "Pending HR Approval",
                "action": "Approve",
                "next_state": "Approved",
                "allowed": "HR User",
            },
            {
                "state": "Pending HR Approval",
                "action": "Reject",
                "next_state": "Rejected",
                "allowed": "HR Manager",
            },
            {
                "state": "Pending HR Approval",
                "action": "Reject",
                "next_state": "Rejected",
                "allowed": "HR User",
            },
            # "Resubmit" is not one of the three Action Masters Frappe seeds
            # (Approve / Reject / Review), so the ensure step in
            # create_workflow_if_missing has to create it before this row can
            # link to it.
            {
                "state": "Rejected",
                "action": "Resubmit",
                "next_state": "Pending HR Approval",
                "allowed": "HR Manager",
            },
            {
                "state": "Rejected",
                "action": "Resubmit",
                "next_state": "Pending HR Approval",
                "allowed": "HR User",
            },
        ],
    }


def get_leave_application_workflow():
    return {
        "workflow_name": "Leave Application Approval",
        "doctype": "Leave Application",

        # `update_field` / `update_value` are what `apply_workflow` writes on
        # every transition (frappe/model/workflow.py):
        #
        #     if next_state.update_field:
        #         doc.set(next_state.update_field, next_state.update_value)
        #
        # so they, not the form, own `status` on a Workflow doctype. Leaving
        # them set on the draft states is what makes a submitted leave carry
        # "Approved"/"Rejected" rather than staying "Open", which is the value
        # HRMS's `LeaveApplication.on_submit` insists on.
        "states": [
            {
                "state": "Draft",
                "doc_status": "0",
                "update_field": "status",
                "update_value": "Open",
                "allow_edit": "Employee",
            },
            {
                "state": "Pending Leave Approver",
                "doc_status": "0",
                "update_field": "status",
                "update_value": "Open",
                "allow_edit": "Leave Approver",
            },
            {
                "state": "Pending HR Approval",
                "doc_status": "0",
                "update_field": "status",
                "update_value": "Open",
                "allow_edit": "HR Manager",
            },
            {
                "state": "Approved",
                "doc_status": "1",
                "update_field": "status",
                "update_value": "Approved",
                "allow_edit": "HR Manager",
            },
            {
                "state": "Rejected",
                # Submitted, not a draft: HRMS only allows submission when
                # `status` is already "Approved" or "Rejected", and a rejected
                # leave is final. A doc_status of "0" here would leave a
                # rejected request editable and re-submittable.
                "doc_status": "1",
                "update_field": "status",
                "update_value": "Rejected",
                "allow_edit": "Leave Approver",
            },
            {
                "state": "Cancelled",
                "doc_status": "2",
                "update_field": "status",
                "update_value": "Cancelled",
                "allow_edit": "Leave Approver",
            },
            # Second Cancelled row, kept deliberately. Frappe resolves a state
            # row with `state_row = [...]; state_row = state_row[0]`
            # (frappe/model/workflow.py), so only the FIRST row for a given
            # state is ever consulted and this one is inert. It is retained
            # because it documents intent and costs nothing; `get_transitions`
            # already collapses the two identical Cancel transitions below by
            # role, so no duplicate button reaches the user.
            {
                "state": "Cancelled",
                "doc_status": "2",
                "update_field": "status",
                "update_value": "Cancelled",
                "allow_edit": "HR Manager",
            },
        ],

        "transitions": [
            {
                "state": "Draft",
                "action": "Submit",
                "next_state": "Pending Leave Approver",
                "allowed": "Employee",
            },
            {
                "state": "Pending Leave Approver",
                "action": "Approve",
                "next_state": "Pending HR Approval",
                "allowed": "Leave Approver",
            },
            {
                "state": "Pending Leave Approver",
                "action": "Reject",
                "next_state": "Rejected",
                "allowed": "Leave Approver",
            },
            {
                "state": "Pending HR Approval",
                "action": "Approve",
                "next_state": "Approved",
                "allowed": "HR Manager",
            },
            {
                "state": "Pending HR Approval",
                "action": "Reject",
                "next_state": "Rejected",
                "allowed": "HR Manager",
            },
            # Cancelling is a Workflow transition, not a bare `doc.cancel()`.
            # Once any transition targets a doc_status "2" state,
            # `can_cancel_document` starts returning False (workflow.py), which
            # is Frappe telling callers the Workflow owns cancellation. Going
            # through the transition is also the only path that keeps
            # `workflow_state` and `status` consistent -- a plain cancel would
            # set docstatus 2 while leaving workflow_state at "Approved".
            {
                "state": "Approved",
                "action": "Cancel",
                "next_state": "Cancelled",
                "allowed": "HR Manager",
            },
            {
                "state": "Approved",
                "action": "Cancel",
                "next_state": "Cancelled",
                "allowed": "Leave Approver",
            },
        ],
    }


def get_attendance_request_workflow():
    return {
        "workflow_name": "Attendance Request Approval",
        "doctype": "Attendance Request",

        # No `update_field` / `update_value` anywhere: Attendance Request has no
        # status column of its own, so its outcome lives purely in
        # `workflow_state` plus `docstatus`. `apply_workflow` only writes those
        # two, which is exactly right here.
        "states": [
            {
                "state": "Draft",
                "doc_status": "0",
                "allow_edit": "Employee",
            },
            {
                "state": "Pending Reporting Manager Approval",
                "doc_status": "0",
                "allow_edit": "Leave Approver",
            },
            {
                "state": "Pending HR Approval",
                "doc_status": "0",
                "allow_edit": "HR Manager",
            },
            {
                "state": "Approved",
                "doc_status": "1",
                "allow_edit": "HR Manager",
            },
            {
                # Draft, unlike Leave/Expense: the request is meant to stay
                # editable so it can be corrected and resubmitted.
                "state": "Rejected",
                "doc_status": "0",
                "allow_edit": "HR Manager",
            },
            {
                "state": "Cancelled",
                "doc_status": "2",
                "allow_edit": "HR Manager",
            },
        ],

        "transitions": [
            {
                "state": "Draft",
                "action": "Submit",
                "next_state": "Pending Reporting Manager Approval",
                "allowed": "Employee",
            },
            {
                # "Verified" is a custom Action Master, not one of the three
                # Frappe seeds (Approve / Reject / Review), so the setup step
                # below has to create it before this row can link.
                "state": "Pending Reporting Manager Approval",
                "action": "Verified",
                "next_state": "Pending HR Approval",
                "allowed": "Leave Approver",
            },
            {
                "state": "Pending HR Approval",
                "action": "Approve",
                "next_state": "Approved",
                "allowed": "HR Manager",
            },
            {
                "state": "Pending HR Approval",
                "action": "Reject",
                "next_state": "Rejected",
                "allowed": "HR Manager",
            },
            {
                # Routes cancellation through the Workflow for the same reason
                # as Leave: once a transition targets a doc_status "2" state,
                # `can_cancel_document` returns False and a bare `doc.cancel()`
                # would desync workflow_state from docstatus.
                "state": "Approved",
                "action": "Cancel",
                "next_state": "Cancelled",
                "allowed": "HR Manager",
            },
        ],
    }


def get_expense_claim_workflow():
    return {
        "workflow_name": "Expense Claim Approval",
        "doctype": "Expense Claim",

        # ERPNext models the outcome in `approval_status`, not `status`, and only
        # the terminal states write it. Leaving Draft and Pending HR Approval
        # without an `update_field` is deliberate: a claim should stay whatever
        # ERPNext defaulted it to ("Draft") while it is still in review, and only
        # become Approved/Rejected once a decision is actually recorded.
        "states": [
            {
                "state": "Draft",
                "doc_status": "0",
                "allow_edit": "Employee",
            },
            {
                "state": "Pending HR Approval",
                "doc_status": "0",
                "allow_edit": "HR Manager",
            },
            {
                "state": "Approved",
                "doc_status": "1",
                "update_field": "approval_status",
                "update_value": "Approved",
                "allow_edit": "HR Manager",
            },
            {
                # Submitted, not a draft, so a rejected claim is final and stops
                # offering Submit.
                "state": "Rejected",
                "doc_status": "1",
                "update_field": "approval_status",
                "update_value": "Rejected",
                "allow_edit": "HR Manager",
            },
        ],

        "transitions": [
            {
                "state": "Draft",
                "action": "Submit",
                "next_state": "Pending HR Approval",
                "allowed": "Employee",
            },
            {
                "state": "Pending HR Approval",
                "action": "Approve",
                "next_state": "Approved",
                "allowed": "HR Manager",
            },
            {
                "state": "Pending HR Approval",
                "action": "Reject",
                "next_state": "Rejected",
                "allowed": "HR Manager",
            },
        ],
    }


def create_workflow_if_missing(config):

    doctype = config["doctype"]

    # ---------------------------------------------------------
    # 1. Check DocType exists
    # ---------------------------------------------------------

    if not frappe.db.exists("DocType", doctype):
        frappe.logger().warning(
            f"DocType '{doctype}' does not exist. "
            f"Skipping workflow creation."
        )
        return

    # ---------------------------------------------------------
    # 2. Check if ANY workflow already exists
    # ---------------------------------------------------------

    existing = frappe.db.get_value(
        "Workflow",
        {
            "document_type": doctype
        },
        ["name", "is_active"],
        as_dict=True,
    )

    if existing:
        frappe.logger().info(
            f"Workflow already exists for {doctype}: "
            f"{existing.name}. Skipping."
        )
        return

    # ---------------------------------------------------------
    # 3. Ensure Roles exist
    # ---------------------------------------------------------

    roles = set()

    for state in config["states"]:
        if state.get("allow_edit"):
            roles.add(state["allow_edit"])

    for transition in config["transitions"]:
        if transition.get("allowed"):
            roles.add(transition["allowed"])

    # These roles are created rather than skipped on.
    #
    # `Workflow Transition.allowed` and `Workflow Document State.allow_edit` are
    # REQUIRED Links to Role, so a missing role makes the workflow insert throw
    # LinkValidationError. The previous behaviour was to log a warning and
    # `return`, abandoning the whole workflow -- and because "Leave Approver" is
    # not an ERPNext core role (it ships with HRMS or is customer-created), any
    # site without it silently ended up with NO Leave workflow at all. The
    # frontend then showed a plain Submit button, because get_transitions
    # returns [] and reports no workflow: a silent functional regression with
    # only a log line to show for it.
    #
    # Creating the roles we depend on is more consequential than creating
    # Workflow Action Masters, because a Role is site-wide and carries
    # permissions. It is still the right trade: the app cannot function without
    # these roles, they grant no permissions by themselves, and admins remain
    # free to assign them.
    for role in sorted(roles):
        if frappe.db.exists("Role", role):
            continue

        frappe.get_doc({
            "doctype": "Role",
            "role_name": role,
            "desk_access": 1,
            "is_custom": 1,
        }).insert(ignore_permissions=True)

        frappe.logger().info(f"Created missing Role for workflow: {role}")

    # ---------------------------------------------------------
    # 4. Ensure Workflow States exist
    # ---------------------------------------------------------

    state_names = set()
    action_names = set()

    for state in config["states"]:
        state_names.add(state["state"])

    for transition in config["transitions"]:
        state_names.add(transition["state"])
        state_names.add(transition["next_state"])
        action_names.add(transition["action"])

    for state_name in state_names:

        if frappe.db.exists(
            "Workflow State",
            state_name
        ):
            continue

        doc = frappe.get_doc({
            "doctype": "Workflow State",
            "workflow_state_name": state_name,
        })

        doc.insert(ignore_permissions=True)

    # ---------------------------------------------------------
    # 4b. Ensure Workflow Action Masters exist
    # ---------------------------------------------------------

    # `Workflow Transition.action` is a REQUIRED Link to Workflow Action Master,
    # and Frappe seeds only three of them (frappe/utils/install.py):
    #
    #     Approve, Reject, Review
    #
    # "Submit", "Cancel" and any custom action are therefore absent on a fresh
    # site, and inserting a transition that links to a missing Action Master
    # raises LinkValidationError. Creating the referenced masters here keeps the
    # workflow insertable without anyone hand-creating them in the desk first.
    for action_name in action_names:

        if frappe.db.exists(
            "Workflow Action Master",
            action_name
        ):
            continue

        doc = frappe.get_doc({
            "doctype": "Workflow Action Master",
            "workflow_action_name": action_name,
        })

        doc.insert(ignore_permissions=True)

    # ---------------------------------------------------------
    # 5. Create Workflow
    # ---------------------------------------------------------

    workflow = frappe.get_doc({
        "doctype": "Workflow",
        "workflow_name": config["workflow_name"],
        "document_type": doctype,
        "is_active": 1,
        "send_email_alert": 0,
    })

    # ---------------------------------------------------------
    # 6. States
    # ---------------------------------------------------------

    for state in config["states"]:

        row = workflow.append("states", {})

        row.state = state["state"]
        row.doc_status = state["doc_status"]

        # All three remaining fields are optional, and configs legitimately omit
        # them:
        #   - Attendance Request has no status column at all
        #   - an Expense Claim keeps its defaulted `approval_status` while under
        #     review, so only terminal states set update_field
        #   - the Employee approval workflow omits allow_edit entirely, because
        #     it has no server-side enforcement (validate_workflow only checks
        #     transitions) and setting it would make records read-only in the
        #     ERPNext desk but not in this app
        #
        # Assigning unconditionally both crashes on an omitted key and writes
        # empty strings into Select/Link fields, which ERPNext rejects.
        if state.get("allow_edit"):
            row.allow_edit = state["allow_edit"]

        if state.get("update_field"):
            row.update_field = state["update_field"]
            row.update_value = state["update_value"]

    # ---------------------------------------------------------
    # 7. Transitions
    # ---------------------------------------------------------

    for transition in config["transitions"]:

        row = workflow.append("transitions", {})

        row.state = transition["state"]
        row.action = transition["action"]
        row.next_state = transition["next_state"]
        row.allowed = transition["allowed"]

    # ---------------------------------------------------------
    # 8. Insert
    # ---------------------------------------------------------

    workflow.insert(ignore_permissions=True)

    frappe.db.commit()

    frappe.logger().info(
        f"Created workflow '{config['workflow_name']}' "
        f"for {doctype}"
    )
