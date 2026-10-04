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
    ]

    for config in workflows:
        create_workflow_if_missing(config)


def get_leave_application_workflow():
    return {
        "workflow_name": "Leave Application Approval",
        "doctype": "Leave Application",

        "states": [
            {
                "state": "Draft",
                "doc_status": "0",
                "allow_edit": "Employee",
            },
            {
                "state": "Pending Leave Approver",
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
                "state": "Rejected",
                "doc_status": "0",
                "allow_edit": "Leave Approver",
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
        ],
    }


def get_attendance_request_workflow():
    return {
        "workflow_name": "Attendance Request Approval",
        "doctype": "Attendance Request",

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
                "allow_edit": "HR Manager",
            },
            {
                "state": "Rejected",
                "doc_status": "0",
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


def get_expense_claim_workflow():
    return {
        "workflow_name": "Expense Claim Approval",
        "doctype": "Expense Claim",

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
                "allow_edit": "HR Manager",
            },
            {
                "state": "Rejected",
                "doc_status": "0",
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
    # 3. Validate roles
    # ---------------------------------------------------------

    roles = set()

    for state in config["states"]:
        if state.get("allow_edit"):
            roles.add(state["allow_edit"])

    for transition in config["transitions"]:
        if transition.get("allowed"):
            roles.add(transition["allowed"])

    missing_roles = [
        role
        for role in roles
        if not frappe.db.exists("Role", role)
    ]

    if missing_roles:
        frappe.logger().warning(
            f"Cannot create workflow for {doctype}. "
            f"Missing roles: {', '.join(missing_roles)}"
        )
        return

    # ---------------------------------------------------------
    # 4. Ensure Workflow States exist
    # ---------------------------------------------------------

    state_names = set()

    for state in config["states"]:
        state_names.add(state["state"])

    for transition in config["transitions"]:
        state_names.add(transition["state"])
        state_names.add(transition["next_state"])

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
        row.allow_edit = state["allow_edit"]

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
