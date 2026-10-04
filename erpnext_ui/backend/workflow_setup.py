"""
Create a Workflow together with the Workflow States it references.

Why this exists
---------------
`Workflow.states` and `Workflow.transitions` are child tables whose state
fields are Links to the `Workflow State` doctype. `Document._validate_links()`
runs during the Workflow's own save, so a transition pointing at a state that
does not exist yet fails the whole save:

    frappe.exceptions.LinkValidationError: Could not find Row #2:
    State: Pending Leave Approver, ...

Frappe pre-creates only `Pending`, `Approved` and `Rejected` as Workflow
States (frappe/utils/install.py), so any custom state has to be created
explicitly. Frappe only installs a Workflow State whose name matches exactly,
because the doctype uses `autoname: field:workflow_state_name` -- the document
name IS that field.

Usage (System Console, or `bench --site <site> execute`):

    from erpnext_ui.workflow_setup import save_workflow
    save_workflow({
        "document_type": "Leave Application",
        "workflow_name": "Leave Application Approval",
        "workflow_state_field": "workflow_state",
        "states": [
            {"state": "Pending Leave Approver", "doc_status": "0", "allow_edit": "Employee"},
            {"state": "Pending HR Approval", "doc_status": "0", "allow_edit": "Leave Approver"},
            {"state": "Approved", "doc_status": "1", "allow_edit": "Leave Approver"},
            {"state": "Rejected", "doc_status": "1", "allow_edit": "Leave Approver"},
            {"state": "Cancelled", "doc_status": "2", "allow_edit": "Leave Approver"},
        ],
        "transitions": [
            {"state": "Pending Leave Approver", "action": "Submit", "next_state": "Pending Leave Approver", "allowed": True},
            {"state": "Pending Leave Approver", "action": "Approve", "next_state": "Pending HR Approval", "allowed": True},
            {"state": "Pending HR Approval", "action": "Approve", "next_state": "Approved", "allowed": True},
            {"state": "Pending HR Approval", "action": "Reject", "next_state": "Rejected", "allowed": True},
            {"state": "Pending HR Approval", "action": "Cancel", "next_state": "Cancelled", "allowed": True},
        ],
    })

Idempotent: re-running reuses the existing Workflow for the doctype and the
existing states/actions instead of failing on duplicates.
"""

import frappe

# Style is cosmetic (drives the badge colour in Frappe's own UI); keep new
# states visually neutral so a typo'd state is easy to spot.
DEFAULT_STATE_STYLE = "Info"


def ensure_workflow_state(name, style=DEFAULT_STATE_STYLE):
    """Create the `Workflow State` `name` unless it already exists."""
    if not name:
        return False
    if frappe.db.exists("Workflow State", name):
        return False

    frappe.get_doc(
        {
            "doctype": "Workflow State",
            # autoname is `field:workflow_state_name`, so this becomes the name.
            "workflow_state_name": name,
            "style": style,
        }
    ).insert(ignore_permissions=True)
    return True


def ensure_workflow_action(name):
    """Create the `Workflow Action Master` `name` unless it already exists."""
    if not name:
        return False
    if frappe.db.exists("Workflow Action Master", name):
        return False

    frappe.get_doc(
        {
            "doctype": "Workflow Action Master",
            "workflow_action_name": name,
        }
    ).insert(ignore_permissions=True)
    return True


def referenced_states(payload):
    """Every state name the payload's states/transitions rows depend on."""
    names = []
    for row in payload.get("states") or []:
        names.append(row.get("state"))
    for row in payload.get("transitions") or []:
        names.append(row.get("state"))
        names.append(row.get("next_state"))
    return [n for n in names if n]


def save_workflow(payload, is_active=1):
    """Ensure the referenced states/actions exist, then create or update the Workflow.

    Returns the Workflow document name.
    """
    doctype = payload["document_type"]

    # Order is the whole point: these must be committed/inserted before the
    # Workflow save below, because that save is what validates the links.
    created_states = [n for n in referenced_states(payload) if ensure_workflow_state(n)]
    created_actions = [
        row["action"]
        for row in payload.get("transitions") or []
        if ensure_workflow_action(row.get("action"))
    ]

    existing = frappe.db.exists("Workflow", {"document_type": doctype})
    if existing:
        workflow = frappe.get_doc("Workflow", existing)
    else:
        workflow = frappe.get_doc({"doctype": "Workflow", "document_type": doctype})
        workflow.insert(ignore_permissions=True)

    workflow.update(
        {
            "workflow_name": payload.get("workflow_name") or doctype,
            "is_active": is_active,
            "document_type": doctype,
            "override_status": payload.get("override_status", 0),
            "workflow_state_field": payload.get("workflow_state_field") or "workflow_state",
            "states": payload.get("states") or [],
            "transitions": payload.get("transitions") or [],
        }
    )
    workflow.save(ignore_permissions=True)

    frappe.db.commit()

    print(f"{doctype}: workflow {workflow.name}")
    if created_states:
        print(f"  created Workflow State(s): {', '.join(created_states)}")
    if created_actions:
        print(f"  created Workflow Action(s): {', '.join(created_actions)}")
    if not created_states and not created_actions:
        print("  all referenced states/actions already existed")

    return workflow.name