# AGENTS.md — Working on `erpnext-ui`

Frappe v15 app (`erpnext_ui`) that ships a **React 19 SPA in place of ERPNext
desk**. There are **no custom DocTypes** — this is a shell over stock
ERPNext/HRMS doctypes, plus a seeded Workflow set and one print format.

**Architecture, business rules and endpoint contracts → `MEMORY.md` (repo root).**
Read it before making a non-trivial change. This file is the operating contract.

---

## 1. Commands

All frontend commands run from `erpnext_ui/frontend/`.

| Task | Command |
|---|---|
| Dev server | `npm run dev` — needs `.env.development` (`VITE_API_BASE_URL`, `VITE_API_TOKEN`) |
| **Build** | `npm run build` — see §2, this is not optional |
| Lint | `npm run lint` (eslint flat config, `src/components/ui/**` and `src/context/**` are exempted from `react-refresh/only-export-components`) |
| Python format/lint | `pre-commit run --all-files` (ruff, eslint, prettier, pyupgrade) |
| Seed/refresh workflows | `bench migrate` — seeder is on `after_migrate`, **not** `after_install` |

### 1.1 Tests

**There is no `test` script and no test framework.** A hand-rolled Node harness
lives in `erpnext_ui/frontend/.smoke-tmp/` — two suites, both framework-free and
browser-free:

```bash
# Business-logic assertions over lib/docTransition, lib/leaveApproval,
# lib/profileFlags, LinkField/searchTerm and config/storePurposes
SSR_ENTRY=.smoke-tmp/rules.jsx SSR_OUT=.smoke-tmp/out-rules \
  npx vite build --config .smoke-tmp/vite.config.mjs
node .smoke-tmp/out-rules/entry.mjs        # -> "234 passed, 0 failed"

# SSR render smoke test (Leave/Attendance/Expense forms, GenericForm,
# DocStatusField, EmployeeDocuments) with fetch and the API stubbed to throw
npx vite build --config .smoke-tmp/vite.config.mjs
node .smoke-tmp/out/entry.mjs              # -> "all forms render"

# Store + Employee Self Service surfaces AND the Purchase Receipt picker and
# line dialog: no translation key leaks, Stock Entry's posting date/time
# default to today/now, all nine ESS tile names render, and a weighed receipt
# line shows its derived factor with NO factor input anywhere.
#
# SSR_MODAL_STUB=1 is REQUIRED. Radix's Dialog renders through a Portal, so a
# real AppModal yields an empty string under renderToString and nothing inside a
# dialog can be asserted. The stub (.smoke-tmp/AppModalStub.jsx) renders
# title/children/footer inline. Without it this suite fails 9 assertions.
SSR_MODAL_STUB=1 SSR_ENTRY=.smoke-tmp/storecheck.jsx SSR_OUT=.smoke-tmp/out-store \
  npx vite build --config .smoke-tmp/vite.config.mjs
node .smoke-tmp/out-store/entry.mjs        # -> "106 passed, 0 failed"
```

All three currently pass. All exit `1` on failure.

> ⚠️ **Running these dirties tracked files.** `.smoke-tmp/out/entry.mjs` and
> `.smoke-tmp/out-rules/entry.mjs` are build artifacts that are **committed to
> git** (≈2.5 MB). `git checkout -- erpnext_ui/frontend/.smoke-tmp/` after
> running, and don't commit the churn. (`out-store/` is untracked — just delete
> it.)

**The rules suite also audits routing.** It parses every `path=` in `App.jsx` and
every `navigate()` literal under `src/`, and asserts that each target resolves to
a registered route — *and* that a target matched only by a generic `:doctype`
route names a real doctype from `config/doctypes.js`. The second check is the
one that matters: `/store/:doctype/:name` **does** match `/store/delivery/DN-1`,
it just matches the wrong thing, which is how a dead route shipped. Adding a
`navigate()` to a page whose detail route was never registered fails the build.

**No dashboard hero.** `DashboardHero` rendered the page's own subtitle inside a
card directly beneath the top bar, which already showed that subtitle from
`setHeader` — so every dashboard opened with a full-width strip repeating what
the header said, and the tiles, which are the actual content, started below the
fold. Store and ESS had dropped it with that reasoning recorded in place; the
other seven dashboards had not, which is why it read as deliberate. The
component is deleted. The subtitles stay: they are what `setHeader` shows, and
that is the one place the page's context line should live.

**A production Material Request picks its project ONCE, on the header.**
`/store/material-request/purpose/production/new` used to carry the Project field
on every item row, so the user re-read the same bill of materials once per line
and two rows could disagree about the project — an indent quietly requesting
material for two projects, which `validate_with_previous_doc` never catches
because it compares rows against the source document, not each other. Selecting
the header project now fills the items from its BOM. It is **additive**: rows
already carrying an item survive, BOM lines already present are skipped, and one
spare empty row is left at the end. Quantities prefill with the **outstanding
gap**, not the full BOM quantity — re-requesting what is already pending is how
duplicate indents happen.

ERPNext still stores `project` per item row, so the header value is copied onto
every row and **stripped back off before the save** — Material Request has no
header project column, and on edit it is recovered from the first row that
carries one. The other four purposes keep the per-row field, because those
genuinely mix project and non-project items on one request.

**Never stack one modal on another in the Store module.** The Purchase Receipt
picker used to open a line-entry dialog *on top of* the picker dialog, so adding
an item meant two overlays and dismissing two to get back to the receipt — and on
a phone the picker stayed fully rendered behind the form, so it was impossible to
tell which surface was being edited. List-and-form is now **one modal**
(`ReceiptItemWorkbench`) holding two sections. It is a dialog *deliberately*:
rendered inline on the receipt page it grew the document instead of the surface,
so the user scrolled the page to work a line and lost sight of the receipt they
were building. `AppModal` already caps the body at `max-h-[95vh]` with
`overflow-y-auto`, so the page never grows. The invariant is **exactly one**
dialog — never two, and never zero. It splits into two columns from `md`
up and shows **one pane at a time below `md`**: that is a content decision, not a
width one, because the list is a scrolling column and the form is a tall stack of
number fields, and side by side on a phone both get clipped. The pane swap is
driven by CSS breakpoints, not a JS media query, so there is no render to
disagree with the stylesheet after a resize.

The line fields live in `ReceiptLineForm`, shared by the workbench and the tray's
Edit dialog, so the measured-total logic cannot drift between the two entry
points.

The two surfaces are mutually exclusive on **open state**, never on purpose:
`<ReceiptLineDialog show={!!editingRow && !pickerOpen}>`, and the line dialog is
**not** gated on `fromPo`. Gating it on the purpose shipped a dead Edit button —
on a PO receipt the button set `editing`, and the only surface reading `editing`
for that purpose was the workbench, which was closed, so nothing appeared at
all. Picking a line inside the workbench also sets `editing`, and that must
render in the workbench's own pane rather than in a dialog on top of it.

**A null query parameter arrives at Python as the four-character string
`"null"`.** `new URLSearchParams({employee: null})` serialises it that way, Frappe
copies query params into `frappe.form_dict` verbatim, and the string is *truthy*
— so `employee = employee or my_employee` keeps it and the endpoint then reads a
document literally named `null` (`DoesNotExistError: Employee null not found`).
`get()` in `services/api.jsx` therefore strips `null`/`undefined` before
building the query string, and `get_checkin_logs` also normalises
`""`/`"null"`/`"undefined"`/`"None"` server-side. **Both halves are required:**
a bundle predating the client fix keeps sending `employee=null` until it is
redeployed. Empty strings are deliberately *not* stripped — `""` is a real "no
filter" for filter fields.

**`api.py` endpoints that take an `employee` must authorise it through
`_get_scope`, never trust it.** An employee code is trivially guessable
(`HR-EMP-00001, HR-EMP-00002, ...`), so accepting one unchecked turns a
self-service endpoint into a company-wide reader. `get_checkin_logs` is the
worked example: ESS passes nothing and the server falls back to the session's
own Employee, the Attendance report passes the row's employee, and the named
Employee is admitted only if `scope["can_view_others"]` holds *and* a
department-restricted scope actually contains them.

It **throws** rather than silently substituting the caller's own employee, which
is what `leave_balance_employees` does. Substitution is right for a list scoped
by permission; for a punch log it would show one person's check-ins under
another person's name in a report, so it fails closed.

**Every new `def get_*` / `def create_*` in `erpnext_ui/api.py` must carry
`@frappe.whitelist(allow_guest=False)`.** A rules-suite assertion parses the
file and fails the build if one does not. This is not belt-and-braces: all three
stock-balance endpoints shipped without it and every call returned *"is not
whitelisted"*, while both suites stayed green — the store suite stubs `fetch` to
throw and never calls an endpoint, so **nothing in the harness can catch it**.
Don't satisfy the guard by renaming the function or by widening it to all public
functions: `has_app_permission` and `boot_session` are called by a boot hook and
legitimately have no decorator.

**When you change `lib/stockBalance.js`, `lib/docTransition.js`, `lib/leaveApproval.js`,
`lib/profileFlags.js`, `LinkField/searchTerm.js`, `config/storePurposes.js` or
`lib/receiptConversion.js`, add a case to `.smoke-tmp/rules.jsx`.** Those files encode ERPNext invariants
that fail *silently* in the browser, so the assertions are the only guard.
`storePurposes.js` in particular guards doctype strings that ERPNext rejects
outright, and that a wrong value surfaces as a bare `417` with no field name.

---

## 2. The build-artifact rule

`npm run build` writes **directly into `erpnext_ui/public/erp_ui/`** with
`manifest: true`, and **that output is committed to git**.

Both mount paths resolve the hashed bundle through
`public/erp_ui/.vite/manifest.json` under key `"src/main.jsx"`
(`www/addsol_ui.py:15-23`, `addsol_erpnext_ui/page/addsol_ui/addsol_ui.js:6-15`).

**A frontend change is not finished until you have rebuilt and committed
`erpnext_ui/public/erp_ui/`.** Otherwise the deployed app serves stale code with
no error anywhere.

---

## 3. Invariants — do not break these

Each exists because of a specific Frappe footgun. All ten fail *silently*.

1. **Never `POST` to update a document.** `POST /resource/<dt>/<name>` routes to
   `execute_doc_method` and raises `KeyError: 'run_method'`. Use `PUT`.
   (`useStockEntry.js:343-345` is the one deliberate exception — it supplies
   `{run_method:"submit"}`.) Route all saves through `lib/docTransition.js`.

2. **A Workflow doctype never offers the plain Submit.** `validate_workflow` only
   compares `workflow_state` before/after, so a plain submit lands at
   `docstatus=1` while still in the first state — the approval step is skipped
   with no error. Use `apply_workflow`.

3. **Never request `workflow_state` without validating the doctype meta first.**
   The field only exists once a Workflow is configured; requesting it otherwise
   fails the *entire* query. Use `lib/approvalMeta.js`.

4. **Probe failure ⇒ "no workflow", never the reverse.** A permission or network
   blip must never block a user's submit.

5. **Leave Application inverts the normal flow.** HRMS `on_submit` refuses
   `status` of `Open`/`Cancelled`. Without a Workflow, only the **exact named
   `leave_approver`** may set it. See `lib/leaveApproval.js`.

6. **Unsaved changes hide every forward action.** Submit, transitions and leave
   Approve/Reject all act on the *stored* document, so all require `!dirty`.

7. **Fail closed, never open.** `RoleContext`'s default *and* its error path grant
   only `public: true` modules (ESS alone). `_can_read` in `api.py` returns `False`
   on any exception. Route guards return `null` while loading. The previous
   `["*"]` fallback handed every user the Approvals hub.

8. **The server is the only security boundary.** All client gating is
   visibility/UX. Never move an approval-doctype list, report key, or employee
   identity into JavaScript where a caller could edit it:
   - doctypes whose existence is disclosed live in `erpnext_ui/api.py:9-29`
   - the ESS employee is derived from `frappe.session.user` — **no `employee`
     parameter on any `ui_documents.py` endpoint**

9. **`onChange` on a `LinkField` fires only on commit** (pick / clear /
   blur-with-exact-match), never per keystroke. Per-keystroke firing ran chained
   effects on every character of an employee code and left partial text in the
   document.

10. **Preserve document order and names you don't understand.**
    - Workflow **state order is load-bearing** — `states[0]` is the entry state
      for every new document.
    - Workflow **transition order is preserved** from the Workflow document.
      Do not re-sort; "reject before approve" hardcodes semantics that belong to
      the workflow.
    - Duplicate `Workflow State` rows are **inert** (Frappe takes `state_row[0]`)
      and several are kept deliberately as documentation. Don't "clean them up".
    - Unknown workflow **action names render verbatim**. Only known verbs get an
      i18n key, so admin-authored (possibly Arabic) actions aren't mistranslated.

11. **Never hardcode an ERPNext doctype value in the Store module — in code
    *or* in a URL.** Read it from `src/config/storePurposes.js`. Two of the old
    Material Request tiles sent `"Transfer"` and `"Material Receipt"`, neither of
    which is a valid `material_request_type` — ERPNext rejects both with a bare
    HTTP 417 and no field name. Store routes now carry a *purpose key*
    (`/store/material-request/purpose/:purpose`), never a doctype value, so the
    URL cannot smuggle an invalid one either. `MEMORY.md` §9.12 has the table.

12. **Never send `purpose` on a Stock Entry.** It is `hidden`, `read_only` and
    derived from `stock_entry_type.purpose` by server-side `fetch_from`, so
    `set_fetch_from_value` overwrites anything you post. Send
    `stock_entry_type` — it is a **Link to the `Stock Entry Type` doctype**,
    not a Select.

13. **Never re-derive outstanding quantity.** Outstanding is
    `stock_qty - ordered_qty` on the Material Request Item. `received_qty` is
    Purchase-flow only and stays `0` for Stock-Entry-backed requests. Let
    ERPNext own it — use `material_request.make_stock_entry` rather than
    hand-rolling the linkage, and let the `Stock Entry` `on_submit` hook
    maintain `ordered_qty`.

14. **Don't try to filter a parent list by a child-table field from the
    browser.** `get_filter` resolves `items.project` against the *parent* meta
    and `prepare_filter_condition` then appends the child table with **no
    join** — a cross join. An indent with three items on one project comes back
    three times and paginates wrongly. Anything like this belongs in
    `api.py` behind an EXISTS-equivalent. `MEMORY.md` §3.7.

15. **Don't add a drill-down level to reach an action.** The Store dashboard is
    where you act: a purpose card opens its form directly. A read-only list is a
    separate header action, not the card body — putting "browse" on the card
    click makes a read action look like a create action. Same rule, two
    corollaries: don't register a route you can't navigate to from anywhere
    (unreachable UI), and don't give a purpose card a `createRoute` — the
    `createTileNav` handler derives a doctype from the route's last segment,
    which stops working once the route is a form URL.

16. **An `ActionTile`/`titleKey` must point at a *string*.** `store.tiles.*` are
    `{title, description}` objects, so the key needs `.title`. Miss it and
    i18next returns an object; React renders
    `key '…' returned an object instead of string` **as the tile's title**. A
    dictionary-walk audit will not catch it — the key genuinely exists — only
    rendering will. `.smoke-tmp/storecheck.jsx` asserts it across the Store
    surfaces for that reason; run it after touching any `titleKey`.

17. **Never hand-roll a PO→document mapping.** ERPNext's whitelisted mappers
    (`purchase_order.make_purchase_receipt`, `material_request.make_stock_entry`)
    already set the linkage fields, the outstanding quantity, the conversion
    factor and the rate, and they validate the source document first. Rebuilding
    that mapping is how linkage fields get forgotten, which silently stops the
    source document's progress from updating. Call the mapper and adjust only
    what the user actually changed.

18. **On a PO-linked Purchase Receipt row, item/project/UOM are locked — but
    `conversion_factor` is free, and rate is *not*.** ERPNext's
    `validate_with_previous_doc` (`purchase_receipt.py:313-318`) compares only
    `project`, `uom` and `item_code`; a mismatch throws *"Incorrect value in
    row N: UOM must be equal to 'Kg'"*, so a picker for those three can only
    produce a save failure. Two things this note used to get wrong, both of
    which cost real work:
    - `conversion_factor` is **not** in that comparison list at all — not
      "excluded when `is_return`", simply never compared
      (`transaction_base.py:125-127` iterates `compare_fields` only). It is
      constrained by two *other* rules instead: `stock_qty = qty *
      conversion_factor` (`buying_controller.py:517`), and if `uom == stock_uom`
      ERPNext force-resets it to 1.0 (`stock_controller.py:110-116`). That is
      exactly why a measured total is offered only when the two differ. **Never
      read the factor from item master** — on a weighed receipt it is a
      measurement that changes every delivery, and the nominal figure books the
      wrong stock while looking like a clean save. See `lib/receiptConversion.js`.
    - Rate is compared whenever `Buying Settings.maintain_same_rate` is on
      (action `"Stop"`), throwing on a ≥0.01 difference unless the user holds
      `role_to_override_stop_action` (`transaction_base.py:165-172`). That is
      enabled with no override role on QA, so an editable rate there is a
      guaranteed save failure. Read the setting at runtime; fail closed to
      read-only.

---

## 4. Conventions

**Python** — `ruff`, `line-length 110`, `target py310`, **`indent-style = "tab"`**,
double quotes. Match the surrounding file; most use tabs.

**JavaScript** — follow the file you're in. New code: double quotes, `const`,
arrow functions, named exports for shared helpers.

**Comments** — this codebase uses comments unusually well: they explain *why* a
non-obvious decision was made and what footgun it avoids, with a `file:line`
reference to the upstream Frappe source. **Keep that standard.** When you fix
something, add a comment recording the trap. Don't add comments restating what
the code does, and don't delete a comment that encodes a rationale without
replacing it with the new rationale.

**No new dependencies** without asking.

---

## 5. Adding things

### A doctype to a hub
1. Add an entry to `src/config/doctypes.js` — `titleField`/`subtitleField`/
   `metaField`/`statusField`, `searchFields`. Set `nativeForm: true` if it should
   open ERPNext desk in a new tab; `readOnly: true` for print-preview-only.
2. Add a tile to the hub's `index.jsx` if it needs discoverability.
3. Register the route trio `/:hub/:doctype`, `/new`, `/:name` — already present
   per hub in `App.jsx`.

⚠️ `GenericList` does **not** meta-validate its field list. A config field the
doctype lacks fails the whole query.

### A module
Add to `MODULE_ACCESS` in `config/moduleAccess.js`. If it should be gated on real
doctype read permission rather than role names, add `gatedBy` and extend
`SPA_APPROVAL_DOCTYPES`/`SPA_REPORT_DOCTYPES` in `api.py` — **server-side**.

### A backend endpoint
`erpnext_ui/api.py` or `erpnext_ui/ui_documents.py`. State the permission model
in the docstring and **fail closed** on any exception path. Add to the
`@frappe.whitelist` inventory in `MEMORY.md` §3.2 and §3.5.

### An i18n string
`src/i18n/locales/{en,hi,ar}/<namespace>.json`. **All three languages** must get
the key — they currently have identical namespace structure. Namespaces are one
JSON pair per module so parallel work never collides on `translation.json`.

---

## 6. Traps

- **`window.mountErpUI` is a contract.** `main.jsx:70-72` assigns it;
  `addsol_ui.js:25-32` calls it in a script's `onload`. Renaming either side
  breaks desk embedding — the desk page renders an empty shell with no React
  error.

- **HashRouter means every URL is typeable.** Hiding a nav item is not access
  control. Any new sensitive route needs a `Require*Access` guard, not just a
  hidden tile. Also block *unlisted* doctypes — see
  `RequireApprovalDoctypeAccess.jsx`.

- **`required_apps = []` but the SPA hard-depends on `hrms` and `shopfloor`.**
  `hrms` calls fail safe; **`shopfloor.api.stock_entry.get_bulk_valuation` does
  not** — it throws on a site without that app. Don't add a fourth unguarded
  cross-app call.

- **The `docRef` pattern is not a bug.** Toolbar handlers are registered in an
  effect that deliberately does not depend on `doc`; handlers must read through
  `docRef.current` or they close over a stale document and discard edits.

- **`dirty` is event-based, never diff-based.** Only `updateField`/
  `updateFieldObject` set it. Effects also write to `doc` (employee scope
  defaults, auto-selected approvers, server-calculated totals) and those are not
  edits. Diffing would leave Submit permanently hidden on a fresh form.

- **`.env.development` contains live Frappe API tokens in plaintext.** It is
  git-ignored — keep it that way. Never move a token into a tracked file.

- **`frontend/SUMMARY.md` and `frontend/CRUD_FUNCTIONALITY.md` are stale** and
  contradict the code (they claim "i18n: None" and "no Tailwind"). `MEMORY.md`
  supersedes both. `frontend/README.md` is untouched Vite boilerplate.

- **Known bugs are catalogued in `MEMORY.md` §9** (unregistered routes, the QC
  "Submit" that just saves, `ExpenseClaimList` reading `status` instead of
  `approval_status`, and ~10 more). Check there before assuming something is
  newly broken — and update it when you fix one.

- **Don't "tidy" the inert duplicate `Workflow State` rows or the dead code**
  without checking `MEMORY.md` §9.7 — several are deliberate and documented
  in-code.
