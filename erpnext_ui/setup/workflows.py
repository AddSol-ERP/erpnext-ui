import frappe


def setup_workflows():
    """
    Create default workflows only when the DocType does not already
    have a configured workflow.

    Existing customer workflows are never modified.
    """

    workflows = [
        {
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
        },
        {
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
        },
        {
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
        },
    ]

    for workflow in workflows:
        create_workflow_if_missing(workflow)


def create_workflow_if_missing(config):
    doctype = config["doctype"]

    # IMPORTANT:
    # Do not create another workflow if this DocType already has one.
    existing = frappe.db.exists(
        "Workflow",
        {
            "document_type": doctype,
            "is_active": 1,
        },
    )

    if existing:
        frappe.logger().info(
            f"Workflow already exists for {doctype}: {existing}. "
            "Skipping default workflow."
        )
        return

    # Also check inactive workflows.
    existing_any = frappe.db.exists(
        "Workflow",
        {
            "document_type": doctype,
        },
    )

    if existing_any:
        frappe.logger().info(
            f"Workflow record already exists for {doctype}: "
            f"{existing_any}. Skipping default workflow."
        )
        return

    workflow = frappe.new_doc("Workflow")

    workflow.workflow_name = config["workflow_name"]
    workflow.document_type = doctype
    workflow.is_active = 1
    workflow.send_email_alert = 0

    for state in config["states"]:
        row = workflow.append("states", {})
        row.state = state["state"]
        row.doc_status = state["doc_status"]
        row.allow_edit = state["allow_edit"]

    for transition in config["transitions"]:
        row = workflow.append("transitions", {})
        row.state = transition["state"]
        row.action = transition["action"]
        row.next_state = transition["next_state"]
        row.allowed = transition["allowed"]

    workflow.insert(ignore_permissions=True)

    frappe.logger().info(
        f"Created default workflow '{config['workflow_name']}' "
        f"for {doctype}"
    )