import os
import re

import frappe
from frappe import _
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
# Transactional document attachments
# ------------------------------------------------------------------
# The same shape as the Employee config above, extended to the documents the
# Store and Quality flows work with. ONE dict serves both clients: the React
# panel and the ERPNext desk script both ask get_attachment_config() what is
# allowed, so neither can hardcode a list the server would then reject.
#
# This dict is also the AUTHORISATION allow-list. upload_document() takes a
# doctype from the caller, which means without this it would be a generic
# "attach a file to any document I can write to" primitive. A doctype absent
# from here is refused outright.
#
# Keys are permanent in practice: they are written into every stored file name
# as a `[KEY]` marker, so renaming one later orphans the files already uploaded
# under the old name. The first upload is the cheapest moment to get it right.
DOCUMENT_ATTACHMENT_CONFIG = {
    "Purchase Receipt": {
        "RECEIPT_PHOTO": {"label": "Goods photo", "extensions": ["jpg", "jpeg", "png", "webp", "pdf"], "max_size_mb": 8, "sort_order": 10},
        "WEIGHBRIDGE_TICKET": {"label": "Weighbridge ticket", "extensions": ["jpg", "jpeg", "png", "webp", "pdf"], "max_size_mb": 8, "sort_order": 20},
        "INVOICE": {"label": "Supplier invoice", "extensions": ["pdf", "jpg", "jpeg", "png"], "max_size_mb": 10, "sort_order": 30},
        "MTC": {"label": "Mill test certificate", "extensions": ["pdf", "jpg", "jpeg", "png"], "max_size_mb": 10, "sort_order": 40},
        "QUALITY_REPORT": {"label": "Quality report", "extensions": ["pdf", "jpg", "jpeg", "png"], "max_size_mb": 10, "sort_order": 50},
    },
    "Quality Inspection": {
        "DEFECT_PHOTO": {"label": "Defect photo", "extensions": ["jpg", "jpeg", "png", "webp"], "max_size_mb": 8, "sort_order": 10},
        "MEASUREMENT_REPORT": {"label": "Measurement report", "extensions": ["pdf", "jpg", "jpeg", "png"], "max_size_mb": 10, "sort_order": 20},
        "CERTIFICATE": {"label": "Certificate", "extensions": ["pdf", "jpg", "jpeg", "png"], "max_size_mb": 10, "sort_order": 30},
    },
    "Stock Entry": {
        "STOCK_PHOTO": {"label": "Stock photo", "extensions": ["jpg", "jpeg", "png", "webp"], "max_size_mb": 8, "sort_order": 10},
        "GATE_PASS": {"label": "Gate pass", "extensions": ["jpg", "jpeg", "png", "pdf"], "max_size_mb": 8, "sort_order": 20},
    },
    "Plate Offcut": {
        "BEFORE_CUT": {"label": "Before cut", "extensions": ["jpg", "jpeg", "png", "webp"], "max_size_mb": 8, "sort_order": 10},
        "AFTER_CUT": {"label": "After cut", "extensions": ["jpg", "jpeg", "png", "webp"], "max_size_mb": 8, "sort_order": 20},
        "CUT_DETAIL": {"label": "Cut detail", "extensions": ["jpg", "jpeg", "png", "webp"], "max_size_mb": 8, "sort_order": 30},
    },
    # HR self-service: attachments are doc-level (the File model links to the
    # document, not to a child-table row), so Expense Claim gets ONE panel per
    # claim rather than a bill per expense row. Both surfaces gate the header
    # Attach action on a SAVED draft -- an ESS user's write on their own
    # document ends at submit, so offering it on a submitted one would be a
    # button that can only fail at `_require_write`.
    "Leave Application": {
        "LEAVE_PROOF": {"label": "Leave proof", "extensions": ["pdf", "jpg", "jpeg", "png"], "max_size_mb": 5, "sort_order": 10},
    },
    "Expense Claim": {
        "EXPENSE_BILL": {"label": "Expense bill or receipt", "extensions": ["pdf", "jpg", "jpeg", "png"], "max_size_mb": 5, "sort_order": 10},
    },
}

# A newly enabled doctype gets a safe general-purpose upload type. Existing
# doctypes keep their narrower, named type lists above.
DEFAULT_DOCUMENT_ATTACHMENT_TYPES = {
	"SUPPORTING_DOCUMENT": {
		"label": "Supporting document",
		"extensions": ["pdf", "jpg", "jpeg", "png", "webp"],
		"max_size_mb": 10,
		"sort_order": 10,
	}
}

def _attachment_policy(doctype):
	"""Read the admin-managed policy row, failing closed when it is absent."""
	if not frappe.db.exists("DocType", "UI Attachment Rule"):
		return {"enabled": False, "required_on": []}
	rule = frappe.db.get_value(
		"UI Attachment Rule",
		{"parent": "UI Attachment Settings", "parenttype": "UI Attachment Settings", "target_doctype": doctype},
		["enabled", "require_on_save", "require_on_submit"],
		as_dict=True,
	)
	if not rule:
		return {"enabled": False, "required_on": []}
	return {
		"enabled": bool(rule.enabled),
		"required_on": [
			event
			for event, required in (("save", rule.require_on_save), ("submit", rule.require_on_submit))
			if required
		],
	}


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

# ------------------------------------------------------------------
# Transactional attachments -- shared by the React panel and the desk script
# ------------------------------------------------------------------


def _attachment_types(doctype):
    """Configured types for a doctype, or None when the doctype is not allowed.

    Absent from DOCUMENT_ATTACHMENT_CONFIG means refused, which is the whole
    reason this dict is the authorisation allow-list and not just a UI hint.
    """
    policy = _attachment_policy(doctype)
    if not policy.get("enabled"):
        return None
    return DOCUMENT_ATTACHMENT_CONFIG.get(doctype, DEFAULT_DOCUMENT_ATTACHMENT_TYPES)


def _require_write(doctype, docname):
    """Fail closed unless the session may write this exact document.

    The parent permission is the whole security boundary: a File carries
    `is_private`, but read access to a private file is granted on the attached
    document, so gating the upload on that document is what stops this endpoint
    becoming a way to park a file against any record in the system.
    """
    try:
        allowed = frappe.has_permission(doctype, "write", docname)
    except Exception:
        allowed = False
    if not allowed:
        frappe.throw(
            _("You are not allowed to attach documents to {0} {1}.").format(doctype, docname),
            frappe.PermissionError,
        )


@frappe.whitelist(allow_guest=False)
def get_attachment_config(doctype):
    """What may be attached to a doctype, for BOTH clients to render from.

    Returned rather than duplicated in JavaScript: the React panel and the desk
    script each build their own UI, and a hardcoded extension list in either one
    would drift from what the server actually accepts.

    Args:
        doctype (str): e.g. "Purchase Receipt".

    Returns:
        dict: {"doctype", "enabled", "required_on", "types": [...]}
    """
    policy = _attachment_policy(doctype)
    types = _attachment_types(doctype) or {}

    return {
        "doctype": doctype,
        "enabled": bool(policy.get("enabled")) and bool(types),
        "required_on": policy.get("required_on", []) if policy.get("enabled") and types else [],
        "types": [
            {
                "type_key": key,
                "label": conf["label"],
                "extensions": conf["extensions"],
                "max_size_mb": conf["max_size_mb"],
            }
            for key, conf in sorted(types.items(), key=lambda kv: kv[1].get("sort_order", 100))
        ],
    }


def _next_sequence(doctype, docname, type_key):
    """The next 1-based sequence for one type on one document.

    Phone photos are all named like IMG_0001.jpg, so the caller's own name is
    not a key. A prefix counter keeps two uploads of identically named files
    distinct AND makes the files sort in the order they were taken.

    Counted with LIKE rather than by parsing the names: the count is of files we
    could have written, and a file renamed outside the UI would otherwise reuse
    a sequence that already exists.
    """
    prefix = f"[{type_key}]"
    return (
        frappe.db.count(
            "File",
            filters={
                "attached_to_doctype": doctype,
                "attached_to_name": docname,
                "file_name": ["like", f"{prefix}%"],
            },
        )
        + 1
    )


def _safe_stem(file_name, original_name, extension):
    """The stem a stored file will carry, from the operator or the upload.

    `file_name` is operator input and reaches the filesystem via File.save, so
    it is treated as a bare name and nothing else: basenamed again (a path
    cannot survive), stripped of control characters and separators, whitespace
    collapsed, capped at 80 chars. The EXTENSION is never taken from the
    operator -- it comes from the validated upload -- and neither is the
    `[TYPE_KEY]` prefix or the sequence, both of which are load-bearing for
    the list and delete endpoints.

    Falls back to the upload's own stem when nothing usable is left, which is
    the pre-custom-name behaviour exactly.
    """
    stem = os.path.basename((file_name or "").strip())
    if extension and stem.lower().endswith(f".{extension.lower()}"):
        stem = stem[: -len(extension) - 1]
    stem = re.sub(r'[\x00-\x1f\x7f\\/]', "", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" .")
    stem = stem[:80]
    if not stem:
        stem = os.path.splitext(os.path.basename(original_name))[0][:80]
    return stem


@frappe.whitelist(allow_guest=False)
def upload_document(doctype, docname, type_key, file_name=None, remark=None):
    """Attach an uploaded file to a transaction, as a private `File`.

    The document must already be SAVED: a `File` is attached by name, and there
    is no name to attach to before the save. Callers surface that rather than
    saving on the operator's behalf.

    Naming is `[{TYPE_KEY}]{sequence}-{stem}.{ext}` -- the existing marker, plus a
    per-document sequence so two phone photos called IMG_0001.jpg cannot
    collide, and so the list reads in capture order. `file_name` optionally
    replaces the STEM only: the operator naming a weighbridge ticket
    "Delhi gate 12 Nov" keeps the sequence (collision-proof ordering) and the
    server-known extension, and the `[TYPE_KEY]` prefix is NEVER user-settable
    because list_document_attachments and delete_document_attachment parse it
    to decide which feature a stored file belongs to.

    `remark` is stored on `File.ui_remark`, a Custom Field created by
    patches/v1_0/add_file_ui_remark_field.py -- core File has NO free-text
    column (the first version SELECTed File.description and every list call
    died with OperationalError 1054). Guarded on the column's physical
    presence: a deployed-but-not-migrated site attaches minus the remark
    rather than 500ing.

    `is_private = 1` is deliberate, not cosmetic: File.has_permission returns
    True for any NON-private file to any authenticated user, so a public
    attachment here would hand a receipt photo or a defect shot to the whole
    company.

    Returns:
        dict: the created `File` descriptor.
    """

    types = _attachment_types(doctype)
    if types is None:
        frappe.throw(_("{0} does not support document attachments.").format(doctype))

    config = types.get(type_key)
    if not config:
        frappe.throw(_("Unknown document type: {0}").format(type_key))

    if not docname or docname in ("new-form", "new"):
        frappe.throw(_("Save the document before attaching files to it."))

    if not frappe.db.exists(doctype, docname):
        frappe.throw(_("{0} {1} does not exist.").format(doctype, docname))

    _require_write(doctype, docname)

    uploaded = frappe.request.files.get("file")
    if not uploaded:
        frappe.throw(_("No file was uploaded."))

    # frappe.request.files returns a list even for a single file.
    file = uploaded[0] if isinstance(uploaded, list) else uploaded

    original_name = os.path.basename(file.filename or "")
    extension = _extension_of(original_name)

    if extension not in config["extensions"]:
        frappe.throw(
            _("{0} must be one of: {1}").format(config["label"], ", ".join(config["extensions"]))
        )

    content = file.read()
    if not content:
        frappe.throw(_("The uploaded file is empty."))

    max_bytes = config["max_size_mb"] * 1024 * 1024
    if len(content) > max_bytes:
        frappe.throw(
            _("{0} must be {1} MB or smaller.").format(config["label"], config["max_size_mb"])
        )

    stem = _safe_stem(file_name, original_name, extension)
    sequence = _next_sequence(doctype, docname, type_key)

    remark_value = (remark or "").strip()[:140] or None

    # ignore_permissions is deliberately NOT set: Frappe then enforces write on
    # the attached document as well, so this endpoint cannot attach to somebody
    # else's record.
    file_values = {
        "doctype": "File",
        "file_name": f"[{type_key}]{sequence}-{stem}.{extension}",
        "attached_to_doctype": doctype,
        "attached_to_name": docname,
        "attached_to_field": "attachments",
        "file_url": "",
        "is_private": 1,
        "content": content,
        "file_size": len(content),
    }
    # ui_remark is a Custom Field (patches/v1_0/add_file_ui_remark_field.py);
    # writing it before the patch has run would throw on every upload, so the
    # remark is dropped (with the file kept) until `bench migrate` has created
    # the column.
    if remark_value and frappe.db.has_column("File", "ui_remark"):
        file_values["ui_remark"] = remark_value
    file_doc = frappe.get_doc(file_values)
    file_doc.save(ignore_permissions=False)

    return {
        "name": file_doc.name,
        "file_name": file_doc.file_name,
        "file_url": file_doc.file_url,
        "is_image": _is_image(file_doc.file_name),
        "file_size": file_doc.file_size,
        "type_key": type_key,
        # `.get`, not attribute access: the field is absent until the patch
        # has run, and a missing remark must not fail the response.
        "remark": file_doc.get("ui_remark"),
    }


@frappe.whitelist(allow_guest=False)
def list_document_attachments(doctype, docname):
    """Every stored attachment on one document, newest first.

    Read through the parent document's READ permission rather than the File's,
    so a user who cannot open the Purchase Receipt cannot enumerate its
    attachments either -- the same document that gates reading is what grants it.

    Returns:
        dict: {"files": [...]}
    """

    types = _attachment_types(doctype)
    if types is None:
        frappe.throw(_("{0} does not support document attachments.").format(doctype))

    if not docname:
        return {"files": []}

    if not frappe.has_permission(doctype, "read", docname):
        frappe.throw(
            _("You are not allowed to view documents attached to {0} {1}.").format(doctype, docname),
            frappe.PermissionError,
        )

    # The remark column is a Custom Field that only exists after
    # patches/v1_0/add_file_ui_remark_field.py has run; SELECTing it before
    # then is the OperationalError 1054 this guard exists to prevent.
    has_remark = frappe.db.has_column("File", "ui_remark")
    fields = ["name", "file_name", "file_url", "file_size", "creation"]
    if has_remark:
        fields.insert(-1, "ui_remark")

    rows = frappe.get_all(
        "File",
        filters={"attached_to_doctype": doctype, "attached_to_name": docname},
        fields=fields,
        order_by="creation desc",
        limit_page_length=200,
    )

    files = []
    for row in rows:
        match = DOCUMENT_KEY_PATTERN.match(row.file_name or "")
        type_key = match.group(1) if match else None
        # Only surface types this doctype actually configures: a file carrying
        # some other `[KEY]` belongs to a different feature and has no label
        # here, so it is not shown rather than shown wrongly.
        if type_key is None or type_key not in types:
            continue
        files.append(
            {
                "name": row.name,
                "file_name": row.file_name,
                "file_url": row.file_url,
                "file_size": row.file_size,
                "is_image": _is_image(row.file_name),
                "type_key": type_key,
                "label": types[type_key]["label"],
                # The operator's remark, written by upload_document; None
                # until the Custom Field patch has run.
                "remark": row.get("ui_remark") if has_remark else None,
                "creation": row.creation,
            }
        )

    return {"files": files}


@frappe.whitelist(allow_guest=False)
def delete_document_attachment(file_name):
    """Remove one attachment from a transaction.

    The File must carry one of OUR `[KEY]` markers AND belong to a doctype in
    DOCUMENT_ATTACHMENT_CONFIG. Without both checks this would be a generic
    "delete any File I can write to" primitive, aimed at attachments the panel
    never showed.

    WRITE on the PARENT is required, not merely delete on the File: otherwise
    deleting evidence would be easier than attaching it, and a user who can
    write the document would lose files another department put there.

    Returns:
        dict: {"deleted": str}
    """

    if not file_name:
        frappe.throw(_("No file specified."))

    row = frappe.db.get_value(
        "File",
        file_name,
        ["name", "attached_to_doctype", "attached_to_name", "file_name"],
        as_dict=True,
    )
    if not row:
        frappe.throw(_("Document not found."))

    types = _attachment_types(row.attached_to_doctype)
    match = DOCUMENT_KEY_PATTERN.match(row.file_name or "")
    if types is None or not match or match.group(1) not in types:
        frappe.throw(_("That file is not a document attachment."))

    _require_write(row.attached_to_doctype, row.attached_to_name)

    frappe.delete_doc("File", file_name, ignore_permissions=False)

    return {"deleted": file_name}
