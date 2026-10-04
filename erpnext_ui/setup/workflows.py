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


def ensure_workflow_state(name):
    """Create the `Workflow State` `name` unless it already exists.

    `Workflow.states` and `Workflow.transitions` are child tables whose state
    fields are Links to `Workflow State`, and `Document._validate_links()` runs
    during the Workflow's own insert. Referencing a state that does not exist
    yet therefore fails the entire workflow:

        frappe.exceptions.LinkValidationError: Could not find Row #2:
        State: Pending Leave Approver, Row #3: State: Pending HR Approval, ...

    Frappe only pre-creates `Pending`, `Approved` and `Rejected` as Workflow
    States (frappe/utils/install.py), so every custom state has to exist before
    the workflow that names it. The doctype uses
    `autoname: field:workflow_state_name`, meaning the document name IS that
    field -- so the name has to match the workflow rows exactly.
    """
    if not name or frappe.db.exists("Workflow State", name):
        return False

    frappe.get_doc(
        {
            "doctype": "Workflow State",
            "workflow_state_name": name,
        }
    ).insert(ignore_permissions=True)
    return True


def ensure_workflow_action(name):
    """Same for `Workflow Action Master` -- `transitions.action` is a Link too.

    Frappe installs `Approve`, `Reject` and `Review` by default, but not every
    action a workflow references, so this closes the same hole for actions.
    """
    if not name or frappe.db.exists("Workflow Action Master", name):
        return False

    frappe.get_doc(
        {
            "doctype": "Workflow Action Master",
            "workflow_action_name": name,
        }
    ).insert(ignore_permissions=True)
    return True


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

    # Referenced states and actions must exist BEFORE the workflow is inserted.
    # Link validation runs inside that insert, so creating them "at the same
    # time" is already too late -- hence this separate pass. Done first because
    # everything below depends on it, and because a throw here would abort
    # `after_migrate` with the LinkValidationError above.
    created = []
    for state in config["states"]:
        if ensure_workflow_state(state["state"]):
            created.append(f"state: {state['state']}")

    for transition in config["transitions"]:
        for key in ("state", "next_state"):
            if ensure_workflow_state(transition[key]):
                created.append(f"state: {transition[key]}")
        if ensure_workflow_action(transition["action"]):
            created.append(f"action: {transition['action']}")

    if created:
        frappe.logger().info(
            f"Created missing workflow states/actions for {doctype}: "
            f"{', '.join(created)}"
        )

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