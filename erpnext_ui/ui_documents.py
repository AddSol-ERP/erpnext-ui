import os
import re

import frappe
from frappe.model import workflow as workflow_model


# The state an Employee moves into when they upload a document, so HR has
# something to review. Must match a state on the active Employee Workflow --
# setup_workflows() seeds "Employee HR Approval", whose entry state is this one.
#
# It is written with frappe.db.set_value rather than a document save on purpose.
# frappe.model.workflow.validate_workflow() throws WorkflowPermissionError for
# any workflow_state change that is not the current state or a reachable
# transition, and there is deliberately no Approved -> Pending transition: giving
# the Employee role one would let any employee transition any Employee record.
# This is therefore a state signal, not an audited workflow transition -- it
# records no actor and bypasses validate_workflow by design.
PENDING_APPROVAL_STATE = "Pending HR Approval"


# ------------------------------------------------------------------
# Document type configuration
# ------------------------------------------------------------------
# Hardcoded for now, on purpose. This dict is the single source of truth and the
# frontend fetches it from get_employee_document_types() rather than keeping a
# duplicate copy in JavaScript, so promoting this to a real DocType later is a
# one-file change.
#
# The shape deliberately mirrors the columns of the intended `UI Document Type`
# DocType (target_doctype, type_key, label, allowed_extensions, max_size_mb,
# is_sensitive, sort_order), so it can be seeded verbatim when that DocType
# lands instead of being reshaped.
DOCUMENT_UPLOAD_CONFIG = {
    "Employee": {
        "AADHAAR_CARD": {
            "label": "Aadhaar Card",
            "extensions": ["pdf", "jpg", "jpeg", "png"],
            "max_size_mb": 5,
            "sort_order": 10,
        },
        "PAN_CARD": {
            "label": "PAN Card",
            "extensions": ["pdf", "jpg", "jpeg", "png"],
            "max_size_mb": 5,
            "sort_order": 20,
        },
        "RESUME": {
            "label": "Resume",
            "extensions": ["pdf", "doc", "docx", "jpg", "jpeg", "png"],
            "max_size_mb": 5,
            "sort_order": 30,
        },
        "EDUCATION_CERTIFICATE": {
            "label": "Education Certificate",
            "extensions": ["pdf", "doc", "docx", "jpg", "jpeg", "png"],
            "max_size_mb": 5,
            "sort_order": 40,
        },
        "EXPERIENCE_LETTER": {
            "label": "Experience Letter",
            "extensions": ["pdf", "doc", "docx", "jpg", "jpeg", "png"],
            "max_size_mb": 5,
            "sort_order": 50,
        },
        "ADDRESS_PROOF": {
            "label": "Address Proof",
            "extensions": ["pdf", "jpg", "jpeg", "png"],
            "max_size_mb": 5,
            "sort_order": 60,
        },
        "BANK_PROOF": {
            "label": "Bank Proof",
            "extensions": ["pdf", "jpg", "jpeg", "png"],
            "max_size_mb": 5,
            "sort_order": 70,
        },
        "OTHER": {
            "label": "Other Document",
            "extensions": ["pdf", "doc", "docx", "jpg", "jpeg", "png"],
            "max_size_mb": 5,
            "sort_order": 80,
        },
    },
}

IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}

# Matches the leading `[AADHAAR_CARD]` marker we write onto stored file names.
# Anchored at the start on purpose: a user's original file name may itself
# contain brackets (`tax[2024].pdf`), and only the first group is ours.
DOCUMENT_KEY_PATTERN = re.compile(r"^\[([A-Z0-9_]+)\]")


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------
def _employee_config():
    return DOCUMENT_UPLOAD_CONFIG.get("Employee", {})


def _current_employee():
    """Resolve the Employee record belonging to the logged-in user.

    There is intentionally no `employee` argument on any endpoint in this
    module. The obvious alternative -- accept an employee name and check that it
    exists -- only proves the record exists, not that the caller may read it, and
    an employee code is trivially guessable (HR-EMP-00001, HR-EMP-00002, ...).
    Deriving it from the session makes cross-employee access impossible by
    construction instead of defended against.
    """
    user = frappe.session.user

    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")

    if not employee:
        frappe.throw(
            "No Employee record is linked to your user. "
            "Contact your HR administrator.",
            frappe.PermissionError,
        )

    if not frappe.has_permission("Employee", "read", employee):
        frappe.throw(
            "You do not have permission to read your Employee record.",
            frappe.PermissionError,
        )

    return employee


def _document_label(type_key):
    """Label for a type key, falling back to a readable version of the key.

    A key present on disk but absent from the config (for example a type an
    admin removed from the DocType after files were uploaded) still shows up,
    with the underscores turned into spaces, rather than silently disappearing
    from the employee's list.
    """
    config = _employee_config()
    if type_key in config:
        return config[type_key]["label"]

    return type_key.replace("_", " ").title()


def _split_document_file_name(file_name):
    """Split a stored file name into (type_key, display_name).

    display_name is the name shown to the user, with our `[KEY]` marker
    stripped, so the panel never leaks storage conventions into the UI.

    Frappe's `generate_file_name` appends a 6-char hash to the *stem* on
    collision (`[RESUME]cv.pdf` -> `[RESUME]cv-a1b2c3.pdf`), which leaves the
    prefix intact, so re-uploading the same file name keeps parsing correctly.
    """
    if not file_name:
        return None, file_name

    match = DOCUMENT_KEY_PATTERN.match(file_name)
    if not match:
        return None, file_name

    type_key = match.group(1)
    display_name = file_name[match.end():].strip()

    # `[KEY]` on its own carries no filename; treat it as unrecognised rather
    # than rendering an empty row.
    if not display_name:
        return None, file_name

    return type_key, display_name


def _extension_of(file_name):
    return os.path.splitext(file_name or "")[1].lstrip(".").lower()


def _is_image(file_name):
    return _extension_of(file_name) in IMAGE_EXTENSIONS


def _set_pending_hr_approval(employee):
    """Move an Employee into the pending-approval state after a document change.

    Resolves the state defensively instead of trusting the constant: a site
    without an active Employee Workflow, or one whose workflow does not declare
    this state, is left untouched rather than written with a dangling Link value.

    Args:
        employee (str): Employee record name.

    Returns:
        bool: True if the state was written.
    """
    workflow_name = workflow_model.get_workflow_name("Employee")
    if not workflow_name:
        return False

    states = [
        row.state
        for row in frappe.get_cached_doc("Workflow", workflow_name).states
    ]

    if PENDING_APPROVAL_STATE not in states:
        return False

    # update_modified so the ESS profile's "Last updated" reflects the change.
    frappe.db.set_value(
        "Employee",
        employee,
        "workflow_state",
        PENDING_APPROVAL_STATE,
        update_modified=True,
    )

    return True


def _describe(file_doc):
    """Project a File row into the shape the UI consumes."""
    type_key, display_name = _split_document_file_name(file_doc.file_name)

    return {
        "name": file_doc.name,
        "type_key": type_key,
        "label": _document_label(type_key) if type_key else None,
        "file_name": file_doc.file_name,
        "display_name": display_name,
        "file_url": file_doc.file_url,
        "file_size": file_doc.file_size,
        "is_private": bool(file_doc.is_private),
        "is_image": _is_image(file_doc.file_name),
        "creation": file_doc.creation,
    }


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------
@frappe.whitelist(allow_guest=False)
def get_employee_document_types():
    """Configured document types for the Employee documents panel.

    Returns:
        list[dict]: one entry per configured type, in display order.
    """
    types = []

    for type_key, config in sorted(
        _employee_config().items(), key=lambda item: item[1]["sort_order"]
    ):
        types.append({
            "type_key": type_key,
            "label": config["label"],
            "extensions": config["extensions"],
            "max_size_mb": config["max_size_mb"],
        })

    return types


@frappe.whitelist(allow_guest=False)
def list_employee_documents():
    """List the logged-in employee's uploaded documents.

    Clear the File cache first so that the just‑uploaded file appears immediately.
    """
    frappe.clear_cache(doctype="Employee")
    employee = _current_employee()

    files = frappe.get_list(
        "File",
        filters={
            "attached_to_doctype": "Employee",
            "attached_to_name": employee,
        },
        fields=["name", "file_name", "file_url", "file_size", "is_private", "creation"],
        order_by="creation desc",
        limit_page_length=100,
    )

    return [_describe(row) for row in files]


@frappe.whitelist(allow_guest=False)
def upload_employee_document(type_key):
    """Attach an uploaded document to the logged-in employee's record.

    The uploaded file is read from the multipart request via ``frappe.request.files``.
    No positional ``file`` argument is needed from the caller.

    Returns:
        dict: the created document descriptor.
    """
    employee = _current_employee()

    if not frappe.has_permission("Employee", "write", employee):
        frappe.throw(
            "You do not have permission to update your Employee record.",
            frappe.PermissionError,
        )

    config = _employee_config().get(type_key)
    if not config:
        frappe.throw("Unknown document type: {0}".format(type_key))

    # --- read the uploaded file from the multipart form ---
    uploaded = frappe.request.files.get('file')
    if not uploaded:
        frappe.throw("No file was uploaded.")

    # frappe.request.files returns a list (even for a single file)
    file = uploaded[0] if isinstance(uploaded, list) else uploaded
    # file is a Werkzeug FileStorage object; use .filename and .read()

    original_name = os.path.basename(file.filename or "")
    extension = _extension_of(original_name)

    # validate extension
    allowed = config["extensions"]
    if extension not in allowed:
        frappe.throw(
            "{0} must be one of: {1}".format(
                config["label"], ", ".join(allowed)
            )
        )

    # read content (bytes)
    content = file.read()
    if not content:
        frappe.throw(" uploaded file is empty.")

    max_bytes = config["max_size_mb"] * 1024 * 1024
    if len(content) > max_bytes:
        frappe.throw(
            "{0} must be {1} MB or smaller.".format(
                config["label"], config["max_size_mb"]
            )
        )

    # `is_private = 1` is not cosmetic. File.has_permission returns True for
    # any non-private file to any authenticated user, and these are identity
    # documents (Aadhaar, PAN, bank proof) that must not be readable by peers.
    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": "[{0}]{1}".format(type_key, original_name),
        "attached_to_doctype": "Employee",
        "attached_to_name": employee,
        "attached_to_field": "attachments",
        "file_url": "",
        "is_private": 1,
        "content": content,
        "file_size": len(content),
    })

    # ignore_permissions is deliberately NOT set: Frappe then enforces write
    # permission on the attached Employee, so this endpoint cannot be used to
    # attach files to somebody else's record.
    file_doc.save(ignore_permissions=False)

    # Only now that the document is stored, re-open HR review. Wrapped because
    # this is a side effect of a completed upload: letting it propagate would
    # roll back a document the user already successfully uploaded, which is a
    # worse outcome than the document landing without a pending-review signal.
    try:
        if _set_pending_hr_approval(employee):
            frappe.logger().info(
                "Document upload moved {0} to '{1}'.".format(
                    employee, PENDING_APPROVAL_STATE
                )
            )
        else:
            frappe.logger().warning(
                "Document upload for {0} did not set '{1}': no active Employee "
                "Workflow declares that state.".format(
                    employee, PENDING_APPROVAL_STATE
                )
            )
    except Exception:
        frappe.log_error(frappe.get_traceback())

    return _describe(file_doc)

    allowed = config["extensions"]
    if extension not in allowed:
        frappe.throw(
            "{0} must be one of: {1}".format(
                config["label"], ", ".join(allowed)
            )
        )

    # Frappe's global max_file_size still applies because we never raise it,
    # so reading the body into memory here is bounded.
    content = file.stream.read()

    max_bytes = config["max_size_mb"] * 1024 * 1024
    if len(content) > max_bytes:
        frappe.throw(
            "{0} must be {1} MB or smaller.".format(
                config["label"], config["max_size_mb"]
            )
        )

    # `is_private = 1` is not cosmetic. File.has_permission returns True for
    # any non-private file to any authenticated user, and these are identity
    # documents (Aadhaar, PAN, bank proof) that must not be readable by peers.
    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": "[{0}]{1}".format(type_key, original_name),
        "attached_to_doctype": "Employee",
        "attached_to_name": employee,
        "attached_to_field": "attachments",
        "file_url": "",
        "is_private": 1,
        "content": content,
        "file_size": len(content),
    })

    # ignore_permissions is deliberately NOT set: Frappe then enforces write
    # permission on the attached Employee, so this endpoint cannot be used to
    # attach files to somebody else's record.
    file_doc.save(ignore_permissions=False)

    # Only now that the document is stored, re-open HR review. Wrapped because
    # this is a side effect of a completed upload: letting it propagate would
    # roll back a document the user already successfully uploaded, which is a
    # worse outcome than the document landing without a pending-review signal.
    try:
        if _set_pending_hr_approval(employee):
            frappe.logger().info(
                "Document upload moved {0} to '{1}'.".format(
                    employee, PENDING_APPROVAL_STATE
                )
            )
        else:
            frappe.logger().warning(
                "Document upload for {0} did not set '{1}': no active Employee "
                "Workflow declares that state.".format(
                    employee, PENDING_APPROVAL_STATE
                )
            )
    except Exception:
        frappe.log_error(frappe.get_traceback())

    return _describe(file_doc)


@frappe.whitelist(allow_guest=False)
def delete_employee_document(file_name):
    """Remove one of the logged-in employee's documents.

    The File must belong to the caller's own Employee AND carry one of our
    `[KEY]` markers. Without the second check this endpoint would be a generic
    "delete any File I have write access to" primitive, which could be aimed at
    an attachment such as an employee photo that the documents UI never showed.

    Args:
        file_name (str): the stored `File` record name.

    Returns:
        dict: {"deleted": str}
    """
    employee = _current_employee()

    if not file_name:
        frappe.throw("No file specified.")

    row = frappe.db.get_value(
        "File",
        file_name,
        ["name", "attached_to_doctype", "attached_to_name", "file_name"],
        as_dict=True,
    )

    if not row:
        frappe.throw("Document not found.")

    if row.attached_to_doctype != "Employee" or row.attached_to_name != employee:
        frappe.throw(
            "You can only delete your own documents.",
            frappe.PermissionError,
        )

    type_key, _ = _split_document_file_name(row.file_name)
    if not type_key or type_key not in _employee_config():
        frappe.throw(
            "This file is not a document uploaded through this panel.",
            frappe.PermissionError,
        )

    # No ignore_permissions, so Frappe re-checks File write permission.
    frappe.delete_doc("File", file_name, ignore_permissions=False)

    return {"deleted": file_name}