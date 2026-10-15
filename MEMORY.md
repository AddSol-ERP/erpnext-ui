# MEMORY.md — How `erpnext_ui` Actually Works

Durable reference for this codebase. Written 2026-10-13.
Every non-obvious claim carries a `file:line` citation — verify before trusting.

> **This file supersedes** `erpnext_ui/frontend/SUMMARY.md` and
> `erpnext_ui/frontend/CRUD_FUNCTIONALITY.md`, both of which are badly stale
> (they claim "i18n: None" and "no Tailwind"; the app has 3 locales and Tailwind 4;
> they also list three components that do not exist).

**For how to build, test and safely change this repo → read `AGENTS.md`.**

---

## 1. What this app is

A Frappe v15 app (`erpnext_ui`, "Addsol Erpnext UI") containing a **React 19 SPA
that replaces ERPNext desk for operational users**. There are no custom DocTypes —
the app is a *shell over stock ERPNext/HRMS doctypes*, plus one seeded Workflow
set and one print format.

The mechanism is `boot_session` (`erpnext_ui/api.py:103-122`): every non-Administrator
user gets `home_page = "/addsol_ui"`, so they land in the SPA after login. Escape
hatch: the navbar button injected by `public/js/addsol_ui_nav.js`, and a
"Back to ERPNext" action in the user menu.

`required_apps = []` (`hooks.py:11`) — but the SPA **hard-depends on `hrms`** and
on **`shopfloor`** at runtime (see §9.5). That is a real, undeclared dependency.

### 1.1 Two mount paths, one bundle

| Path | Controller | Mount node | Mechanism |
|---|---|---|---|
| `/app/addsol-ui` (desk Page) | `addsol_erpnext_ui/page/addsol_ui/addsol_ui.js` | `#react-root` | injects `<script>`, waits for `window.mountErpUI` |
| `/addsol_ui` (standalone www) | `www/addsol_ui.py` + `.html` | `#root` | Jinja-rendered `<script type="module">` |

Both resolve the hashed bundle through **`public/erp_ui/.vite/manifest.json`**,
key `"src/main.jsx"` (`www/addsol_ui.py:15-23`, `addsol_ui.js:6-15`).

**`window.mountErpUI` is a contract.** `main.jsx:70-72` assigns it;
`addsol_ui.js:25-32` calls it in the script's `onload`. Renaming or removing
either side silently breaks desk embedding — the desk page renders an empty shell
with no console error from React.

`addsol_ui.js:62-85` additionally hides `.navbar`, `.page-head` etc. so the SPA
fills the viewport.

---

## 2. Repository layout

```
erpnext_ui/                          # the Frappe app
├── hooks.py                         # 4 live hooks (§3.1)
├── api.py                    (782)  # 6 whitelisted endpoints + 2 hook callbacks
├── ui_documents.py           (495)  # 4 ESS document endpoints
├── setup/workflows.py        (601)  # after_migrate workflow seeder (§3.4)
├── patches.txt                         # 1 patch, [post_model_sync]
├── patches/v1_0/create_salary_slip_print_format.py
├── www/addsol_ui.{py,html}            # standalone SPA page
├── addsol_erpnext_ui/page/addsol_ui/  # the ONLY DocType JSON (a Page)
├── templates/print_formats/salary_slip.html
├── public/js/addsol_ui_nav.js         # desk navbar button + home tile
├── public/erp_ui/                     # BUILT, GIT-TRACKED SPA output
├── frontend/                          # Vite/React source
└── erp_chatos/{PLAN,FUNCTIONALITY}.md # planning docs only, no code
```

No `install.py`, no `uninstall.py`, no `utils/`, **no `doctype/` directory**.
`hooks.py:81-82` references `erpnext_ui.utils.*` inside a commented-out block —
that module does not exist; don't uncomment it.

### 2.1 Frontend source tree

```
frontend/src/
├── main.jsx                  provider tree + both mount paths
├── App.jsx                   HashRouter, ~50 routes
├── services/api.jsx          the ONLY HTTP layer
├── config/{moduleAccess,doctypes,topBar}.js
├── context/{Role,Toast,Header}Context.jsx
├── lib/                      13 domain-rule modules  ← read these first
├── hooks/                    useDocStatus, useListPagination, use-mobile
├── i18n/                     en/hi/ar × 7 namespaces = 21 JSON files
├── layout/{AppShell,MainLayout}.jsx
├── components/               GenericList, GenericForm, Approval, StockEntry,
│                             ChildTable, LinkField, PrintPreview, ui/ (shadcn)
├── pages/                    Dashboard, ESS, requests, Reports, Store,
│                             Production, Quality, HR, Sales, Purchase
└── utils/                    theme, getUser, monthlyAttendance, (+2 dead)
```

### 2.2 Stack

React 19.2 · Vite 8 (`base: /assets/erpnext_ui/erp_ui/`, `outDir: ../public/erp_ui`,
`manifest: true`) · react-router-dom 7 **HashRouter** · Tailwind 4 + shadcn/ui ·
react-i18next · recharts (lazy-loaded) · sonner toasts.

`npm run build` writes **directly into `erpnext_ui/public/erp_ui/`**, and that
output **is committed to git**. A frontend change is not finished until the
rebuild is committed, or both mount paths serve stale code.

---

## 3. Backend

### 3.1 Live hooks (`hooks.py`)

| Hook | Line | Effect |
|---|---|---|
| `add_to_apps_screen` | `:14-22` | Addsol UI tile → `/addsol_ui`, logo `/assets/erpnext_ui/erp_ui/logo.png`, `has_permission: erpnext_ui.api.has_app_permission` |
| `boot_session` | `:25` | `erpnext_ui.api.boot_session` → forces `home_page` |
| `app_include_js` | `:32` | injects `addsol_ui_nav.js` on **every desk page** |
| `after_migrate` | `:248-249` | `setup.workflows.setup_workflows` |

Note `after_migrate`, **not `after_install`**: a fresh `bench install-app` seeds
no workflows; the first `bench migrate` does.

### 3.2 `api.py` — the complete endpoint surface

**5 functions decorated `@frappe.whitelist`; 3 use the bare decorator, which
defaults to `allow_guest=True`.** That is deliberate for the read-only report
endpoints but means they are reachable pre-login; `_get_scope()` collapses to
"my own record only" for a Guest session, so no data leaks.

| Endpoint | Line | Notes |
|---|---|---|
| `get_ui_access()` | `:45-73` | **The security boundary.** Returns only booleans: `{approvals:{dt:bool}, reports:{key:bool}}`. Never role names or doctype metadata. |
| `get_current_user()` | `:83-100` | `{user, roles}`, filters out `"All"`/`"Guest"` (`:98`) |
| `get_csrf_token()` | `:125-143` | The SPA is static assets and never evaluates desk's boot script, so `frappe.csrf_token` doesn't exist client-side. Without this, **every write fails** `CSRFTokenError`. |
| `leave_balance_report(...)` | `:361-492` | ⚠️ bare whitelist (guest-reachable) |
| `leave_balance_employees(...)` | `:495-533` | ⚠️ bare whitelist |
| `monthly_attendance(...)` | `:607-782` | ⚠️ bare whitelist |
| **`get_project_items(...)`** | `:829-1000` | Store: Project → BOM → items. See §3.7. |
| **`get_indent_queue(...)`** | `:1003-1180` | Store: the storekeeper's worklist. See §3.7. |
| `has_app_permission()` | `:76-80` | hook, returns `True` |
| `boot_session(bootinfo)` | `:103-122` | hook |

Note `api.py:1-2` now imports `flt`/`cint` from `frappe.utils`. **`frappe.flt` does not exist** — `frappe/__init__.py` re-exports only `get_traceback` from utils, so the explicit import is required.

`_can_read(doctype)` (`:32-42`) **fails closed**: any exception → `False`. This
matters — `SPA_APPROVAL_DOCTYPES` (`:9-15`) and `SPA_REPORT_DOCTYPES` (`:25-29`)
live **server-side deliberately** (`api.py:6-8`): the set of doctypes whose
existence gets disclosed must not be editable JavaScript.

### 3.3 `_get_scope()` — the HR visibility model (`api.py:173-267`)

```
is_hr           = roles ∩ {HR Manager, HR User, Administrator}      (:3, :182)
is_hod          = Department.hod == user, or Department.hod == my_employee,
                   or Department.head_of_department == my_employee    (:201-235)
is_manager      = any Employee where reports_to == my_employee
                   and status == Active                               (:238-247)
can_view_others = is_hr or is_hod or is_manager                      (:249)
allowed_departments = None (all) | hod_departments | [my_department] (:251-258)
```

`Department.hod` / `.head_of_department` are probed with `get_meta().has_field()`
first (`:197-199`) because they are not present in every schema.

Consumers: `leave_balance_report`, `leave_balance_employees`, `monthly_attendance`
(all three do their own employee scoping from this one dict).

### 3.4 `setup/workflows.py` — all four seeded workflows

`create_workflow_if_missing(config)` (`:398-601`) step order — each step is a
silent-skip, and the whole workflow is skipped if any precondition fails:

1. DocType exists? (`:406-411`) — else warn + skip
2. Any Workflow already on this doctype? (`:417-431`) — else **skip; never modify**
3. Ensure Roles (`:437-475`) — collects `allow_edit` + `allowed`, inserts missing
   with `ignore_permissions=True`. Rationale `:447-463`: a site lacking the
   `"Leave Approver"` role previously got **no Leave workflow at all**, silently.
4. Ensure Workflow States (`:481-505`) — from `states[]` **and** `transitions[].state/next_state`
5. Ensure Workflow Action Masters (`:507-533`) — Frappe seeds only Approve/Reject/Review,
   so `Submit`, `Cancel`, `Resubmit`, `Verified` are created on demand
6. Insert Workflow (`:539-545`), append states (`:551-575`), append transitions
   (`:581-588`), commit (`:594-600`)

Rows set `state`+`doc_status` unconditionally but `allow_edit`/`update_field`/
`update_value` **conditionally** (`:570-575`) — unconditional assignment would
crash on omitted keys.

#### Workflow A — `Employee HR Approval` on Employee (`:22-115`)

5 states / 6 transitions. Employee is **not submittable**, so every state is
`doc_status: "0"` and approval lives purely in `workflow_state`.

| State | doc_status | allow_edit |
|---|---|---|
| Pending HR Approval *(x3, `:63-65`)* | 0 | HR User / HR Manager / Employee |
| Approved (`:66`) | 0 | HR Manager |
| Rejected (`:67`) | 0 | HR Manager |

| From | Action | To | allowed |
|---|---|---|---|
| Pending HR Approval | Approve | Approved | HR Manager (`:74`) |
| Pending HR Approval | Approve | Approved | HR User (`:80`) |
| Pending HR Approval | Reject | Rejected | HR Manager (`:86`) |
| Pending HR Approval | Reject | Rejected | HR User (`:92`) |
| Rejected | Resubmit | Pending HR Approval | HR Manager (`:102`) |
| Rejected | Resubmit | Pending HR Approval | HR User (`:108`) |

- **State row order is load-bearing** (`:59-62`): `validate_workflow` falls back to
  `states[0].state` when unset, so row 1 is the entry state for every new Employee.
- Rows 2–3 duplicate rows 1's state name and are **inert** (Frappe resolves
  `state_row = state_row[0]`). Kept deliberately.
- Duplicate transitions exist because `Workflow Transition.allowed` is a
  **single-role Link** (`:71-73`); `get_transitions` filters by the logged-in role,
  so each user only ever sees their own row.
- **⚠️ Docstring/code contradiction:** `:48-52` asserts `allow_edit` is
  "intentionally omitted… would make records read-only in ERPNext desk but not in
  this app", yet rows `:63-67` all set it. One of the two is stale. See §9.1.

#### Workflow B — `Leave Application Approval` (`:118-247`)

7 state rows / 7 transitions. Every state carries `update_field: "status"` —
**the workflow, not the form, owns `status`** (`:123-132`).

| State | doc_status | status → | allow_edit |
|---|---|---|---|
| Draft (`:134`) | 0 | Open | Employee |
| Pending Leave Approver (`:141`) | 0 | Open | Leave Approver |
| Pending HR Approval (`:148`) | 0 | Open | HR Manager |
| Approved (`:155`) | **1** | Approved | HR Manager |
| Rejected (`:162`) | **1** | Rejected | Leave Approver |
| Cancelled (`:173`) | 2 | Cancelled | Leave Approver |
| Cancelled (`:187`) | 2 | Cancelled | HR Manager — *inert duplicate, kept deliberately* (`:180-186`) |

| From | Action | To | allowed |
|---|---|---|---|
| Draft | Submit | Pending Leave Approver | Employee |
| Pending Leave Approver | Approve | Pending HR Approval | Leave Approver |
| Pending Leave Approver | Reject | Rejected | Leave Approver |
| Pending HR Approval | Approve | Approved | HR Manager |
| Pending HR Approval | Reject | Rejected | HR Manager |
| Approved | Cancel | Cancelled | HR Manager |
| Approved | Cancel | Cancelled | Leave Approver |

`Rejected` is `doc_status: 1` (`:164-167`) because HRMS only permits submission
when `status` is already Approved/Rejected — a draft Rejected would stay
resubmittable. Cancellation is workflow-owned (`:227-233`): once any transition
targets `doc_status "2"`, `can_cancel_document` returns False.

**There is no `Rejected → *` path on Leave Application.** A rejected leave is
terminal. (`Resubmit` exists only on Employee.)

#### Workflow C — `Attendance Request Approval` (`:250-333`)

6 states / 5 transitions. **No `update_field` anywhere** (`:255-258`) — Attendance
Request has no status column; the outcome is purely `workflow_state` + `docstatus`.

| State | doc_status | allow_edit |
|---|---|---|
| Draft (`:261`) | 0 | Employee |
| Pending Reporting Manager Approval | 0 | Leave Approver |
| Pending HR Approval | 0 | HR Manager |
| Approved | **1** | HR Manager |
| **Rejected** | **0** | HR Manager |
| Cancelled | 2 | HR Manager |

| From | Action | To | allowed |
|---|---|---|---|
| Draft | Submit | Pending Reporting Manager Approval | Employee |
| Pending Reporting Manager Approval | **Verified** | Pending HR Approval | Leave Approver |
| Pending HR Approval | Approve | Approved | HR Manager |
| Pending HR Approval | Reject | Rejected | HR Manager |
| Approved | Cancel | Cancelled | HR Manager |

`Rejected` is a **draft here** (`:281-282`) — unlike Leave/Expense the request
must stay correctable. But note there is **no transition out of `Rejected`**,
so it is stuck at docstatus 0 with no exit button. See §9.2.

#### Workflow D — `Expense Claim Approval` (`:336-395`)

4 states / 3 transitions. Outcome lives in **`approval_status`**, and **only
terminal states write it** (`:341-345`) so an in-review claim keeps ERPNext's
defaulted `"Draft"`.

| State | doc_status | approval_status → | allow_edit |
|---|---|---|---|
| Draft (`:348`) | 0 | — | Employee |
| Pending HR Approval | 0 | — | HR Manager |
| Approved (`:358`) | 1 | Approved | HR Manager |
| Rejected (`:364`) | 1 | Rejected | HR Manager |

| From | Action | To | allowed |
|---|---|---|---|
| Draft | Submit | Pending HR Approval | Employee |
| Pending HR Approval | Approve | Approved | HR Manager |
| Pending HR Approval | Reject | Rejected | HR Manager |

**No Cancel transition and no Cancelled state** for Expense Claim.

#### Seed inventory

- Workflows: 4
- Workflow States (7 unique): `Draft`, `Pending Leave Approver`,
  `Pending Reporting Manager Approval`, `Pending HR Approval`, `Approved`,
  `Rejected`, `Cancelled`
- Action Masters (6 unique): `Approve`, `Reject`, `Submit`, `Cancel`, `Resubmit`,
  `Verified`
- Roles (4 unique): `Employee`, `HR Manager`, `HR User`, `Leave Approver`
- Workflow Document Stages: **none** — never touched by this app

### 3.5 `ui_documents.py` — ESS identity documents

4 endpoints, all `allow_guest=False`:
`get_employee_document_types()` `:241`, `list_employee_documents()` `:263`,
`upload_employee_document(type_key)` `:286`, `delete_employee_document(file_name)` `:449`.

Design decisions worth preserving:

- **No endpoint takes an `employee` argument** (`:102-129`). The Employee is
  derived from `frappe.session.user`. Passing a name would only prove the record
  exists, not that the caller may read it — and employee codes are trivially
  guessable (`HR-EMP-00001`, …). Deriving it makes cross-employee access
  impossible by construction.
- **Type config is server-side** (`DOCUMENT_UPLOAD_CONFIG` `:34-85`) and shaped to
  mirror the intended `UI Document Type` DocType, so promoting it later is a
  one-file change. 8 types, all `max_size_mb: 5`.
- **`is_private = 1` is load-bearing** (`:342-344`): `File.has_permission` returns
  True for *any* non-private file to *any* authenticated user. These are Aadhaar /
  PAN / bank proofs.
- `file_doc.save(ignore_permissions=False)` (`:360`) — deliberately not ignoring
  permissions, so Frappe enforces write on the attached Employee.
- The `[TYPE_KEY]` filename prefix (`DOCUMENT_KEY_PATTERN` `:92`) is anchored at
  the start because user filenames may contain brackets (`tax[2024].pdf`).
  `generate_file_name` appends a hash to the *stem* on collision, leaving the
  prefix intact.
- `delete_employee_document` requires **both** that the File belongs to the
  caller's Employee **and** that it carries a known `[KEY]` (`:479-490`) —
  otherwise it's a generic "delete any File I can write" primitive.
- **`PENDING_APPROVAL_STATE` (`:19`) is written with `frappe.db.set_value`, not a
  document save** — deliberately. `validate_workflow` throws for any state change
  that isn't a reachable transition, and there is deliberately no
  `Approved → Pending` transition (adding one would let any employee move any
  Employee record). So it is a **state signal, not an audited transition**: it
  records no actor. `_set_pending_hr_approval` (`:183-217`) defensively verifies
  an active Employee Workflow declares the state before writing.

**⚠️ Dead code:** lines `:385-446` are an unreachable second copy of the upload
body, sitting after `return _describe(file_doc)` at `:383`.

### 3.6 Patch + print format

`patches/v1_0/create_salary_slip_print_format.py` (162 lines), registered in
`patches.txt` under `[post_model_sync]`. Idempotent.

- Creates 6 Custom Fields on Salary Slip (`:24-73`): `pan_number`, `uan`,
  `pf_number`, `esic_no`, `client_code`, `date_of_joining` — Indian payroll
  statutory fields.
- Creates 1 Custom Field on **Salary Component**: `custom_show_in_print` (`:76-84`).
- Upserts Print Format `"Salary Slip"` (`:119-157`) with a **conflict guard**
  (`:136-144`): throws if a Print Format of that name exists for a *different*
  DocType. Temporarily sets `frappe.flags.in_migrate` (`:150-157`) because
  `Print Format.validate()` refuses to update standard formats otherwise.
- `name` is excluded from the update dict (`:120-121`) — passing it would attempt
  a rename.

The template `templates/print_formats/salary_slip.html` (255 lines) enforces
three hard rules in its header (`:1-11`): accumulate totals with `namespace()` (a
bare `{% set %}` inside `{% for %}` always reads 0); never call
`frappe.get_doc()` per row; render **only** components flagged
`custom_show_in_print`, and compute every total from that filtered set alone.

### 3.7 Store: indents and project items (added 2026-10-13)

Read-only projections supporting the purpose-first Store redesign. **Neither
writes a doctype** — they use stock ERPNext doctypes unchanged and only answer
two questions the client cannot answer safely: "what does this project need?" and
"what is still owed?".

#### The doctype chain (all fields already existed; none were used)

```
Project ──(BOM.project)──> BOM ──explode──> Material Request Item ──> Material Request
                                                              │.project, .bom_no
Stock Entry ──.project──> Project
Stock Entry Detail ──.material_request / .material_request_item──> Material Request
```

`BOM.project` is the **only** bridge from a Project to an item list. ERPNext's
`Project` doctype has no item child table, `Project Template` has only tasks, and
there is **no whitelisted endpoint anywhere in v15 that returns a project's
items**. So a project with no tagged BOM genuinely has no items.

#### `get_project_items(project, company, bom, qty)`

Why it exists rather than calling ERPNext directly — three reasons, all
load-bearing:

1. `bom.get_bom_items` has **no `has_permission` call** (`bom.py:1257`). Calling
   it from the SPA would let any authenticated user read a project's bill of
   materials. The wrapper checks BOM read explicitly.
2. `get_bom_items` hardcodes `include_non_stock_items=True` (`bom.py:1259`), so it
   returns consumables a Stock Entry rejects with *"is not a stock Item"*.
3. It cannot be used with `fetch_exploded=1` for form prefill: the exploded read
   comes from `BOM Explosion Item`, which has **no `uom` or `conversion_factor`
   column**, and `Material Request Item` requires both. The wrapper uses
   `fetch_exploded=0` and back-fills from `Item.stock_uom`.

Outstanding = `stock_qty - ordered_qty` per item — the same expression
`make_stock_entry`'s `update_item` uses (`material_request.py:757-761`).
**`received_qty` is never used**: it is Purchase-flow only and stays `0` for
Stock-Entry-backed requests.

A project with several BOMs returns them all and the UI asks; guessing would put
the wrong item codes on an indent. Passing a `bom` that is not tagged to the
project throws rather than silently returning another project's items.

Fails closed: a BOM read raises rather than returning `[]`, because an empty list
reads as *"this project needs nothing"* and would push the user to free-text an
item list that should have been generated.

#### `get_indent_queue(company)`

Submitted, unfulfilled Material Requests for the storekeeper. Restricted to
**Material Issue / Material Transfer / Customer Provided** because that is
ERPNext's own gate in `make_stock_entry` (`material_request.py:816-822`);
Purchase and Manufacture are routed through PO/PR and Production Plan, so
offering them here would surface a "Give Items" button that can only fail.

Items already fully issued are dropped, so a finished request does not sit in the
queue. For Material Transfer the source warehouse is read from `from_warehouse`
(the other two use `warehouse`), mirroring `update_item`.

#### `get_indent_list(purpose, scope, company, status, search, start, limit)`

Powers the Project / General split. **It exists because Frappe cannot express
that split as a list filter.**

`get_filter` (`frappe/utils/data.py:1940`) sanitises a filter's fieldname and
resolves it against the **parent** meta. `items.project` is not a field of
`Material Request`, so it falls through to the child-table branch, which sets
`f.doctype = "Material Request Item"` — and `prepare_filter_condition` then just
*appends* `` `tabMaterial Request Item` `` with **no join**. The result is a
cross join: an indent with three items on one project comes back three times and
paginates wrongly. Verified against MariaDB — N parents × M items, no dedupe.

So the split is computed here instead:

1. `frappe.get_all("Material Request", ...)` → candidate names. **`get_all`
   still applies read permissions** (it only skips them with an explicit
   `ignore_permissions=True`), so the selection stays permission-checked.
2. One query for every item's `project`, not one per request.
3. Split in Python, paginate in Python, then fetch the page's rows and restore
   the computed order.

`scope="all"` interleaves the two buckets rather than listing all project indents
then all general ones, so the default view stays ordered by recency across both.
Candidates are capped at 2000.

The server owns the purpose→type map in `SPA_REQUEST_PURPOSES`: the client sends
a purpose key, never a `material_request_type`, so a caller cannot create a
request of a type the map never vetted.

#### `get_item_uom_options(item_code)`

Everything the Purchase Receipt screen needs to render a row's UOM control in
one call: `{stock_uom, uoms: [{uom, conversion_factor, must_be_whole_number}]}`.

It exists instead of reading `Item.uoms` over REST, or of calling ERPNext's
`get_conversion_factor` once per candidate UOM, because `must_be_whole_number`
has to come back in the same payload — `validate_uom_is_integer`
(`purchase_receipt.py:276-278`) rejects a fractional qty against a UOM flagged
that way, so knowing it is the difference between catching it in the form and
catching it on save. The stock UOM is always present in the result even if no
conversion row exists, because it is by definition factor 1.

#### Purchase Receipt: which POs are receivable

Not a guess — ERPNext derives Purchase Order `status` from `per_received`
(`controllers/status_updater.py`), and only two of the nine statuses mean
"something is still to receive":

| Status | Condition | Receivable |
|---|---|---|
| `To Receive and Bill` | `per_received < 100 and per_billed < 100 and docstatus == 1` | ✅ |
| `To Receive` | `per_received < 100 and per_billed == 100 and docstatus == 1` | ✅ |
| `To Bill` | `per_received >= 100` | ❌ fully received |
| `Completed` / `Closed` / `On Hold` / `Cancelled` / `Draft` | — | ❌ |

`make_purchase_receipt` itself only maps lines where
`abs(received_qty) + abs(already_mapped) < abs(qty)` and
`delivered_by_supplier != 1`, and sets `qty = qty - received_qty`. So an
already-received PO yields an empty document rather than an error — the picker
filters on status and the form renders a "nothing outstanding" state.

#### Quantity arithmetic: do not duplicate it client-side

| Quantity | Source of truth |
|---|---|
| Outstanding on an indent | `stock_qty - ordered_qty` on Material Request Item |
| Progress % | `per_ordered` (saturates at 100 on over-issue — `status_updater.py:484-506`) |
| What a Stock Entry becomes | `material_request.make_stock_entry` (whitelisted, `material_request.py:754`) |
| What a Purchase Receipt becomes | `purchase_order.make_purchase_receipt` (whitelisted, `purchase_order.py:731`) |
| UOM factor for an item | `get_conversion_factor` / `get_item_details` (`get_item_details.py:1461`, `:59`) |
| Stock qty on a receipt | `qty × conversion_factor` |
| Stock availability | `Bin.actual_qty - Bin.reserved_qty` |

`material_request.make_stock_entry` already maps purpose, warehouses, the
`material_request`/`material_request_item` linkage and the outstanding qty.
**Do not hand-roll it.** The `Stock Entry` `on_submit` hook
(`hooks.py:339-341` → `update_completed_and_requested_qty`) then maintains
`ordered_qty` and status.

---

## 4. Frontend architecture

### 4.1 Provider order (`main.jsx`)

`I18nProvider → ToastProvider → HeaderProvider → RoleProvider → App`

Theme is initialised before mount from `localStorage["app_theme"]`
(`main.jsx:13-28`), defaulting on parse failure.

### 4.2 Routing

`HashRouter` (`App.jsx:66`). ~50 routes. Per-hub generic trio
(`/:hub/:doctype`, `/new`, `/:name`) for `/hr`, `/sales`, `/purchase`, `/ess`,
`/store`, `/quality`.

Lazy chunks (`App.jsx:36-44`): Quality reports, and all three Reports pages —
kept out of the initial bundle mainly to defer **recharts**.

Print: `/ess/print/:doctype/:name` and generic `/:hub/print/:doctype/:name`.

**HashRouter is why the route guards exist** — every URL is a plain hash anyone
can type or bookmark, so hiding a nav item is not access control.

### 4.3 `services/api.jsx` — the only HTTP layer

- Base `/api`, overridable by `VITE_API_BASE_URL` (`:1-5`)
- CSRF fetched once from `erpnext_ui.api.get_csrf_token`, cached in memory, sent
  as `X-Frappe-CSRF-Token` on every unsafe method (`:19-38`)
- **One** automatic retry on `exc === "CSRFTokenError"` — session rotation must
  not silently lose a write (`:163-166`)
- **Failure is decided by HTTP status + `json.exc`, never by `_server_messages`**
  (`:180`). Frappe attaches `_server_messages` to successful responses as
  msgprint's out-of-band channel (commonly `"[]"`); treating its presence as an
  error made every successful Leave Application save throw.
- `parseServerMessages` (`:83-128`) maps **top-level** fields only; child-table
  refs like `expenses[0].amount` stay in the flat list (`:122-125`)
- `uploadFile` (`:236-279`) is a separate multipart path that sends CSRF **twice**
  (header + `csrf_token` form field) because same-origin and cross-origin setups
  read different sources
- `ApiError` carries `{exc, status, fieldMessages, messages}`

### 4.4 `lib/` — the domain rules. Read these before touching anything.

| Module | What it encodes |
|---|---|
| `docTransition.js` | The document state machine. §8.1 |
| `approvalMeta.js` | Meta-safe doctype introspection; `PREFERRED_STATUS_FIELD` Expense Claim→`approval_status` (`:23-28`); `IMPLICIT_FIELDS` (name/owner/creation/modified/modified_by) never filtered out — `name` has no DocField row (`:83-89`); meta cache stores the promise, **failures are not cached** (`:64-72`) |
| `employeeScope.js` | Filing-on-behalf. Identity = `Employee.user_id == session.user`, **without** `ignore_permissions` so a user always sees their own record. `canSelect` probe: read 2 active Employees, if any ≠ mine I may file for others. `isEmployeeLocked` pins self-only users |
| `leaveApproval.js` | No-Workflow leave approval. `canActAsLeaveApprover` is an **exact User-id match** on `leave_approver` (`:26-28`) — narrow on purpose, else an employee approves their own leave. Uses `frappe.client.set_value` (not PUT) so only `status` is touched (`:61-81`) |
| `namedApprovers.js` | `hrms...department_approver.get_approvers`. Must send `doctype` **both top-level and inside filters** — omitting the nested copy raises `UnboundLocalError: parentfield` (`:29-32`). Returns **tuples** `[name, first, last]`. The HRMS helper **throws** rather than returning `[]` — treat a throw as "no approvers" |
| `profileFlags.js` | ESS HR gate. Uses **presence** of `workflow_state` as a per-site capability signal: absent or `null` → no warning; any non-`"Approved"` → warn. Deliberately ignores `custom_hr_approved` because permlevel>0 fields are stripped from REST for non-privileged users |
| `formValidation.js` | `validateRequired` skips layout-break fieldtypes and `hidden`; `focusFirstError` uses `[data-field="X"]` (the contract `FormField` sets) and defers one frame via `requestAnimationFrame` so errors paint before focus |
| `filterChips.js` | `listFilterHandlers` — **every** filter mutation resets to page 1 |
| `statusTones.js` → `components/List/` | `statusTone()` uses **ordered keyword regexes** because Workflow states are admin-authored and un-enumerable client-side. Order is load-bearing: `pending` is tested **before** `approv`, else "Pending Approval" renders green; `cancel` maps to `open`, before pending |
| `mapVariant.js` | Legacy bootstrap variant → shadcn Button (still consumed by `PageToolbar`, `ActionBar`) |
| `tileNav.js` | Tile click → navigate; create click → `/app/<slug>/new-<slug>` new tab if `nativeForm` |
| `gridCorners.js` | Deliberate no-op returning `""`. Cards stay square |
| **`storePurposes.js`** | The purpose→doctype contract for the Store module. §4.8 |

### 4.5 `config/`

- `moduleAccess.js` — role→module coarse pass + `gatedBy` refinement. §5
- `doctypes.js` (338 lines) — per-doctype `titleField`/`subtitleField`/
  `metaField`/`statusField`, `searchFields`, `baseFilters`, `form.layout`,
  `printFormat`, and two behaviour flags:
  - **`nativeForm: true`** (11 doctypes: Salary Structure, Opportunity,
    Quotation, Sales Order, Sales Invoice, Purchase Order/Receipt/Invoice,
    Supplier Quotation, Request for Quotation, Stock Reconciliation) → row click
    opens ERPNext desk in a new tab
  - **`readOnly: true`** — Overtime Log (`:98`), Salary Slip (`:108`) → render
    print preview, no editable form
  - Forced layouts: `Employee` → `stepper` (`:30`), `Leave Type` → `single` (`:59`)
  - ⚠️ `Employee` sets `printFormat: "Employee Appointment Letter"` (`:28`) but
    **no patch in this app creates that Print Format**. See §9.3.
- `topBar.js` — composition flags only. `pageToolbar: true` puts page actions in a
  fixed bottom bar.

### 4.6 Context

- **`RoleContext.jsx` — the security spine.** Fetches `get_current_user` +
  `get_ui_access` in parallel. `doctypeAccess` **defaults to
  `{approvals:{},reports:{}}`** (`:18-26`) and its error path calls
  `getFailClosedModules()` (`:58-65`), because the previous fallback
  `getAccessibleModules(["*"])` returns exactly ESS + Approvals + Reports —
  a network blip used to hand every user the Approvals hub.
- `ToastContext.jsx` — sonner wrapper; `MutationObserver` on
  `documentElement[data-theme|lang|dir]` so toasts flip theme and move to
  `bottom-left` under RTL.
- `HeaderContext.jsx` — `header` config + `shellMode` (`"default"|"list"`);
  `ListLayout` sets `"list"` so `AppShell` suppresses the bottom action bar.

### 4.7 i18n, theme

3 languages `["en","hi","ar"]`, default `en`, `localStorage["app_lang"]`.
`RTL_LANGUAGES = ["ar"]` → `<html dir>` synced on `languageChanged`.
Namespaces are **one JSON pair per module** (7 per language, 21 total) so
parallel work never collides on `translation.json`: `translation.json` (core),
`approvals`, `ess`, `store`, `ops` (production/quality/reports/print),
`commercial` (hr/sales/purchase/demo), `reports`.

`ThemePanel` writes ~20 CSS custom properties + `data-theme` via
`utils/theme.js applyTheme()`, persisted to `localStorage["app_theme"]`.

### 4.8 `config/storePurposes.js` — the Store vocabulary (added 2026-10-13)

The single place mapping **what a person wants to do** onto **what ERPNext
stores**. A user picks a *purpose*, never a doctype. Pure data — no React, no
i18n, no api import — so it can be asserted in `.smoke-tmp/rules.jsx` without a
DOM.

Three defects it exists to prevent, all of which shipped:

1. **Invalid doctype values.** The old Store hub offered
   `material_request_type: "Transfer"` and `"Material Receipt"`. ERPNext v15's
   Select options are `Purchase | Material Transfer | Material Issue |
   Manufacture | Customer Provided` — Frappe's `_validate_selects`
   (`base_document.py:892`) threw **HTTP 417** on every save.
2. **One concept, two names.** The raw enum and the display label lived in two
   parallel namespaces (`store.types.*`, `store.entryTypes.*`) that drifted, so
   one screen said "Material Transfer" and another said "Transfer".
3. **Shared vocabulary across documents.** "Material Issue/Transfer/Receipt"
   names both a *Material Request type* and a *Stock Entry purpose* — opposite
   directions on different documents. That collision is the actual reason people
   could not tell which to pick.

**Request purposes** → Material Request: `indent` → Material Issue, `purchase` →
Purchase, `transfer` → **Material Transfer**, `production` → Manufacture,
`customerProvided` → Customer Provided. Only the first three are
`fulfillableByStore`, mirroring ERPNext's own gate.

**Stock Entry purposes** → the nine standard entries, each carrying which
warehouse sides to show and whether a Work Order is required, derived from
`validate_warehouse` (`stock_entry.py:826-900`):

| Group | Purposes |
|---|---|
| `everyday` | issue, receipt, transfer |
| `manufacturing` | transferForManufacture, consumption, manufacture |
| `correction` | repack, disassemble, subcontractor |

Two facts encoded there:

- **`stock_entry_type` is a Link to the `Stock Entry Type` doctype**, not a
  Select. The nine standard records simply happen to share their purpose's name.
- **`purpose` is hidden, read-only and `fetch_from`-derived.** Posting it is
  pointless — `set_fetch_from_value` (`base_document.py:869-890`)
  unconditionally overwrites it. `buildStockEntryPayload` therefore **never
  emits `purpose`**, and 26 smoke assertions guard that.

`store.json` gained the matching `store.purposes.*`, `store.giveItems.*`,
`store.projectItems.*`, `store.movements.*` and `store.labels.*` namespaces in
**all three locales** (323 keys each, verified identical).

### 4.9 Layout

`AppShell.jsx` (531 lines) — `NAV_SECTIONS` (`:67-294`) is the nav model,
4 sections with layered gating:

| Section | Gating |
|---|---|
| main | Home; Approvals (`moduleKey` + doctype gate) |
| operations | Store (`Stock`), Quality (`Quality`), **Production — no `moduleKey`, always visible** |
| people | Requests (`ESS`), ESS (`ESS`), HR, Sales, Purchase |
| insights | Reports (`Reports` + per-child `reportKey`) |

Items filtered by `!item.moduleKey \|\| hasModuleAccess(...)` (`:414-416`);
report children by `canReadReport(child.reportKey)` (`:312-314`). A parent whose
every child is withheld renders as a plain link so the section doesn't open onto
nothing (`:329-340`).

---

## 5. Access control — the complete model

**Layer 1 — role names → coarse module list.** `getAccessibleModules(userRoles)`
(`moduleAccess.js:103-112`). `"*"` matches everyone.

| Module | Roles | Extra |
|---|---|---|
| HR | HR Manager, HR User, Administrator | |
| Sales | Sales Manager, Sales User, Administrator | |
| Purchase | Purchase Manager, Purchase User, Administrator | |
| Stock | Stock Manager, Stock User, **Manufacturing User**, Administrator | |
| Quality | Quality Manager, Quality User, Administrator | |
| ESS | `"*"` | **`public: true`** |
| Approvals | `"*"` | `gatedBy: "approvals"` |
| Reports | `"*"` | `gatedBy: "reports"` |

**Layer 2 — real doctype read permission.** `applyDoctypeAccess(modules, access)`
(`moduleAccess.js:144-158`): a `gatedBy` module survives only if the user can
read **≥1** backing doctype, because a hub with nothing in it is a blank page
that still confirms which doctypes exist.

**Fail-closed.** `getFailClosedModules()` (`moduleAccess.js:126-130`) returns only
`public: true` modules — i.e. ESS alone. Used on both the no-session and the
request-failure path.

**Route guards** (needed because of HashRouter):
- `RequireApprovalDoctypeAccess.jsx` — also blocks *unlisted* doctypes:
  `#/approvals/Employee` resolves to `undefined` = no access, so this route can't
  become a permission-free door to any list the SPA can render
- `RequireReportAccess.jsx` — one per report route, `reportKey` must match
  `SPA_REPORT_DOCTYPES` in `api.py:25-29`

Both return `null` (no flash) while permissions load.

**Deliberately NOT client-gated** (server is the only boundary):

| Thing | Why |
|---|---|
| Leave Application row delete | `LeaveApplicationList.jsx:186-189` — surface the server's `PermissionError` verbatim |
| All `GET resource/*` queries | Frappe permission-filters the response; a denial is an empty list |
| HR / Sales / Purchase hub pages | `App.jsx:238-241` serves `GenericList` with no module check. An unauthorized user sees the tile and an empty/erroring list, not a refusal |
| ~~Stock Entry valuation~~ — **fixed** | `enrichValuation` is wrapped in `try`/`catch` and falls back to a zero-valued map, so a site without `shopfloor` now shows an unvalued entry instead of a thrown render |

---

## 6. The generic CRUD engine

### 6.1 `GenericList`

`components/GenericList/index.jsx` (471 lines). Requests `BASE_FIELDS`
(`name, owner, creation, modified, docstatus`) + 4 config-derived display fields
(`:24`). Query: `GET resource/<dt>` with `fields`, `filters`, `order_by:
"modified desc"`, `limit_start`, `limit_page_length`; search becomes `or_filters`
of `[searchField,"like","%q%"]`; count in parallel via
`frappe.client.get_count` (`:253-260`).

`config.baseFilters` (`:216-231`) are merged in **first** and are not clearable
from the filter bar — a user ticking a status chip must not be able to widen a
list past a business rule. This field was documented in `doctypes.js` and set on
two entries but **never read anywhere**, so it silently did nothing until
2026-10-13. A chip on a field that already has a base filter is ignored rather
than overriding it. First real user: `BOM`, filtered to `is_active = 1`.

Filter config is **auto-discovered** from `resource/DocType/<dt>` (`:112-196`):
a hardcoded `PRIORITY_FIELDS` list scanned first (`workflow_state, status,
company, department, supplier, customer, employee, employee_name, posting_date,
transaction_date, from_date, to_date, item_code, item_group`), then any
remaining Link/Select/Date, **capped at 8**.

Row click → `nativeForm` desk tab / `readOnly` print preview / SPA form
(`:354-369`). Page size 10.

> ⚠️ Unlike the Approvals screen, GenericList does **not** meta-validate its field
> list. A config field the doctype lacks fails the whole query.

### 6.2 `GenericForm`

`components/GenericForm/index.jsx` (1071 lines).

**Meta discovery** (`:497-572`): `GET resource/DocType/<dt>` plus, in parallel,
`GET resource/DocType/<child>` for every `Table` field. `initialDoc` skips
`SYSTEM_FIELDS` and layout-break fieldtypes; `Check` → `0`, `Table` → `[]`, else
`null`.

**`buildLayout.js`** (241 lines): hierarchy is **Tab Break → tab → Section Break →
section → fields**. Fields before the first break go into an implicit section
under an implicit tab so nothing is dropped (`:56-115`). `resolveLayoutMode`
(`:120-147`): config override wins; else `≤12 fields && ≤2 sections && no tabs` →
`single`; `>30 fields || ≥5 sections || >5 tabs` → `tabs` if tabbed and `≤40`
fields, else `stepper`; `hasTabBreak` → `tabs`; `≥3 sections && >12 fields` →
`tabs`. `buildSteps` (`:155-225`): one step per tab if tabbed, else per section
merging tiny sections up to 12 fields; **Table-only sections always flush to
their own step**.

**Field type map** (`fieldTypes/index.js:25-58`):

| ERPNext fieldtype | Component |
|---|---|
| Data | DataField |
| Small/Text/Long Text | TextField |
| Select | SelectField (splits `options` on `\n`) |
| Link | LinkFieldWrapper → LinkField with `field.options` |
| Date / Datetime / Time | DateField / DatetimeField / TimeField |
| Currency / Float / Int / Percent / Rating | CurrencyField (**hardcoded ₹**) / FloatField / IntField / FloatField / IntField |
| Check | CheckboxField (writes 1/0) |
| Read Only | ReadonlyField |
| fallback | DataField |

`isReadOnly = docstatus >= 1 || config.readOnly` (`:164-165`).
`SYSTEM_FIELDS` stripped before save (`:57-62`). Delete only at `docstatus === 0`
(`:644`). Grid: 3+ fields/row → `md:col-span-4`, 2 → `col-span-6`, 1 → `col-span-12`;
`Check` renders bare; `Table` renders full-width.

**Field change** (`handleFieldChange` `:170-219`): mark dirty → set value → clear
that field's error → **`fetch_from` auto-population** for changed Links → debounced
(1500 ms) `POST method/frappe.client.validate`, only for doctypes containing a
`Table`, copying back `total_qty, total, net_total, total_taxes_and_charges,
grand_total, rounded_total, in_words` (`:224-248`).

### 6.3 Two contracts that look like mistakes and are not

**The `docRef` pattern.** Toolbar actions are registered in an effect that
deliberately does **not** depend on `doc`; handlers therefore closed over a stale
document and Save POSTed stale data, discarding edits. Every handler reads through
`docRef.current` (`:95-110`). 9 copies across the app. `Quality/entry/InspectionForm`
extends it with `overallStatusRef`/`parametersRef`.

**`dirty` is event-based, never diff-based.** Only `updateField`/
`updateFieldObject` set it. Effects also write to `doc` — employee scope defaults,
auto-selected approvers, server-calculated totals — and those are not edits.
Diffing would report a freshly-opened form as dirty and leave Submit permanently
hidden.

---

## 7. Module-by-module business logic

### 7.1 Dashboard (`pages/Dashboard/index.jsx`)

Module tiles + 4 KPI cards from `frappe.client.get_count`, each
permission-filtered by Frappe: Purchase Order `status=Pending` (`:68`),
Expense Claim `status=Open` (`:73`), Job Card `status=Open` (`:78`),
Quality Inspection `status=Pending` (`:83`). Sequential awaits. Approvals renders
as a highlighted card with a destructive badge only when the count > 0
(`:134-164`).

### 7.2 Requests — Leave / Attendance / Expense

The most business-dense area. All three share: `docTransition` +
`approvalMeta` + `employeeScope` + `namedApprovers`.

#### Leave Application

Fields: `employee, leave_approver, leave_type, from_date, to_date, half_day,
description` + read-only `docstatus/status/workflow_state`.

> HRMS stores the leave reason in **`description`** (label "Reason"). The form
> once sent a non-existent `reason` field which was silently dropped.

**Validation** (`LeaveApplicationForm.jsx:347-393`): employee, leave_type,
from_date, to_date, `leave_approver` (custom "select an approver") required;
`to_date >= from_date`; and a **leave-balance check** (`:377-385`) — only when
the employee has a real allocation row for that leave type, so a type like
*Leave Without Pay* with no allocation skips rather than failing against a fake 0.

`getTotalDays` (`:324-335`) = calendar days, minus 0.5 when `half_day`.
**No weekly-off/holiday exclusion** — deliberately left to the server.

Balance source (`:290-312`): `POST
hrms.hr.doctype.leave_application.leave_application.get_leave_details`.

Approver auto-selects **only when exactly one candidate exists** (`:254-285`);
otherwise left blank for an explicit choice.

**`status` Select is disabled when a Workflow exists** (`:980-985`) —
`apply_workflow` rewrites `status` from the next state's `update_value` on every
transition, so anything typed would be overwritten.

Lifecycle:
```
docstatus 0 (Draft)     → Save, Transitions, Approve/Reject*, Submit**, Back, Delete
docstatus 1 (Submitted) → Transitions (if workflow), Cancel*** (no workflow)
docstatus 2 (Cancelled) → Back, Delete   (isSubmitted = docstatus > 0, so locked)
  * only when no workflow AND currentUser === doc.leave_approver
  ** requires status ∈ {Approved, Rejected}
 *** hidden when a Workflow exists — the Workflow owns cancellation
```

Save on a new form navigates to the **saved document**, not the list (`:426-431`),
because a new form only offers Save and that's where Submit becomes reachable.

#### Attendance Request

Fields: `employee, company, from_date, to_date, half_day, half_day_date,
include_holidays, shift, reason, explanation`.

- **No `status` field at all** — the lifecycle is `docstatus` + `workflow_state`;
  status renders as a read-only `DocStatusField`.
- `reason` is a **restricted Select of exactly `Work From Home` / `On Duty`**
  (`:900-910`) — matching HRMS's options.
- `company` is re-derived from the Employee on every employee change
  (`:183-191`); a one-time set-on-mount left it stale.
- Validation: employee, from_date, to_date, reason required; `to_date >= from_date`;
  `half_day && !half_day_date` → error on `half_day_date`.
- `half_day_date` quick-pills are **suppressed when the range exceeds 7 days**
  (`:805`).
- **Save-first submit** (`:497-510`): unlike Leave, `handleSubmit` on an unsaved doc
  saves it first.
- **No Approve/Reject** — HRMS has no approver column here.
- Unlike the other two request lists, **there is no blanket `docstatus != 2`** —
  cancelled rows are visible.

#### Expense Claim

Fields: `employee, company, expense_approver, posting_date, remark,
approval_status, expenses[]`.

- `approval_status` is **seeded to `"Draft"`** (`:63-75`) rather than defaulted at
  render — an untouched Save would `PUT approval_status: ""` and ERPNext rejects it.
  Same trick as Leave's `status: "Open"`.
- Validation: employee, company, `expense_approver` required; ≥1 expense row; each
  row needs `expense_date`, `expense_type`, `amount > 0`.
- `company` is a **permanently disabled read-only Input** (unlike Attendance Request).
- Total is client-computed and **never written** — the server recomputes.
- **No Delete, no Approve/Reject.** Expense approval is Workflow-only.
- `approval_status` Select disabled when a Workflow exists (`:722-728`).

### 7.3 Approvals hub

**5 doctypes** (`components/Approval/index.jsx:35-62`), matching
`SPA_APPROVAL_DOCTYPES`: Purchase Order, Expense Claim, Leave Application,
Quotation, Overtime Log (Overtime Log overrides `pendingStatus: "Draft"`).

**"My pending approvals" has no per-user filter.** `buildFilters`
(`ApprovalListPage/index.jsx:250-274`) scopes by (a) Frappe's permission system on
the query and (b) doctype-level base filters:

| Doctype | Base filter |
|---|---|
| *(all)* | `docstatus = 0` |
| Purchase Order | status not in `["Completed","Cancelled"]` |
| Expense Claim | status ≠ `"Approved"` |
| Leave Application | status in `["Open","Applied"]` |
| Overtime Log | status = `"Draft"` |

A selected status chip switches `docstatus` to `1` and pins the status field.
Additional chips are added only if `meta.fieldSet.has(field)`, else Frappe rejects
the whole query.

Leave Application's field list **includes `leave_approver`** — "Needed by the
preview to decide whether this user may Approve/Reject" (`:56-58`).

Who can approve (`ApprovalPreview/index.jsx:302-315`):
1. Workflow present → only transitions the logged-in role may run. If a Workflow
   exists but this user has **zero** transitions, the code must **not** fall back to
   raw document actions — the backend's decision stands.
2. No Workflow + Leave Application → `resolveLeaveApprovalActions`, shown only to
   the exact named approver.
3. No Workflow + other submittable doctypes → plain actions, Frappe enforces.

Default actions are filtered through `canSubmitDocument` (`:310-314`) — "offering
a button that can only fail is worse than omitting it". Footer precedence:
**Approve → Reject → (transitions else defaults)** — they never mix. Reject gets
a `ConfirmDialog`.

5 typed previews + `DefaultPreview`: PurchaseOrder (Terms + Payment Schedule
surfaced **above** items so the approver reads commercial terms first),
Quotation, Expense, Leave, OvertimeLog. `PreviewRenderer` **refetches the full
document** (`GET resource/<dt>/<name>`) because the list row is a projected field
set lacking items, taxes and addresses.

> `components/Approval/ActionButtons/index.jsx` is **dead** — two hardcoded
> Reject/Approve buttons with no handlers.

### 7.4 Reports

All three routes are guarded by `RequireReportAccess reportKey=…`, and keys must
match `SPA_REPORT_DOCTYPES` (`api.py:25-29`).

**Attendance** — `AttendancePage.jsx` (671 lines) + Calendar/Grid/Legend.
`normalizeStatus` folds `HD/A` and `HD/P` → `HD` (`:62-65`). The WFH bucket counts
as its own slice **and** toward Present; the pie subtracts WFH from Present so
slices are distinct (`:180-187`). Attendance rate is computed **only when
`can_view_others`**; working days exclude `WO`, `H` and empty; `HD` = 0.5.
`AttendanceGrid` passes the **full English label** to `clickStatus` because the
page string-compares against it (`:20-23`).

**Leave Balance** — shared by ESS and Reports via a `context` prop. The
department+employee filter panel and CSV export render **only when
`can_view_others`** (`:334-405`). Matrix cell tone (`:701-717`): `allocated <= 0`
→ muted; `balance <= 0` → destructive; `balance < allocated * 0.25` → warning.
Fiscal year always comes from the server response, never the browser. CSV export
is entirely client-side via `Blob`.

**Overtime** — `GET resource/Overtime Log` for a date range, limit 500,
**org-wide with no employee filter**; gated purely by read permission on
`Overtime Log`.

### 7.5 ESS

- **Profile** — read-only, print via `frappe.utils.print_format.download_pdf`,
  documents modal. `loadProfile({silent})` avoids a loading swap because that
  would unmount the open modal (`:122-162`).
- **EmployeeDocuments** — types come from the server; after upload the server
  flips the Employee to *Pending HR Approval* so the parent does a **silent**
  reload so the banner updates without closing the modal. Delete is guarded by a
  nested `ConfirmDialog`.
- **Attendance** — personal calendar. Cell precedence: **a real Attendance record
  always beats weekly-off/holiday** (`:280-281`). `isMissing = !att && isPast &&
  !isWeeklyOff && !isHoliday`. Click routing → check-in logs (Present) or a
  day-detail modal offering **deep links** to `/requests/leave/new?from_date=…` and
  `/requests/attendance/new?from_date=…&to_date=…` (`:288-294`).
- **OvertimeLogs** — read-only; `Overtime Log` is `readOnly: true` in
  `config/doctypes.js`.

### 7.6 Store

Rewritten 2026-10-13 from doctype-shaped tiles to **purpose cards**. See §3.7
for the endpoints and §4.8 for the vocabulary.

**Hub** (`pages/Store/index.jsx`) — three labelled sections:

| Group | Tiles | Card click goes to |
|---|---|---|
| *I need something* | one per `REQUEST_PURPOSE_KEYS`: Raise an Indent, Ask Purchase to Buy, Move Stock Between Stores, Customer's Material, For Production | **the form** |
| *I keep the stock* | **Receive Material** (Purchase Receipt), Give Items (the queue), Stock Entry | their own screen |
| *Lookups* | Stock Balance, Item, Warehouse, **Bill of Materials**, Delivery | their own screen |

**The dashboard is where you act.** A purpose card opens its form directly —
there is no intermediate list to click through. Purpose cards therefore do *not*
go through `createTileNav`: that handler derives a doctype from the route's last
segment on a create click, and the route is now
`/store/material-request/purpose/indent/new`, not a doctype name.

Browsing is deliberately a **separate** action ("All requests", a header action),
because reading existing requests is a different intent from raising a new one
and folding it into the card click would put a read action behind what reads as
a create action.

Routes:

| Route | Page |
|---|---|
| `/store/material-request` | the **single** browse surface — every purpose |
| `/store/material-request/purpose/:purpose/new` | the only way to create one |
| `/store/material-request/:name` | open/edit an existing request |

There is **no per-purpose list route**, and there is no purpose-hub page. Both
were removed on 2026-10-13: with cards going to the form, a per-purpose list had
no entry point, and the hub's cards merely restated the dashboard.
`get_indent_list` still accepts a `purpose` argument for when a scoped view is
wanted.

- **List** — segmented **All / Project indents / General indents**, with counts.
  Both the segment and the pagination come from `get_indent_list`; see §3.7 for
  why this cannot be done as a client-side filter. No "New" action: the list
  spans every purpose, so it has no single type to create.
- **Form** — no Purpose dropdown (the route supplies it). **Every item row carries
  its own Project.** Setting a project on a row loads that project's BOM via
  `get_project_items` and swaps that row's Item field to a `FormSelect` limited
  to those items, labelled `required`/`outstanding`; clearing it goes back to
  free `LinkField` search. Choosing a BOM item pre-fills qty with the
  **outstanding** figure rather than the full BOM quantity, because asking again
  for material already requested is how duplicate indents happen.
  Validation: company required, `customer` required for *Customer Provided*, and
  for *Material Transfer* both warehouses required **and different**.
- **Give Items** (`pages/Store/indents/`) — the queue from `get_indent_queue`.
  Each indent expands to per-item outstanding quantity, editable for a partial
  issue. Submitting calls ERPNext's own
  `material_request.make_stock_entry`, then lowers each line's `qty` to what was
  typed (never raising it — `update_completed_qty` throws on over-issue),
  deletes the read-only `transfer_qty`, POSTs, and submits.
- **Purchase Receipt** (`pages/Store/purchase-receipt/`) — PO-first, with a
  direct-entry escape. Landing page lists submitted POs filtered to the statuses
  ERPNext derives from `per_received < 100` — `To Receive and Bill` and
  `To Receive` only — and shows `% received` so outstanding is visible before
  clicking. Picking one carries the PO name in `?po=`; the **form** maps it on
  mount through `purchase_order.make_purchase_receipt`, so nothing is written
  until Save and a reload re-maps cleanly.

  Four ERPNext constraints shape the form, all in `purchase_receipt.py` /
  `transaction_base.py`:

  | Constraint | Source | How the UI handles it |
  |---|---|---|
  | PO-linked rows are compared on **project, uom, item_code** — a mismatch throws *"Incorrect value in row N: UOM must be equal to 'Kg'"*, and `uom`/`conversion_factor` are excluded **only** when `is_return` | `purchase_receipt.py:306-316`, `transaction_base.py:96` | those fields are **locked** on a mapped row, not merely validated — a picker there could only produce a save failure |
  | duplicate `purchase_order_item` across rows throws *"Duplicate row"* | `transaction_base.py:109` | blocked client-side |
  | a UOM flagged `must_be_whole_number` rejects a fractional qty | `purchase_receipt.py:276-278` | flag fetched with the UOM list; enforced on the row |
  | future `posting_date` throws | `purchase_receipt.py:268` | validated |

  **Auto-conversion** is the point of the screen: item picked →
  `get_item_details` fills `uom`/`stock_uom`/`conversion_factor`/`stock_qty`/`rate`;
  UOM changed → `get_conversion_factor` rewrites the factor and `stock_qty` is
  recomputed as `qty × factor`, shown under the qty field (`×250 · 500 Nos`) so a
  mismatch surfaces before save. The UOM picker is rendered **only when the item
  has more than one UOM** — as of 2026-10-13 no item on the sample site does
  (all 458 have exactly one conversion row, equal to their stock UOM, factor 1),
  so today the field collapses to a read-only single value.

  Direct entry: `Buying Settings.po_required` decides whether it is offered. It
  is read with the already-whitelisted, already-permission-checked
  `frappe.client.get_single_value` (`frappe/client.py:182`), and the "Receive
  without a Purchase Order" action is **hidden when it is `Yes`** — better not to
  offer a path that cannot save.

- **Delivery Note / Stock Balance / Stock Entry** — unchanged; see below.

- **Delivery Note** — `DeliveryNotePicker` offers only **Sales Order** and
  **Pick List**, filtered `docstatus = 1 AND status != "Closed"`. SO→DN maps
  `qty = i.qty - (i.delivered_qty || 0)` and **drops lines at ≤ 0 remaining**
  (`:64-83`). `addRow` pre-fills the row warehouse from `set_warehouse`.
- **Stock Balance** — blanket `actual_qty != 0`; stock value computed
  **client-side** as `actual_qty * valuation_rate`; page size 20; read-only.
- **Stock Entry** (`components/StockEntry/`) — available = `stockQty - reservedQty`
  from `Bin` (`:190`). `getStockMode()` (`:121-126`): `"none"` for
  Purchase Receipt/Invoice, else `"strict"` (clamps qty to available). Warehouse
  mapping per entry type (`:284-301`). Material Receipt forces
  `basic_rate`/`valuation_rate`; other types set `allow_zero_valuation_rate` when
  valuation fell back (`:303-313`). Over-issue blocks submit and opens
  `StockFixModal` offering **remove vs adjust** (`:327-335`). Entry types are
  **hardcoded** (`api/LoadEntryType.jsx:9-21`). Submits via
  `POST resource/Stock Entry/<name>` with `{run_method:"submit"}` (`:343-345`).

### 7.7 Production

- **Work Order** — monitor-only, **no create/edit form**. Row click opens a
  read-only preview showing `completed_qty / qty` per operation.
- **Job Card** — the one page with a real state machine, driving
  `erpnext.manufacturing.doctype.job_card.job_card.{start,complete,pause}_job`:

| status | actions |
|---|---|
| Open | Start |
| Work In Progress | Pause, Complete |
| anything else | none |

List filters on **both** `docstatus != 2` **and** `status not in ["Cancelled"]`
(`:81-84`) — a Job Card can be submitted yet cancelled.

### 7.8 Quality

- **Inspection Parameter / Template** — template child rows use a **three-mode**
  model (`formula` > `numeric` > `value`) projected onto the single `mode` field;
  `preparePayload` (`:122-151`) translates back to ERPNext's
  `numeric`/`formula_based_criteria` booleans. Switching mode clears the
  irrelevant inputs.
- **InspectionForm** — the QC engine. `updateReading` (`:49-77`):
  `avg = mean(readings)`, `target = (min+max)/2`,
  `deviation = |(avg-target)/target| * 100`, `status = deviation <= tolerance`.
  `overallStatus` (`:80-88`) is **worst-status-wins, short-circuiting on Pending
  first**. Only `reading_1/2/3` are persisted, so a 4th reading the UI allows is
  **silently dropped**.
- **Reports** — the only place in the app using `docstatus = 1` rather than
  `!= 2`; filters by **`creation`**, not `report_date`; client-side aggregation,
  no `get_count`.

### 7.9 HR / Sales / Purchase

Structurally identical tile hubs. `Attendance` and `Salary Slip` have no
`createRoute` (list-only). Tiles marked `nativeForm` hand the user out to ERPNext
desk in a new tab. **No `hasModuleAccess` check inside these hubs** — see §5.

---

## 8. The ten cross-cutting rules

Each exists because of a specific Frappe footgun. Breaking one fails *silently*.

### 8.1 Never `POST` to update a document

`POST /resource/<dt>/<name>` routes to `execute_doc_method`, which raises
`KeyError: 'run_method'`. Updates **must** be `PUT`
(`lib/docTransition.js:8-17`, `:218-222`).

The single exception is `useStockEntry.js:343-345`, which deliberately POSTs
`{run_method:"submit"}` — correct for that route.

### 8.2 A Workflow doctype never offers the plain Submit

`validate_workflow` only compares `workflow_state` before/after. A plain
`frappe.client.submit` passes validation and lands at `docstatus=1` **while still
in the workflow's first state** — the approval step is skipped with no error.
Use `apply_workflow` (`docTransition.js:19-25`).

Hence `resolveForwardActions` (`:168-198`) requires `workflowChecked && !hasWorkflow`
before showing Submit.

### 8.3 `workflow_state` exists only if a Workflow is configured

Requesting it otherwise fails the **entire query**. Every approval query is
meta-validated first via `approvalMeta.js` (`:6-9`), and `pickFields` drops it when
absent.

### 8.4 Probe failure ⇒ "no workflow", never the reverse

`getWorkflowActions` failure degrades to "no workflow"
(`docTransition.js:36-39`). A permission or network blip must never block a
submit.

### 8.5 Leave Application inverts the normal flow

HRMS `on_submit` refuses `status` of `Open`/`Cancelled`. Without a Workflow, only
the **exact named `leave_approver`** may set it, via `frappe.client.set_value` on
the **stored** document (`leaveApproval.js:5-13, 61-81`).

### 8.6 Unsaved changes hide every forward action

Submit, transitions and leave Approve/Reject all act on the *stored* document, so
all require `!dirty` (`docTransition.js:70-74`).

### 8.7 Fail closed, never open

`RoleContext` defaults + its error path grant only `public: true` modules;
`_can_read` catches `Exception` and returns `False`; route guards return `null`
while loading.

### 8.8 The server is the only security boundary

All client gating is visibility/UX. Frappe enforces write/submit/cancel/delete
and docstatus transitions. The Approvals doctype list and report keys live in
`api.py` **deliberately**, not in JavaScript.

### 8.9 `onChange` on a Link fires only on commit

`LinkField` commits on option pick / clear / blur-with-exact-match
(`LinkField/index.jsx:148-162`). Previously `onChange(txt)` ran per keystroke,
firing chained effects (fetch approvers, employee company…) on every character of
`HR-EMP-00002` and leaving partial text in the document.

Also `searchTerm.js`: **`MIN_SEARCH_CHARS = 2`**, and a term shorter than that
returns `""` — because Frappe answers an empty `txt` with the field's *default
option list*, which is what left the dropdown empty after backspacing.

### 8.10 Preserve document order and names you don't understand

- Workflow **state order is load-bearing** (`states[0]` is the entry state).
- Workflow **transition order is preserved** from the Workflow document
  (`docTransition.js:265-269`) — deliberately not re-sorted, because "reject
  before approve" would hardcode semantics that belong to the workflow.
- Transition dedupe key is `[state, action, next_state]`, not `action` alone — one
  action legitimately routes to two next states from two states.
- Duplicate `Workflow State` rows are **inert** (Frappe takes `state_row[0]`) and
  several are kept on purpose as documentation. Don't "clean them up".
- Unknown workflow **action names render verbatim**; only known verbs get an
  i18n key, so an admin-authored (possibly Arabic) action isn't mistranslated.

---

## 9. Known issues, gaps and dead code

Findings only — nothing here is fixed.

### 9.1 `allow_edit` docstring/code contradiction

`setup/workflows.py:48-52` asserts `allow_edit` is "intentionally omitted" because
GenericForm doesn't implement it, but rows `:63-67` all set it. `create_workflow_if_missing:563-566`
repeats the claim. Either the docstrings are stale or the rows are a regression.
**Resolve before relying on either.**

### 9.2 Workflow gaps

- **Leave Application `Rejected` is terminal** — no transition out. If rejection
  must be reversible, a `Rejected → Draft` (or `→ Pending Leave Approver`) row is
  needed.
- **Attendance Request `Rejected` is also terminal** — `doc_status: 0` with **no
  transition out**, so it's an editable draft with no exit button.
- **Expense Claim has no Cancel** transition and no `Cancelled` state.

### 9.3 Print format gap

`config/doctypes.js:28` points Employee at `printFormat: "Employee Appointment
Letter"`, but **no patch in this app creates that Print Format** and it is not
ERPNext core. `PrintPreview` will fall back to the default format or 404 unless
the record was created manually on the site.

### 9.4 Unreachable code

`ui_documents.py:385-446` — a full second copy of the upload body, after the
`return` at `:383`.

### 9.5 Undeclared app dependencies

`hooks.py:11` sets `required_apps = []`, but the SPA calls:

| Call | App | Fails safe? |
|---|---|---|
| `hrms...department_approver.get_approvers` (`namedApprovers.js:47-48`) | **hrms** | ✅ yes — returns `{approvers:[], error}` |
| `hrms...leave_application.get_leave_details` (`LeaveApplicationForm.jsx:290-312`) | **hrms** | ✅ yes — balance check skipped |
| `shopfloor.api.stock_entry.get_bulk_valuation` (`useStockEntry.js:78-84`) | **shopfloor** | ❌ **no** — `enrichValuation` indexes `valuationMap[i.code]` (`:93`) and throws if the app is absent |

### 9.6 Phantom endpoints

`services/api.jsx:289-339` exports 8 attendance-regularization wrappers calling
REST-style paths with **no Frappe counterpart anywhere**:

`attendance/regularize`, `attendance/records`, `employee/shifts`,
`attendance/validate-punch`, `attendance/preview-punches`,
`attendance/regularization-history`, `attendance/bulk-regularize`,
`attendance/regularization/{id}/undo`

There is no `url_map`/`url_routes` in `hooks.py` and no whitelisted handler. **All
8 are also unreferenced.**

### 9.7 Other dead code

- `utils/weeklyOff.js` (103 lines) — unreferenced; superseded by the
  server-computed `WO` status from `monthly_attendance`.
- `utils/attendanceRegularization.js` (215 lines) — unreferenced pure helpers
  whose companion APIs don't exist.
- `components/Approval/ActionButtons/index.jsx` — no handlers.
- ~~`components/StockEntry/components/HeaderBar.jsx`, `FooterBar.jsx`~~ —
  **deleted 2026-10-13.** Along with `SourceSelector.jsx` and
  `ToastContainer.jsx`, they were unreachable: no file imported any of them.
- ~~`components/dashboard/DashboardHero.jsx`~~ — **deleted 2026-10-14.** It
  rendered a dashboard's own subtitle inside a card directly beneath the top bar
  that already showed the same string from `setHeader`, so every dashboard opened
  with a full-width strip repeating the header and the tiles started below the
  fold. Store and ESS had already dropped it with that reasoning recorded in
  place; the remaining seven dashboards had not, which is why it looked
  deliberate. The nine subtitles it displayed are all still in use — by
  `setHeader`, which is the correct place for them.
- `pages/DemoList/index.jsx` — 4 hardcoded rows, zero API calls; a design-system
  fixture.
- `pages/StockEntry.jsx` (route `/demo-form`) — a field-widget gallery, not Stock
  Entry. The real one is `components/StockEntry/StockEntryPage.jsx`.

### 9.8 Route gaps

Audited 2026-10-13 across every `navigate()` target in `pages/Store/**`.

1. ~~`MaterialRequestForm` navigates to `/store/material-request/<type>/view/<name>`~~
   — **fixed**. It now goes to `/store/material-request/:name`.
2. ~~`DeliveryNoteList` row click and `DeliveryNoteForm` post-save both navigate
   to `/store/delivery/:name`~~ — **fixed.** The route was never registered, so
   both fell through to `/store/:doctype/:name` with `doctype="delivery"`, and
   `GenericForm` put that literal into the resource path. `DeliveryNoteForm`
   already read `useParams()`, so only the registration was missing.
3. ~~`QualityTemplateForm` navigates to `/quality-templates`~~ — **fixed**,
   it now goes to `/quality/templates`.
4. ~~`App.jsx` registered `/quality/templates/:name` twice~~ — **fixed**, the
   duplicate is gone and the suite now fails on any duplicate `path=`.
5. ~~A `path="store/..."` without a leading slash~~ — **already resolved**; no
   route in `App.jsx` lacks one.

Store's own routes are now all live, all reachable, and every `navigate()`,
tile-route and breadcrumb target under `pages/Store/**` resolves to a registered
route (audited 2026-10-13). Two rules came out of that audit:

- Check breadcrumb `path` values too, not just `navigate()`. A breadcrumb is a
  link that quietly 404s.
- A route that merely *pattern-matches* is not necessarily reachable: see item 2
  above. Also check the reverse direction — a registered route with no in-app
  entry point is unreachable UI and should not exist.

### 9.8a Two UI gaps found 2026-10-14

**The Stock Balance toolbar repeated the result count.** The card footer already
renders `Showing 1–20 of 47` through `Pagination`, so the toolbar pill was a
second, weaker copy. Removed — but only after confirming `Pagination:75-80`
still renders the range when `totalPages === 1` (`singlePageWithMeta`); with two
results there is one page, and had that path returned `null` the pill would have
been carrying the only copy of the number. That condition is now asserted by a
direct render of `Pagination`.

**The attendance day popup had no check-in log.** `handleDayClick` sends ONLY a
plain `Present` day to the `CheckinLogs` modal; `Half Day`, `Late`, `Absent`,
`On Leave` and `Missing` all open the *detail* modal, which rendered
`in_time` / `out_time` / `shift` but never the punch log. A half day has real
punches with no route to them from the calendar. It reads as mobile-only because
the calendar cell hides those times below `sm` (`hidden sm:flex`, DayCell:740) —
on desktop the times were already on screen, so only the tap was missing the log.
`CheckinLogs` is now rendered in the detail modal, gated on `att` so leave and
missing days do not fire a request just to render an empty list.

### 9.8b `Employee Checkin` schema was guessed, and guessing is unsafe here

The ESS calendar's check-in popup called `resource/Employee Checkin` directly
with a guessed field list. **Every field was wrong**: `checkin_time`,
`checkout_time`, `status` and `log_date` do not exist. Frappe rejects the first
unknown field with `DataError: Field not permitted in query: checkin_time`, and
since `validate_fields` raises on the *first* bad field, the message named
whichever happened to be listed first -- so it read like a permissions fault, not
a schema one.

The real columns (HRMS version-15): `time` (the punch moment), `log_type`
(`IN`/`OUT`), `device_id`, `shift`, `attendance`. One punch is one row; there is
never a checkout column to pair against.

**Correcting the names in the client would not have been enough**, and this is
the part worth remembering:

```python
# frappe/desk/reportview.py, validate_fields
if df.fieldname in [...meta.get_high_permlevel_fields()]:
    if df.get("permlevel") not in meta.get_permlevel_access(...):
        data.fields.remove(field)      # silently dropped -- NOT raised
```

`time` is `permlevel: 1`. A field that does not exist raises; a high-permlevel
field you may not read is **removed from the result without any error**. So a
wrong guess renders an empty table with nothing in the console. The column
choice has to be server-side and resolved from the live meta, which is what
`get_checkin_logs` does — it reads `meta.has_field` and builds the SQL from the
resolved column.

Also note `log_date`/`checkin_time` genuinely exist on older HRMS, so the
endpoint supports both rather than hardcoding either.

### 9.8c `?employee=null` is a truthy string, and it crashes the endpoint

Shipping the authorised-employee endpoint immediately produced
`DoesNotExistError: Employee null not found` on the ESS calendar, which passes
no employee at all.

Cause: `new URLSearchParams({employee: null}).toString()` is `employee=null` —
the literal four characters. Frappe copies query params into `frappe.form_dict`
as strings, so the endpoint received `"null"`, which is truthy, so
`employee = employee or my_employee` kept it and the next line tried to read a
document named `null`.

Fixed in both places on purpose:

- `get()` in `services/api.jsx` drops `null`/`undefined` before serialising, so
  no optional parameter anywhere in the app can reintroduce it. `""` is
  deliberately preserved — it is a real "no filter" for filter fields.
- `get_checkin_logs` normalises `""`/`"null"`/`"undefined"`/`"None"` for both
  `employee` and `date`. The server half is not redundant: a browser holding a
  bundle from before the client fix keeps sending `employee=null` until it is
  redeployed, and an endpoint that 500s on a plausible caller input is not one
  to trust with anything.

The general lesson: **every query parameter is a string by the time Python sees
it.** A JS `null` is not absent, it is four characters.

### 9.8d Adding the log to a popup that already summarised it duplicated the punches

`Attendance.in_time` / `out_time` ARE the first and last check-in of the day —
HRMS derives them from the check-ins. So adding the punch log to the ESS day
popup (so a Half Day could show its middle punches at all) left the old summary
repeating the log's first IN and last OUT.

Invisible on a Present day, which is one punch in and one out — the summary and
the log show the same two rows and read as "summary, then detail". Obvious on a
**Half Day**, which has four punches: the summary shows 09:00 and 18:00, then
the log lists 09:00, 13:00, 14:00, 18:00. Two of those are duplicates, so the
popup reads as the same in/out twice.

The summary is now suppressed once the log reports rows, and kept when the log
is empty or errored — an `Attendance` row can carry in/out with no check-in rows
behind it (manually entered), and that case must not lose its times. The flag is
tri-state (`null` = loading) so the summary cannot flash for a frame and then
disappear.

Worth recording separately: wiring that required a `onResult` callback from
`CheckinLogs` to its parent, and listing that callback in the effect deps is a
**continuous refetch loop** — an inline arrow has a new identity every render,
so effect → onResult → parent render → new arrow → effect. It is a notification
sink, not a fetch input, and must stay out of the dependency array.

### 9.8e A dialog stacked on a dialog in the Purchase Receipt

Picking a PO line opened `ReceiptLineDialog` **on top of** `ReceiptItemPicker`.
Two overlays to dismiss to return to the receipt, and on a phone the picker list
stayed fully rendered behind the form — so it was not obvious which surface was
being edited, or whether closing the top one would return to the list or to the
receipt.

Replaced with `ReceiptItemWorkbench`: **one modal**, two `<section>`s inside it.
Split into two columns at `md` and up; **one pane at a time below `md`**, with a
Back control, because side-by-side on a phone gives both panes a short scroll
area and pushes the form's primary action under the fold.

It is a dialog rather than an inline panel on purpose. Inline, it grew the
document instead of the surface, so the user scrolled the receipt page to work a
line and lost sight of what they were building — the same problem one level up.
`AppModal` already caps its body at `max-h-[95vh]` with `overflow-y-auto`, so the
two sections get their own scroll and the page stays put.

The invariant worth writing down is **exactly one** dialog: not two (the
original stacking) and not zero (the inline version). What actually enforces it
is **open state, not purpose**: the line dialog is
`show={!!editingRow && !pickerOpen}` and is **not** gated on `fromPo`.

Gating it on the purpose instead — `{fromPo ? null : <LineDialog/>}` — looks
correct and ships a dead Edit button. On a PO receipt the tray's Edit button
sets `editing`, and the only surface reading `editing` for that purpose is the
workbench, which is closed at that moment, so it renders `null`. The user clicks
Edit and nothing happens. Both surfaces stay in the tree; only one may be open.

Two things worth keeping:

- The pane switch is **CSS**, not `useIsMobile`. A JS breakpoint holds a stale
  render across a resize that the stylesheet has already honoured.
- The pane reset happens in a `close()` wrapper rather than in an effect keyed on
  `show`. The parent keeps `editing` set across a close, and a render-driven
  `setState` in an effect cascades.

`ReceiptLineForm` now holds the fields, shared by the workbench and the tray's
Edit dialog — otherwise the measured-total and derived-factor logic would exist
twice and drift. The tray Edit dialog survives because that row is already on the
receipt and has no picker behind it, so it never stacks.

### 9.8f Production indents: the project belongs on the header

`/store/material-request/purpose/production/new` carried the Project field on
**every item row**. Picking it per row meant re-reading the same bill of
materials once per line to transcribe a list the server already knows.

The worse consequence is disagreement: two rows could name two different
projects on one indent, so a single Material Request would request material for
both. `validate_with_previous_doc` cannot catch that — it compares each row
against the *source document*, never rows against each other.

The project is now chosen once in the header and the items arrive from its BOM:

- **Additive.** Rows that already carry an item are left alone and BOM lines
  already on the indent are skipped, so re-picking the project cannot discard
  work or duplicate a line. One spare empty row is kept at the end.
- **Outstanding, not required.** Quantities prefill with the gap
  (`outstanding_qty`, falling back to `required_qty`). Prefilling the full BOM
  quantity is how duplicate indents happen.
- **Clearing is non-destructive.** The project is dropped from every row but the
  items stay; they are real items either way.
- **A visible note says what happened** (`filledFromBom` / `allPresent` /
  `noBom`), because rows appearing from nowhere otherwise reads as either a
  failed BOM read or an empty project.

Two ERPNext details this had to respect:

- `project` lives on the **item row**, never the header, so the form-level value
  is copied onto each row and stripped back out before the save. Material Request
  has no header project column, and posting one would send a key with no column
  behind it.
- On edit the header project is recovered from the first row carrying one.
  Without that an existing indent opens with an empty box, and clearing it would
  silently blank every row.

The other four purposes keep the per-row field: those requests genuinely mix
project-specific and free items, which is the split the shop floor works in.

### 9.8g `dashboard.quickAccess` was never rendered at all

"Quick access to all modules" existed as `dashboard.quickAccess` in all three
locales and was referenced by **no component** — not even the hero, which used
`dashboard.subtitle` (the same English text). So removing the hero did not make
it dead; it already was. Removed from `en`/`hi`/`ar`, and since it was the last
key in its object the preceding line lost its trailing comma too.

### 9.8h Serialised + weighed: the serial count is a STOCK quantity

For a serialised item, `erpnext/stock/serial_batch_bundle.py` creates one
`Serial and Batch Entry` per serial — `qty` defaults to `1` — and then asserts
the bundle total equals the Stock Ledger Entry's `actual_qty`:

```python
"qty": self.sle.actual_qty,
...
if flt(sn_doc.total_qty, precision) != flt(self.sle.actual_qty, precision):
    "Total qty ... is not equal to Actual Qty ..."
```

`sle.actual_qty` is in **stock UOM**. `get_valid_serial_nos` in
`erpnext/stock/utils.py` throws when the serial count does not match the qty it
is handed.

So a Kg-stocked, serialised item takes **one serial per Kg**. 10 Nos weighing
12.5 Kg would require 12.5 serials — impossible, and the save fails with a
message that never mentions serials. "One serial per piece" is not expressible.

That makes a **whole `stock_qty`** mandatory for a serialised line *even when the
UOM itself permits fractions*. `must_be_whole_number` is a property of the UOM
and cannot express it, so `validateSerials` carries a separate whole-number gate
and reports it before the count gate — asking for "13 serials" against a
quantity that cannot exist would send the user hunting.

Per-serial weight and price are derived, not stored: no weight field exists on
`Serial No`, `Serial and Batch Bundle` or `Serial and Batch Entry`, and
`incoming_rate` / `Serial No.purchase_rate` are `read_only` / `no_copy`. The form
shows them read-only — one stock unit and the row rate.

Auto-generation works when the Item has a `serial_no_series`
(`serial_batch_bundle.py:187` checks `has_serial_no and not serial_no_series`),
and the same pattern covers batches via `create_new_batch` +
`batch_number_series`. `get_item_uom_options` now returns all five flags; the
suite asserts the endpoint contract, because the JS rules are inert without them.

### 9.8i The conversion was real but invisible

Asked for a UOM selector on the Purchase Receipt, the right answer turned out to
be that the calculation already existed and was simply not shown.

A production receipt against `PUR-ORD-2026-00386` is written in **Nos** on a
**Kg**-stocked item. `purchase_receipt.py:315` puts `uom` in `compare_fields`, so
the received UOM is correctly locked — it must equal the PO line's. But
`conversion_factor` is **not** compared, so the factor is free and already
derived from the measured total. The gap was presentation: the factor sat in a
derived panel two fields down and read as a number rather than as the
relationship the user had just entered.

`conversionPreview()` now renders `1 Nos = 2.54 Kg` above the quantity field,
plus `10 Nos = 25.4 Kg` once both figures are in. It is unit-agnostic — the target
comes from `info.stock_uom`, asserted against both Kg and Ltr.

**A UOM selector would have been worse than nothing**: it would have offered a
choice that ERPNext rejects at save with *"Incorrect value in row N: UOM must be
equal to 'Kg'"*. The lock hint now explains that, and that the fix is to raise
the PO in the unit you want to count in.

Two real traps found while building it:

- `Number.isFinite(Number(x))` does **not** detect a missing value — `Number(null)`
  is `0`, which is finite. The first version of the helper used it and rendered
  **"1 Nos = 0 Kg"** on every unweighed line. Caught by an assertion; the guard is
  now `x == null` before any numeric coercion.
- The stock unit must come from `info.stock_uom`. Hardcoding `Kg` works on the
  one item we can see and silently misreports every litre-stocked item.

### 9.8j The purchase order's conversion factor was thrown away

Live `PUR-ORD-2026-00386`: `10 Nos → 10000 Kg`, `conversion_factor 1000`.
`make_purchase_receipt` returned all of it. `pickLine` kept `stock_qty` and
hardcoded `conversion_factor: 1`, so the row contradicted itself, and because
`buying_controller.py:517` recomputes `stock_qty = qty * conversion_factor`, an
unweighed delivery booked **10 Kg instead of 10,000 Kg — silently**.

The escape was to make `measured_total` mandatory, which blocked any delivery
without a weighbridge. That was trading one silent bug for a hard stop.

The fix inverts it: the PO factor is a valid default (`conversion_factor` is
never in `compare_fields`), and a weight becomes an override. `stock_qty` is
derived from the factor on every edit rather than copied, and `conversionBasis`
tells the user which number they are looking at.

Three traps recorded:

- **`conversion_source`, not a magnitude test.** `1 Nos = 1 Kg` is legitimate
  for a light item, so "is the factor 1?" cannot mean "is it missing?".
- **`applyQuantity` is a separate path.** `applyMeasuredTotal` needs a total, so
  a bare quantity edit through it left `stock_qty` at the old value: 10 → 12 Nos
  still posted 10,000 Kg.
- **A PO factor of 0 must be rejected.** `TEST-KG-NOS` carries `0.0` on its Nos
  row because the real factor is a measurement; a truthiness test would accept
  it and derive a factor of 0.

Also settled on this data: serials for a weighed item are unusable. `stock_uom =
Kg` plus `has_serial_no = 1` means one serial per kilogram — 10,000 for that PO
line. The decision is to set `has_serial_no = 0` on weighed bulk items, which is
config only: `get_item_uom_options` already reports the flag and `needsSerials()`
keys off it, so the serial UI disappears with no code change.

### 9.8k Receiving part of an order, and deliveries that do not match their rate

Asked what happens when one sheet of ten is received, and when that sheet weighs
something other than the ordered rate.

**Partial receipt is legal and common.** `purchase_receipt.py` `status_updater`
writes `Purchase Order Item.received_qty` from `Purchase Receipt Item.received_qty`
with `target_ref_field: "qty"`; `overflow_type: "receipt"` governs only
OVER-receipt. Receiving 1 of 10 books 1000 Kg at the ordered rate and leaves 9
outstanding. But the row opens holding the full outstanding quantity, which reads
as mandatory — so the quantity field now states what is outstanding and says
that reducing it keeps the rest open.

**A per-line factor handles a differing sheet weight fine.** One sheet at 1200 Kg
sets the factor to 1200 for that line alone. Sheets of different weights on one
line collapse to an average, and that is not a correctness loss: `qty * factor`
reproduces the weight the user typed regardless. What it loses is per-piece
identity, which only matters when serials are on — and weighed bulk items have
them off.

**What a single factor cannot catch is a slip**: the whole delivery's weight
typed onto one sheet's line. That books silently and *correctly* for the wrong
quantity, which is the worst kind of wrong. `conversionDriftSuspicious` warns at
≥2× or ≤0.5× the ordered rate.

The boundary caught me: with `>` instead of `>=`, a clean doubling — the single
most likely slip — sat exactly on the threshold and warned about nothing.

### 9.9 Logic bugs

1. **`Quality/entry/InspectionForm` "Submit" calls `handleSave`** — it is a second
   Save (`:224-229`). The `!doc.docstatus` guard is meaningless because `doc` is
   initialised as `{template, item_code}` and `loadDoc` never sets `docstatus`.
2. **`Quality/entry` filter offers `PASS`/`FAIL`** but `Quality Inspection.status`
   stores `Accepted`/`Rejected`/`Pending` — filtering by those values returns
   nothing. The badge below reads them correctly.
3. **`ExpenseClaimList.getStatus` compares `status` to `Approved`/`Rejected`**,
   which live on `approval_status`, not `status` — so approved claims render as
   "Draft". The *form* correctly uses `approval_status`.
4. **`AttendanceRequestList` labels `docstatus = 2` as "Rejected"** — 2 is
   **Cancelled**.
5. **`StockBalance` offers a `company` filter that is not in `fields`** (`:47-68`
   vs `:125-130`) — narrows but never renders.
6. ~~**`useStockEntry.handleScan` fabricates an item**~~ — **fixed
   2026-10-13.** `handleScan`, `addItem` and the mock-fetch branch are gone. The
   replacement is `addItemByCode`, which resolves a real code through
   `search_link` and `get_item_details`; nothing invents an item any more.
7. ~~**SourceModal's `qcDone` checkbox is never read**~~ — **fixed
   2026-10-13.** `SourceModal.jsx` is deleted outright. `GetItemsModal` offers
   only sources that are real for the selected purpose and maps documents through
   ERPNext, so there is no unreachable QC branch left to expose.

### 9.10 QC calculation caveat

`updateReading`'s tolerance check is **centred-deviation, not a min/max range
check**: `target` is the midpoint, so a reading at either spec limit yields 0%
deviation and **passes**. `tolerance` is **hardcoded to 5** in both the load path
and the template-change path. A `target` of 0 yields `Infinity`/`NaN`.

### 9.11 Repeated code (consolidation candidates)

| Pattern | Copies |
|---|---|
| `getStatus(row)` tone mapping | 8 (leave, attendance, expense, DN, MR, WO, JC, QC) |
| `resource/… + get_count` list loader | 12 |
| `docRef` + effect sync | 9 |
| "Save/transitions/Submit/Back/Cancel/Delete" header array | 3 near-identical + 1 divergent |
| Weekly-off/holiday day-set extraction | 2 |

### 9.12 Store: invalid Material Request types (fixed 2026-10-13, pages pending)

**The Store MR hub could never have worked for two of its five tiles.**
`Store/material-request/index.jsx:17-48` mapped tiles to:

| Tile | Value sent | Verdict |
|---|---|---|
| Purchase Request | `"Purchase"` | ✅ valid |
| Material Transfer | `"Transfer"` | ❌ **HTTP 417** — option is `Material Transfer` |
| Material Issue | `"Material Issue"` | ✅ valid |
| Material Receipt | `"Material Receipt"` | ❌ **HTTP 417** — not an MR type at all; it is a *Stock Entry purpose* |
| Customer Provided | `"Customer Provided"` | ✅ valid |

ERPNext's own `validate_material_request_type` (`material_request.py:236-240`)
checks nothing; the rejection comes from Frappe's `_validate_selects`
(`base_document.py:892-920`) as a generic 417 with no field name. A user would
have seen an opaque error with no idea which field was wrong.

**Status: FIXED 2026-10-13.** The Material Request pages were rewritten
(purpose-keyed routes, no type dropdown at all). The type now comes only from
`config/storePurposes.js`, reached via the `:purpose` route segment, and is
guarded by 26 smoke assertions. The `/store/material-request/type/:type/*` routes
are gone, so a stale link carrying an invalid value can no longer reach the form.

The removal is deliberate rather than a validation: there is **no Purpose
dropdown** any more. A purpose is chosen by the card you clicked on the way in,
so there is no control that could produce an invalid value in the first place.

### 9.13 Data prerequisite: BOMs are not tagged with a Project

Project-scoped indents resolve items via `BOM.project`. On the dev database
inspected 2026-10-13 (`devoltrans/db_backup-dev.sql`): **1 BOM, 0 tagged**, 1
Work Order with no project, 9 Material Requests **all of type `Purchase`** and
none carrying a `project` on any of their 23 items. Both Stock Entries are
unlinked (`material_request` / `material_request_item` empty).

### 9.14 i18n: a tile title that rendered an i18next error (fixed 2026-10-13)

`store.tiles.*` are nested `{title, description}` **objects**. The Store hub
passed `titleKey: "store.tiles.stockEntry"` without `.title`, so i18next returned
the object and React rendered its warning **as the tile's title**:

```
key 'store.tiles.stockEntry (en)' returned an object instead of string.
```

Six tiles were affected (Stock Entry, Stock Balance, Item Master, Warehouse,
Bill of Materials, Delivery / Dispatch). Their *descriptions* rendered fine,
because those keys did carry `.description` — which is exactly why it survived
review and why the Store dashboard looked half-translated.

**Why every static check missed it:** the key exists in the dictionary. A
key-presence audit, a three-language parity check, and a search for unresolved
keys all pass. Only *resolving the key and rendering it* reveals that the
resolved value is an object rather than a string.

That is what `.smoke-tmp/storecheck.jsx` now does: it renders the Store
dashboard, the all-requests list and the Give Items queue, strips the markup, and
fails on either a dotted-key token or i18next's `returned an object instead of
string` text.

The same trap exists anywhere a label is indirected through a config object —
`ActionTile`'s `titleKey`/`descriptionKey` are the only such indirection today.

---

## 10. Verification

Three framework-free suites, all runnable from `erpnext_ui/frontend/`:

```bash
# business-logic assertions over lib/ and config/
SSR_ENTRY=.smoke-tmp/rules.jsx SSR_OUT=.smoke-tmp/out-rules \
  npx vite build --config .smoke-tmp/vite.config.mjs && node .smoke-tmp/out-rules/entry.mjs

# SSR render of the request forms + GenericForm + DocStatusField
npx vite build --config .smoke-tmp/vite.config.mjs && node .smoke-tmp/out/entry.mjs

# SSR render of Store + Employee Self Service surfaces AND the Purchase Receipt
# picker/dialog (needs SSR_MODAL_STUB=1 -- see AGENTS.md; Radix portals
# AppModal so its content is "" under renderToString), asserting no
# translation key leaks
SSR_ENTRY=.smoke-tmp/storecheck.jsx SSR_OUT=.smoke-tmp/out-store \
  npx vite build --config .smoke-tmp/vite.config.mjs && node .smoke-tmp/out-store/entry.mjs
```

Plus `npm run lint`, `npm run build`, and `ruff check erpnext_ui/api.py`.

Running them dirties the committed `.smoke-tmp/out*/entry.mjs` artifacts —
`git checkout -- erpnext_ui/frontend/.smoke-tmp/` afterwards.

### 10.1 Last run — 2026-10-13, after the Stock Entry rework

| Check | Result |
|---|---|
| rules suite | **234 passed, 0 failed** |
| request-form render | **all forms render** |
| store + ESS + receipt dialogs + balance + return | **108 passed, 0 failed** |
| `npx eslint src` | **clean, 0 problems** |
| `npm run build` | **✓ built** |
| `ruff check erpnext_ui/api.py` | 1 error — `F841` at `:416`, **pre-existing** (reproduced against `HEAD`) |
| route audit | 1 dead link — `/quality-templates`, **pre-existing** (§9.8 item 3); **0 orphan `/store` routes** |

Two groups of assertions in that suite are new. It renders `StockEntryPage` and
checks the posting date and time inputs actually carry **today** and **now** —
both used to render blank, which is not cosmetic (§11.3). It also renders the
merged ESS dashboard and asserts all nine tile names appear, because the leak
regex previously did not cover the `ess` or `requests` namespaces at all.

## 11. Stock Entry rework (2026-10-13)

### 11.1 The three things that were actually broken

1. **`posting_date` / `posting_time` started empty.** The form is for recording a
   movement that is happening now, and the storekeeper had to remember to set
   both. Now seeded from `utils/localDateTime.js`, which formats in **local**
   time. The old code would have been wrong even once seeded: `toISOString()`
   returns UTC, so a store in any positive-offset timezone would silently post
   yesterday's movements for eight hours a day.
2. **"Get Items" opened a raw ERPNext-doctype dropdown** (`Material Request`,
   `Work Order`, `Item`, …). It asked the user to know ERPNext's internal model —
   the exact thing the Store hub exists to hide.
3. **Submit was never gated.** `canSubmit` existed on the hook and nothing read
   it, so Submit opened a confirmation dialog on an empty entry.

### 11.2 `GetItemsModal` — sources per purpose

`SOURCES` maps each purpose key to the sources that can actually feed it, and
nothing else is offered:

| Purpose | Sources |
|---|---|
| `issue`, `transfer` | pending indent, own item |
| `receipt` | own item |
| `transferForManufacture`, `consumption` | work order, own item |
| `manufacture`, `repack`, `disassemble`, `subcontractor` | own item |

Documents are opened through ERPNext's own mappers, never hand-rolled:
`material_request.make_stock_entry` and
`erpnext.manufacturing...work_order.make_stock_entry`. That is invariant **§17**
— the mappers set the linkage fields, and rebuild that mapping by hand is how
linkage gets forgotten, which silently stops the source document's progress from
updating.

Note the modal is keyed on `show` + selected type, so it remounts per purpose.
That is deliberate: a `useEffect` reset would `setState` synchronously and
cascade a render, which this repo's `react-hooks/set-state-in-effect` rule
correctly forbids. Remounting gets the same fresh state with no extra render.

### 11.3 Why the defaults are asserted, not just implemented

`posting_date` in the future throws `ERPNextValidationError` on save. An empty
date is therefore not a cosmetic gap — it defers a guaranteed server error to
the one moment the user is trying to complete real work. Hence the two new
assertions in `storecheck.jsx`.

### 11.4 Still open on this screen

- `StockEntryTypeSelector` still lists raw ERPNext types. Grouping the nine into
  the `STOCK_ENTRY_PURPOSES` buckets from `config/storePurposes.js` is the
  remaining piece of this work.
- `useStockEntry.js` still imports `STOCK_ENTRY_PURPOSES`; confirm the mapping is
  used where the raw type is validated.

## 12. Requests + ESS merge (2026-10-13)

### 12.1 What was wrong

Employee-facing HR work was split across **two** hubs for the **same** people:

| | Dashboard tile | Sidebar group | Module key | Routes |
|---|---|---|---|---|
| Requests | `{key:"requests", route:"/requests", moduleKey:"ESS"}` | "Requests" | `ESS` | `/requests/{leave,attendance,expense}` |
| Employee Self Service | `{key:"ess", route:"/ess", moduleKey:"ESS"}` | "Employee Self Service" | `ESS` | `/ess/*` |

Both entries carried the **same `moduleKey: "ESS"`**, so access control could not
tell them apart — hiding one never hid the other, and both rendered for exactly
the same users. Worse, the ESS dashboard already linked to `/requests/leave`,
`/requests/expense` and `/requests/attendance`, so a user who picked "Employee
Self Service → My Leave" landed on a page whose breadcrumb said **Requests**.
Three of the nine ESS tiles pointed across the boundary.

The i18n namespaces were already coupled: `ess.json` owned **both** the `ess`
and `requests` namespaces, so the "two modules" were one file all along.

### 12.2 What changed

- `pages/requests/**` moved to `pages/ESS/requests/**` via `git mv`; the old
  `pages/requests/index.jsx` hub is deleted.
- One canonical path space under `/ess`, singular and hyphenated:
  `/ess/leave`, `/ess/attendance-request`, `/ess/expense-claim`. Note
  `attendance-request` is not `attendance` — `/ess/attendance` is the
  read-only calendar.
- `/requests/*` survives as ten `<Navigate replace>` redirects. Redirect rather
  than a duplicate route on purpose: HashRouter makes every URL typeable
  (§6), these paths are already in shared links, and one canonical path means a
  stale link cannot render a page whose own breadcrumbs disagree.
- `/ess/Salary Slip` and `/ess/ToDo` became `/ess/salary-slip` and
  `/ess/todo`. The first had a **literal space** in the URL. `GenericList`
  resolves its doctype from `useParams()`, so a slug would have queried a
  doctype named `salary-slip`; `doctypeOverride` supplies the real name.
- Dashboard lost its duplicate tile; the sidebar's two groups became one.
- Tile copy is named for the **task**, not the doctype: "Apply for Leave", not
  "Leave Application". This also fixed a typo — `attendanceRequests.title` read
  **"Attendance Required"**.

### 12.3 Why the sidebar merge needed the dashboard merge

They are the same list. Leaving the sidebar with two groups and the dashboard
with one tile would have made the sidebar strictly worse than the grid it links
to, and would have re-created the split the moment someone added a module.

### 12.4 Invariants touched

- **§6 (HashRouter).** Every moved path keeps working via redirect. Nothing new
  is gated only by hiding a nav item — the redirects carry no permission logic
  of their own, they land on routes that already had exactly the access the old
  ones had.
- **§16 (`titleKey` must resolve to a string).** `ess.tiles.*` are
  `{title, description}` objects, so the merged dashboard's `titleKey` needs
  `.title`. `storecheck.jsx` now asserts all nine names render, and its leak
  regex covers the `ess` and `requests` namespaces, which it previously did not.

## 13. Purchase Receipt: picker + measured weight (2026-10-13)

### 13.1 What was wrong

A PO with 28 lines rendered as a full-height stack of cards. Receiving three
items meant reading all of them, and every row looked equally actionable
whether or not it had already been received. Separately, the conversion factor
came from ERPNext's `get_conversion_factor`, i.e. **item master** — correct for
a fixed UOM relationship, wrong for a weighed delivery, where the factor is a
measurement that changes every time.

### 13.2 The mechanic

Outstanding lines live in an `available` catalogue; only picked lines reach
`doc.items`. The catalogue is whatever `make_purchase_receipt` returns — its map
condition (`purchase_order.py:782-786`) already excludes fully-received and
`delivered_by_supplier` lines, so "outstanding" is ERPNext's answer and nothing
here re-derives a quantity.

The dialog asks for **numbers only**, never ERPNext mechanics:

```
received_uom == stock_uom  ->  ask quantity                    -> factor = 1
received_uom != stock_uom  ->  ask qty in received_uom
                                ask total in stock_uom         -> factor = total / qty
                                (required, not optional)
```

### 13.3 The four rules that make a factor other than 1 legal

| Rule | Source |
|---|---|
| `uom` compared to the PO line -> received UOM pinned on PO rows | `purchase_receipt.py:315` |
| `conversion_factor` not in `compare_fields` -> never compared | `transaction_base.py:125-127` |
| `uom == stock_uom` -> factor force-reset to 1.0 | `stock_controller.py:110-116` |
| client-supplied non-zero factor respected; excluded from rounding | `buying_controller.py:362`, `:361` |

Plus a fifth that gates the field: `validate_uom_is_integer("stock_uom",
"stock_qty")` (`purchase_receipt.py:278`) — the **stock** qty against the
**stock** UOM's whole-number flag. The previous code checked the transaction qty
against the transaction UOM, which is a different pair and is not what the
server enforces.

A sixth, found in the live settings: with `Buying Settings.maintain_same_rate`
on and action `Stop` (QA has both, and no override role), a rate differing from
the PO by >=0.01 **throws** (`transaction_base.py:165-172`). The old editable
rate field was therefore a guaranteed save failure. It now follows the setting
at runtime and fails closed to read-only.

### 13.4 Two bugs the new tests caught

- `computeFactor(10, "")` returned **0**, not `null` — `Number("")` is 0 and
  passes an `isFinite` check, which would have booked `stock_qty` 0 and looked
  like a successful save. The guard is now on the raw value.
- The PO banner claimed rate was locked, which stopped being true once rate
  became conditional. Found by dumping the rendered text, not by the suites.

### 13.5 `_rid`

`uomInfo` is keyed by a stable per-row `_rid`, not by row index. The tray can be
reordered and the picker appends/removes, so an index-keyed cache attaches one
item's unit data to another the moment anything moves — surfacing as a wrong
whole-number error or a stale total on whichever row lands on that index.

### 13.6 Two bugs live verification found (static checks had missed both)

Neither was reachable from the unit suites; both appeared only once the backend
was actually deployed and called.

**1. `frappe.db.sql` does not take named parameters.** In
`_requested_qty_by_project_item` the query used psycopg2-style placeholders:

```python
where project = %s and parent in %(parents)s
{"project": project, "parents": tuple(parent_names)}
```

`frappe.db.sql` passes values straight to pymysql, which has no named-parameter
support, so the **dict was str()-ed into the statement**:

> `You have an error in your SQL syntax ... near ''project': "'W-0268'", 'parents': "(...)'"`

`get_project_items` was 100% broken. The fix is positional — which is also
ERPNext's own convention for an IN list (`general_ledger.py:745-750`):

```python
where project = %s and parent in %s
(project, tuple(parent_names))
```

Worth remembering: **Frappe is not Django.** `%(name)s` is a psycopg habit that
silently type-checks fine in Python and only explodes at the database.

**2. A measured total could book the wrong stock on a whole-number item.**
`needsMeasuredTotal` originally asked only "does the received UOM differ from
the stock UOM?". On the live `W-0268-01-001` (stock_uom `Nos`, also `Kg`) that
meant picking `Kg` offered a **"Total received (Nos)"** field, and entering
10 Kg against a total of 25 gives factor 2.5 -- so ERPNext books **25 Nos of
stock from a 10 Kg delivery**. It saves cleanly; the quantity is silently wrong.

A weight cannot be stock when the stock UOM counts whole pieces, so there is no
coherent meaning for the field there. `needsMeasuredTotal` now additionally
requires the **stock UOM** not to be `must_be_whole_number`. Note this is the
mirror of the user's own rule ("show weight only where stock is weighed").

`validateLineRow` still checks `stock_qty` against the stock UOM's flag
*independently* of whether the field was rendered -- that rule is what ERPNext
enforces, so it must not depend on a UI decision to be checked at all.

### 13.7 Live data as of 2026-10-13

- 631 items. `stock_uom`: Nos 480, Kg 89, Set 38, Roll 13, Meter 1.
- `must_be_whole_number=1`: Box, Nos, Pair, Set, Unit. `Kg` is not.
- **No Kg-stocked item has a second UOM**, and the only multi-UOM items are the
  `W-0268-*` Nos-stocked ones. So there is currently **no item on the site the
  weighed path can be exercised against** -- it needs an item stocked in `Kg`
  that also carries a counting UOM, plus a PO raised in that counting UOM.
- `W-0268-01-001` has `Kg` at conversion factor **1.0** ("1 Kg = 1 Nos"),
  which is placeholder data.

### 13.8 Verified against live QA (2026-10-13, after deploy)

- All four endpoints answer. `get_project_items` returns the project BOM with
  28 items (so the earlier "no BOM is tagged to a project" note is stale -- a
  `BOM-FG-W0268-PT-001` now carries `project = W-0268`).
- `make_purchase_receipt` on `PUR-ORD-2026-00010` returns exactly the 28
  outstanding lines, every one carrying a distinct `purchase_order_item` and no
  duplicates -- which is what the picker keys on.
- Ran the **real client module** over all 28 live lines: 0 would offer a
  measured total, 0 would fail client validation, and `needsMeasuredTotal(info,
  "Kg")` is false for `W-0268-01-001` -- the Nos trap from §13.6 is closed.
- Rendered the real picker and dialog against that data. The weighed row shows
  `Total received (Kg)` / `= 2.54 Kg each` / `Stock quantity (Kg) 25.4 Kg`
  and no conversion-factor input.
- A copy bug surfaced only from rendered text: the whole-number note sat under
  "Rejected Qty" and read as though it belonged to that field. It now renders
  as the quantity field's own hint.

### 13.9 Still open

- The four endpoints added this session (`get_item_uom_options`,
  `get_indent_queue`, `get_project_items`, `get_indent_list`) were **not on QA**
  as of this writing. `get_item_uom_options` failing is why the UOM field
  appeared missing rather than erroring; the other three mean the Give Items
  queue, the All-requests list and project item lookup are silently broken
  there too.
- `StockEntryTypeSelector` still lists raw ERPNext types.
- No batch/serial UI: with `batch_number_series` on the item ERPNext names every
  batch itself, so there is genuinely nothing to ask. Note this ERPNext version
  spells it `batch_number_series` + `create_new_batch` + `has_batch_no` — not
  `batch_no_series`.

## 14. Stock Balance with traceability (2026-10-13)

### 14.1 What was wrong

The page queried `Bin` for four fields and rendered item code, warehouse, a
quantity badge and a value. `Bin` is a current snapshot per item+warehouse, so
it can answer "how much" and nothing else -- not where stock came from, what it
cost, or what has happened to it.

The live demonstration is item `CORE`: 3 Kg, all from **PR-26-00008**, at
**2 Kg @ 1000 and 1 Kg @ 1200**. The old view rendered that as
"3 Kg @ 1066.67" and hid the only interesting fact about the stock -- that it
is two lots bought at two prices.

### 14.2 The shape

    opening -> in -> out -> closing, with value, reserved and free stock

and, per row, the Stock Ledger that produced it.

**The opening is solved for, not scanned.** The closing position is read
directly -- from `Bin` when the period ends today, which needs no scan at all --
and then `opening = closing - in + out`. Computing it independently would mean
reading every ledger row ever written before the window.

### 14.3 Two limits built in rather than hidden

**Value is only exact for today.** `Bin.valuation_rate` is today's moving
average. For a period ending in the past the quantity columns are exact but the
value would describe a different moment, so `isValuationAccurate` blanks those
cells and the page says "value as of today". A confident wrong number is worse
than a blank.

**The opening scan is unbounded in principle.** ERPNext's own report has the
same shape (`stock_balance.py:449-452`). Mitigated by a current-month default,
a row cap, and a warning when no item/warehouse filter is set -- not eliminated.

### 14.4 Presentational split, and why it was forced

`renderToString` is synchronous, so a component that fetches on mount always
renders its loading state under SSR and its content can never be asserted. The
first store-suite run failed 10 assertions for exactly this reason. So
`BalanceTable` and `TrailTable` are exported separately from their fetching
wrappers. That is not test-driven contortion -- it is also the reason "both
rates appear, not one blend" can be asserted at all.

### 14.5 Two bugs caught before deployment

Neither was reachable from the unit suites, and both would have thrown on the
first live call.

**`_where` would have crashed.** It did `clauses = list(extra)` where `extra` is
a list of `(clause, value)` *tuples*, so `" and ".join(clauses)` raised
`TypeError: expected str instance, tuple found` on every call that passed a date
bound -- i.e. every call. It also collected only the filter values, forcing
each caller to prepend its date bounds by hand, which is how a bound ended up
duplicated in the values while the SQL still had one `%s` for it. Now clause
text and values are appended together in one place, and callers just use the
params handed back.

**A past-period row read fields that query does not select.** The historical
closing query selects `item_code, warehouse, actual_qty`, but the merge read
`bal.stock_uom` and `bal.reserved_qty` unguarded. A `_dict` raises
`AttributeError` for a key it does not have, so **every historical To Date
would have 500'd**. Both are now `.get()`.

Found by simulating the generated SQL and comparing `%s` counts against the
values passed -- a check worth repeating for any new raw SQL in this file.

## 15. The endpoint that was not whitelisted (2026-10-13)

### 15.1 What happened

All three stock-balance endpoints shipped without `@frappe.whitelist`, so every
call from the SPA died with:

    Function erpnext_ui.api.get_stock_balance_summary is not whitelisted.

Reported live by the user, not caught by anything I ran.

### 15.2 Why nothing caught it

- Both smoke suites **stub `fetch` to throw**, so they never call an endpoint.
- The rules suite only exercises pure `lib/` modules.
- ESLint and ruff have no concept of a Frappe decorator.
- I simulated the generated SQL by hand, which proved the queries were
  well-formed but never proved they were *reachable*.

All suites green and the feature completely unreachable. I described that as
"verified"; the suites were genuinely green and it did not mean the endpoint
worked. That was overclaiming.

### 15.3 The guard

A rules-suite assertion parses `erpnext_ui/api.py` and fails if any `def get_*`
lacks `@frappe.whitelist`. Scoped to `get_*` deliberately: `has_app_permission`
and `boot_session` are public, have no decorator, and are called by a boot hook
rather than by the SPA -- flagging them would have made the check unusable.

Verified by removing one decorator and confirming the suite fails with exit 1,
then restoring it and confirming exit 0. It resolves `api.py` by walking up
candidate depths rather than hardcoding one, because `import.meta.url` points at
the *built* entry, so a fixed depth silently stops parsing the day `SSR_OUT`
changes.

### 15.4 Two more bugs found while diagnosing

**`frappe.qb.new_query` does not exist.** Used in `get_bundle_trace`; searching
all of frappe and ERPNext finds **zero** usages. The real constructor is
`frappe.qb.from_(table)` (see
`buying/report/supplier_quotation_comparison.py:39-42`). So that endpoint was
broken twice over. `.isin()` itself is fine -- ERPNext uses it widely.

**`frappe.utils.get_first_day(dt)` returns a `date` object** unless called with
`as_str=True` (`data.py:395-410`). The original code round-tripped it through
`format_date(...)`, which did work, but `as_str=True` is the intended call.

### 15.5 The process gap this exposed

I cannot verify from here that a Frappe endpoint is *reachable* -- only that its
SQL and its pure logic are sound. Until this guard existed, every new endpoint
carried that risk silently. Worth asking whether the next endpoint should be
smoke-called against QA immediately after deploy rather than waiting to be
reported.

## 16. Return remaining material to stock (2026-10-13)

### 16.1 The action

A per-row **Return this material to stock** button on the Stock Balance report.
One Stock Entry, purpose **Material Transfer**, from where the material is now
(Work In Progress) to Stores. Deliberately one purpose: the ask was a single
thing a shopfloor user can finish without learning ERPNext.

The button lives on the balance row rather than its own screen because the
context it needs -- which item, which warehouse, how much -- is already in view.

### 16.2 Item creation is part of it, and atomic

The user can either return under the existing code or create a **new Item** for
leftover that is a different specification. Both paths plus the movement are ONE
whitelisted call, not three document creates:

- a half-done pair leaves a junk Item in the master with no movement against it
- the SPA does not know what its user's role holds, so the permission check
  belongs server-side (CREATE on `Stock Entry`, and on `Item` only when creating)

Only `item_code`, `item_group` and `stock_uom` are mandatory (`item.json`);
`Item.validate()` fills `item_name`, `description` and the stock-UOM conversion
row itself (`item.py:184-215`). `item_code` is the autoname
(`autoname: field:item_code`), so a collision is an overwrite risk -- hence the
explicit `frappe.db.exists` check.

### 16.3 Batch and serial: ERPNext's rule, surfaced honestly

`get_return_stock_entry_context` reports what the item needs so the dialog asks
only that. The rule, from `serial_batch_bundle.py:190-195` and `:294-308`:

| Item setup | Dialog behaviour |
|---|---|
| batch + `create_new_batch` + `batch_number_series` | asks nothing, says it will be generated |
| batch + `create_new_batch`, **no** series | **must ask** -- ERPNext has nothing to generate from and throws at save |
| batch, no `create_new_batch` | must ask (existing batch) |
| serial + `serial_no_series` | asks nothing |
| serial, no series | must ask, one number per line |

A newly created item never has a series, so if it is tracked the number must be
typed -- the dialog does not offer auto-naming for it.

The bundle itself is built server-side by
`make_bundle_using_old_serial_batch_fields` from `batch_no` / `serial_no` on the
row (`stock_controller.py:252-288`), which sets `use_serial_batch_fields` itself.
That is the supported path: the SPA cannot call `make_serial_batch_bundle`
because it is a Python helper, not a whitelisted method. ERPNext's own working
payload is `test_stock_entry.py:711-750` -- one bundle per row, anchored to
`t_warehouse`.

**Expired batches are not a risk here.** `validate_serialized_batch` skips the
expiry check for Material Transfer (`stock_controller.py:206`, `:225-226`), so
leftover from a job comes back regardless of batch age.

### 16.4 Test scope, stated honestly

The batch/serial decision logic lives in `api.py`, which the JS suites cannot
import -- there is no Python harness in this repo. So the rules suite
**restates the documented rule** rather than executing the server's, and a
comment in `rules.jsx` says so. What *is* executed is a contract check: every
context key the dialog reads must be one the server returns, which catches a
rename or a response typo. That is the realistic failure, and it is the same
class as invariant 16.

`ReturnToStock` takes an optional `context` prop purely as an injection seam.
Under `renderToString` a component that fetches on mount can only ever render
its initial state, so without it the batch/serial rules are untestable.

### 16.5 Two bugs the assertions caught

- The contract check failed on three keys (`auto_serial`, `has_batch_no`,
  `has_serial_no`). Two were my list being wrong; `auto_serial` was a genuine
  gap -- a serial item with a series asked nothing and said nothing, so the
  dialog now explains that. The list was trimmed to the four keys actually read.
- The auto-batch/auto-serial notes read `ctx` directly while the fields read
  `effective`. With `context` injected, `ctx` is null and the notes silently
  vanished. Both now read the merged view.

## 17. Stock Balance UX: trail placement and inline filters (2026-10-13)

### 17.1 The trail rendered under the wrong row

Expanding a row mounted the ledger **after the closing `</tbody>`**, so opening
row 3 of 20 dropped the history below row 20 -- the user had to scroll past
every other line to see what they had just clicked, and the connection between
the row and its history was lost entirely.

It is now a `<tr>` inside the tbody, directly after its own row, spanning every
column. The column count lives in one `COLUMN_COUNT` constant, because a
mismatch does not error -- it silently squeezes the trail into column one. Both
counts are asserted against the rendered HTML: header `<th>` count, data-row
`<td>` count, and the `colSpan` all have to agree.

### 17.1a The desktop row was three flex children fighting

The first inline version laid the row out badly, and no source-level check
caught it. Three children all claimed the row at once:

- the search box was `sm:w-1/2` -- a hard half of the toolbar
- the filter row was `flex-1`
- the action cluster was **also** `flex-1`

So the filters received what was left after search took half and actions took
half of the remainder: roughly a quarter of the toolbar, for the thing the
inline row exists to give space to.

The row is now a single flex line with one clear job per part: search takes a
fixed `w-56 shrink-0` slot when inline, the result pill never grows, the
filter row is `flex-1 min-w-0` and wraps internally, and the actions are
content-width pushed right with `ml-auto`.

### 17.1b A regression the source greps could not see

Giving the action cluster `shrink-0` unconditionally passed every assertion I
wrote against the source -- and broke **every other list in the app**, because
without the inline row its `flex-1` is what pinned it to the far right. With
`shrink-0` the actions sat beside the result count instead.

It was only visible by rendering the toolbar and reading the classes off the
DOM. The compact path now keeps `flex-1`; only the inline path uses `ml-auto`,
and both are asserted from the rendered markup rather than from source. That is
the same lesson as the whitelist bug in the opposite direction: source checks
catch renames, rendering catches layout.

### 17.2 Filters inline, dropdown when short

`ActionBar` gained an opt-in `inlineFilters`. When the toolbar is wide enough
the filters render as a wrapping row beside the search box; when it is not,
they fall back to the existing dropdown. Stock Balance opts in because five
filters behind one button is a click per use.

**The width test is a measurement, not a breakpoint.** A media query knows the
viewport; the toolbar is only part of it, and the filter count varies per report,
so "5 filters" and "3 filters" should collapse at different widths. New hook
`hooks/useElementWidth.js` uses a `ResizeObserver` against the container.

The required width is an *estimate* (search + count pill + per-filter slot +
action cluster), deliberately not measured from the fields themselves --
measuring them means rendering them first, which is the thing being decided.
Measured width starts at 0 so the first paint shows the compact control rather
than flashing a filter row that then wraps.

`FilterFields` gained an `inline` mode because it renders
`grid grid-cols-1`; appending a flex `className` fights that rather than
replacing it. The Sheet and popover callers do not pass `inline`, so every other
list is byte-for-byte unchanged.

### 17.3 A bug the suites caught immediately

`showInline` was first declared **above** `ownsFilter`, which it reads. Every
ActionBar consumer -- i.e. every list in the app -- threw
`Cannot access 'ownsFilter' before initialization`. The store suite renders
ActionBar through the Stock Balance page and failed on the spot.

This is the same shape as the whitelist bug in a different place: a change to a
**shared** component, where one consumer's test is enough to catch it because
that consumer is exercised. Worth noting the contrast -- the whitelist gap
survived because nothing called the endpoint, while this one did not.

## 18. NL-specific Purchase Receipt workflow (2026-10-15)

The Store Purchase Receipt flow now has an optional NL plate path while leaving
the generic receipt path available. It calls
`addsol_nl_custom.addsol_nl_custom.plates.api.get_plate_settings`; when that
app or the feature flag is unavailable, the form stays generic. When enabled,
it checks each selected item through `is_weight_managed_item` and fails closed
on submit if eligibility could not be confirmed.

Plate rows capture supplier weight and heat number, with optional MTC and
weighbridge weight. Estimated/variance and accepted weight are shown; the
approver-only decision is exposed according to `can_decide_weight` from the
settings API. A PO-derived per-kg rate is displayed as sourced and locked in
the receipt, while a non-PO receipt can enter or edit the rate. The server
continues to validate the submitted values and permissions. Drafts can be
saved with incomplete plate fields and completed later.

The plate detail summary should expose the full receipt calculation: theoretical
weight per plate, estimated total weight, variance, accepted weight, accepted
weight per plate, standard per-plate `rate` in INR, and line `amount` in INR.
The latter two are previews derived from accepted weight × rate per kg when a
weight has been accepted. `custom_unit_weight_kg`, supplier/weighbridge weights,
`custom_rate_per_kg`, heat, and MTC remain the stored or editable inputs as
appropriate. The regular editable rate input stays hidden for plate lines; show
the ERPNext rate as a read-only derived value.

Both draft Save and Submit must refresh plate classification for every current
receipt row before validating. The UI's `plateLookupFailed` message is shown
when classification is unknown (`null`), and Submit previously retried the API
while Save only read cached state. A quick draft save could therefore be
blocked without making a request. Keep the save and submit preflight behavior
aligned, and pass the returned status map directly to validation rather than
waiting for React state updates.

Keep `ReceiptLineForm` shared by the workbench and edit dialog so computed
weight, validation, and NL fields behave the same in both. Existing ERPNext
child fields and PO mapper fields must survive loading and saving; strip only
UI-only helper keys from payloads. The receipt landing page lists recent drafts
so users can resume them.

The feature is restricted to the Store UI and is driven by the NL app's setting
and per-item API result. Do not enable these fields for the generic purchase
form or treat frontend visibility as backend enforcement. The backend API also
returns `can_decide_weight`; if role behavior changes, update the response and
UI contract together.

The frontend production build writes hashed files and a manifest into
`erpnext_ui/public/erp_ui/`; rebuild after source changes. Targeted ESLint and
build succeeded for this receipt implementation. At that time full lint still
reported existing issues in `.smoke-tmp/rules.jsx` and
`.smoke-tmp/storecheck.jsx`; avoid changing those unless the task is to fix
their lint errors.
