# CRUD Operations, Forms, Approvals, Reports & Views

## 1. Architecture Overview

```
React 19 SPA → HashRouter → MainLayout → Pages/Components → Frappe REST API
```

- **API Layer**: `src/services/api.jsx` — `get()`, `post()`, `put()` wrappers around `fetch`
- **State**: React Context API (`HeaderContext`, `ToastContext`)
- **Styling**: Bootstrap 5 CSS + global `index.css` (~2000 lines) with CSS custom properties
- **Routing**: `react-router-dom` v7, HashRouter, ~30 routes

### Shared UI Components

| Component                             | File                         | Purpose                                                                                                 |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PageHeader`                          | `components/PageHeader/`     | Dynamic header: back nav, title, breadcrumbs, action buttons, status filter, user display, theme toggle |
| `ActionBar`                           | `components/ActionBar/`      | Search input + filter button + print/export extras                                                      |
| `ListLayout`                          | `components/ListLayout.jsx`  | Wrapper: ActionBar top, scrollable list body, Pagination footer                                         |
| `ListView` / `ListRow` / `ListHeader` | `components/List/`           | Generic list renderer, row (main/meta/actions cols), header                                             |
| `Pagination`                          | `components/Pagination/`     | Page nav with prev/next + page number buttons                                                           |
| `FilterModal`                         | `components/FilterModal/`    | Configurable modal: select/date/link filter types                                                       |
| `FormField`                           | `components/FormField/`      | Label + required asterisk wrapper                                                                       |
| `LinkField`                           | `components/LinkField/`      | Autocomplete search for Frappe doctype links                                                            |
| `ChildTable`                          | `components/ChildTable/`     | Editable master-detail table + mobile card view                                                         |
| `AppModal`                            | `components/AppModal.jsx`    | Reusable modal (sm/md/lg/fullscreen) with header/body/footer                                            |
| `RightDrawer`                         | `components/RightDrawer.jsx` | Slide-in panel (320/420/520px)                                                                          |
| `ActionTile`                          | `components/ActionTile.jsx`  | Navigation card with icon, title, description, color                                                    |
| `StatCard`                            | `components/StatCard.jsx`    | Value + label + icon metric card                                                                        |
| `Section`                             | `components/Section.jsx`     | Title + content wrapper                                                                                 |

---

## 2. CRUD Operations (by Module)

### 2a. Quality Module — Full CRUD

| Route                       | Component                 | Operations                                                       |
| --------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `/quality/parameters/`      | `InspectionParameterList` | **R**ead (paginated list, search)                                |
| `/quality/parameters/new`   | `InspectionParameterForm` | **C**reate                                                       |
| `/quality/parameters/:name` | `InspectionParameterForm` | **R**ead/**U**pdate (load doc, save)                             |
| `/quality/templates/`       | `QualityTemplateList`     | **R**ead (paginated list, search)                                |
| `/quality/templates/new`    | `QualityTemplateForm`     | **C**reate (with child table for parameters)                     |
| `/quality/templates/:name`  | `QualityTemplateForm`     | **R**ead/**U**pdate (load doc, save)                             |
| `/quality/inspection/`      | `InspectionList`          | **R**ead (paginated list, filter by status/template)             |
| `/quality/inspection/new`   | `InspectionForm`          | **C**reate (select template → load parameters → record readings) |
| `/quality/inspection/:name` | `InspectionForm`          | **R**ead/**U**pdate (load doc, save/submit)                      |

**Pattern**: `useParams()` → check `:name` vs `new` → if edit, `frappe.client.get()` → populate form → `save()` (POST/PUT) → `frappe.client.insert()` or `frappe.client.set_value()`. Submit via `frappe.client.submit()`.

**Field types used**: text, number, select, link, textarea, date, datetime, time, checkbox, currency, attachment.

### 2b. Requests Module — Full CRUD

| Route                        | Component               | Operations                                                                 |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `/requests/leave/`           | `LeaveApplicationList`  | **R**ead (paginated, search, filter by status & leave type)                |
| `/requests/leave/new`        | `LeaveApplicationForm`  | **C**reate (auto employee, leave balance, approver fetch, half-day toggle) |
| `/requests/leave/:name`      | `LeaveApplicationForm`  | **R**ead/**U**pdate (load doc, save/submit)                                |
| `/requests/expense/`         | `ExpenseClaimList`      | **R**ead (paginated, filter by status & employee)                          |
| `/requests/expense/new`      | `ExpenseClaimForm`      | **C**reate (child table for expenses[], approver fetch)                    |
| `/requests/expense/:name`    | `ExpenseClaimForm`      | **R**ead/**U**pdate (load doc, save/submit)                                |
| `/requests/attendance/`      | `AttendanceRequestList` | **R**ead (paginated, filter by status, employee, date range)               |
| `/requests/attendance/new`   | `AttendanceRequestForm` | **C**reate (auto employee, half-day, shift, date range)                    |
| `/requests/attendance/:name` | `AttendanceRequestForm` | **R**ead/**U**pdate (load doc, save/submit)                                |

**Form Features**: auto-populate employee & company from logged user, fetch approvers from backend APIs, leave balance display, child table inline editing, half-day with date selection, save + submit dual action.

### 2c. Store Module — Partial CRUD

| Route                                      | Component             | Operations                                                                                                                                 |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/store/material-request/type/:type/`      | `MaterialRequestList` | **R**ead (paginated, filter by type/status/company)                                                                                        |
| `/store/material-request/type/:type/new`   | `MaterialRequestForm` | **C**reate (auto company, child table for items, customer for Customer Provided)                                                           |
| `/store/material-request/type/:type/:name` | `MaterialRequestForm` | **R**ead/**U**pdate (load doc, save/submit)                                                                                                |
| `/store/delivery/`                         | `DeliveryNoteList`    | **R**ead (paginated, filter by status/customer/company)                                                                                    |
| `/store/delivery/new`                      | `DeliveryNoteForm`    | **C**reate ("Get Items" from Sales Order/Pick List via modal, driver/vehicle fields)                                                       |
| `/store/stock-balance`                     | `StockBalance`        | **R**ead-only (paginated, filter by item/warehouse/company, UOM mapping)                                                                   |
| `/store/stock-entry`                       | `StockEntryPage`      | **C**reate (complex: barcode scan, source docs, warehouse dual-select, item qty adjust, stock validation, strict mode, submit + fix modal) |

**Stock Entry Pattern**: Custom hook `useStockEntry` (471 lines) managing state: entry types, items (add/remove/qty/UOM), barcode scan, Bin data (stock availability), source document loading, validation, submit. Color-coded stock indicators (green=yellow=red).

---

## 3. Approvals System

**File**: `components/Approval/` (9 files)

### Approval Dashboard (`/approvals`)

- **Component**: `Approval/index.jsx`
- Fetches pending + approved counts for 4 doctypes via `frappe.client.get_count`
- Displays tiles: Purchase Orders, Expense Claims, Leave Applications, Quotations
- Pending badge color-coded: danger (>10), warning (>0), success (=0)

### Approval List (`/approvals/:doctype`)

- **Component**: `ApprovalListPage/index.jsx`
- Config-driven: `DOCTYPE_CONFIG` defines search fields & filters per doctype
- Paginated list with status color mapping
- Row click opens ApprovalPreview modal

### Approval Preview & Actions

- **Component**: `ApprovalPreview/index.jsx`
- Fetches workflow transitions via `frappe.model.workflow.get_transitions`
- **Approve/Reject** via `apply_workflow` API
- **Preview Renderers** (doctype-specific):
  - `QuotationPreview` — customer, dates, total, items, taxes, terms
  - `PurchaseOrderPreview` — supplier, items, address, contact, taxes, terms
  - `LeavePreview` — employee, leave type, date range, balance
  - `ExpensePreview` — employee, expenses list, total claimed
  - `DefaultPreview` — JSON dump fallback
- Action buttons: Reject (danger) + Approve (success), de-duplicated and sorted

### Workflow

```
Dashboard (counts) → List (paginated) → Preview Modal (full doc) → Approve/Reject (apply_workflow)
```

---

## 4. Reports

### 4a. Attendance Report (`/reports/attendance`)

| Component            | File                                              | Purpose                                                                                                                                          |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AttendancePage`     | `pages/Reports/attendance/AttendancePage.jsx`     | Main container: month nav, employee/department filters, view toggle (calendar/grid), drill-down modals                                           |
| `AttendanceCalendar` | `pages/Reports/attendance/AttendanceCalendar.jsx` | Monthly calendar: colored cells (green=Present, red=Absent, yellow=Half Day, blue=Leave). Single employee or team (counts). Click to drill down. |
| `AttendanceGrid`     | `pages/Reports/attendance/AttendanceGrid.jsx`     | Spreadsheet: rows=employees, cols=days, cells=P/A/H/L with color. Scrollable with sticky headers.                                                |
| `AttendanceLegend`   | `pages/Reports/attendance/AttendanceLegend.jsx`   | Color legend badges                                                                                                                              |

**Drill-down**: Click a date → show `CheckinLogs` modal (employee check-in/out times) → optionally create `AttendanceRequestForm` or `LeaveRequestForm` for that date.

### 4b. Quality Inspection Report (`/quality/reports`)

- **Component**: `QualityInspectionReport`
- Summary cards: Total, Pass, Fail, Pass Rate %
- Filters: date range, item code, inspection type
- Grouped by item_code or inspection_type with status breakdown tables

---

## 5. View Types

### 5a. List Views (Read)

All follow the same pattern:

1. `useHeader()` sets page title + breadcrumbs
2. Fetch data with search params, page, filters
3. Render `ListLayout` + `ActionBar` + custom row rendering
4. `Pagination` at bottom
5. Row click → navigate to form (`/:name`) or open preview modal

| List                  | Page Size | Filters                       | Search             |
| --------------------- | --------- | ----------------------------- | ------------------ |
| Leave Applications    | 10        | Status, Leave Type            | Yes                |
| Expense Claims        | 10        | Status, Employee              | Yes                |
| Attendance Requests   | 10        | Status, Employee, Date Range  | Yes                |
| Material Requests     | 10        | Status, Company               | No                 |
| Delivery Notes        | 10        | Status, Customer, Company     | No                 |
| Work Orders           | 10        | Status, Item                  | Yes                |
| Job Cards             | 10        | Status, Work Order, Operation | No                 |
| Inspection Parameters | 10        | —                             | Yes (name)         |
| Quality Templates     | 10        | —                             | Yes (name)         |
| Quality Inspections   | 10        | Result (Pass/Fail), Template  | No                 |
| Stock Balance         | 20        | Item, Warehouse, Company      | No                 |
| Approval List (any)   | 10        | Per doctype config            | Per doctype config |

### 5b. Form Views (Create/Edit)

Pattern:

1. `useParams()` → determine `new` vs `:name`
2. If editing: `frappe.client.get(resource, name)` → populate form state
3. Form fields rendered using `FormField` wrapper + direct inputs
4. Link fields use `LinkField` component (autocomplete via `frappe.desk.search.search_link`)
5. Child tables use `ChildTable` component (desktop table + mobile cards)
6. Save → `frappe.client.insert()` or `frappe.client.set_value()`
7. Submit → `frappe.client.submit()`

### 5c. Dashboard Views (Landing Pages)

- **Module Navigation**: Grid of `ActionTile` cards with icon, title, description, color, optional badge
- **Quick Stats**: `StatCard` row showing backend-driven counts
- Examples: `/` (main dashboard), `/production`, `/quality`, `/store`, `/requests`, `/reports`

### 5d. Preview/Modal Views

- **Work Order Preview Modal**: production item, qty, status, operations list
- **Job Card Preview Modal**: progress bar, time elapsed, operations, Start/Pause/Complete actions
- **Approval Preview Modal**: full document with Approve/Reject
- **Delivery Note Picker Modal**: source document selection (SO/Pick List) with item qty mapping

### 5e. Special Views

- **Stock Entry Page**: Multi-section page with barcode scanner, type selector, warehouse dual-select, item list with stock indicators, source document modal, submit modal, stock fix modal
- **Attendance Report**: Calendar + Grid toggle, month navigation, date click drill-down
- **Quality Inspection Report**: Filterable analytics with summary cards + grouped tables
- **Attendance Regularization Dialog**: Date range selection → synthetic punch preview → bulk regularization submission

---

## 6. Shared Patterns

### Header Pattern

Every page calls `useHeader()` on mount:

```js
const { setHeader } = useHeader();
setHeader({
  title: "Page Title",
  subtitle: "Optional subtitle", // optional
  breadcrumbs: [{ label: "Home", path: "/" }, { label: "Current" }], // optional
  actions: [{ label: "Save", variant: "primary", onClick: handleSave }], // optional
  showStatusFilter: true, // optional
});
```

Cleanup on unmount restores empty header state.

### Toast Notifications

```js
const { showToast } = useToast();
showToast({
  type: "success",
  title: "Saved",
  message: "Document saved successfully",
});
```

Types: `success`, `error`, `warning`, `info`, `loading` (with spinner). Auto-dismiss with progress bar.

### Theme System

- `utils/theme.js` — `applyTheme(config)` updates CSS custom properties
- Persisted to localStorage
- Dark/light mode toggle via `ThemePanel` component
