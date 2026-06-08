# ERPNext UI — Frontend Summary

## Project Type
Frappe/ERPNext custom app embedding a **React 19 SPA** inside a Frappe Page via IIFE build.

## Tech Stack
| Technology | Version |
|---|---|
| React | 19.2.4 |
| Vite | 8.0.4 |
| react-router-dom | 7.14.0 |
| Bootstrap | 5.3.8 |
| Bootstrap Icons | 1.13.1 |
| Language | JavaScript (JSX) |
| State Management | React Context API |
| Styling | Global CSS + CSS Custom Properties + Bootstrap utilities |
| Testing | None |
| i18n | None |
| TypeScript | None |

## Directory Structure
```
erpnext_ui/frontend/
├── public/              # Static assets (favicon, icons)
├── src/                 # Main source code
│   ├── main.jsx         # Entry point (mounts React app, exports mountErpUI for Frappe)
│   ├── App.jsx          # Root component + all route definitions
│   ├── index.css        # Global design system (~2000 lines)
│   ├── App.css          # Vite template leftovers (mostly unused)
│   ├── assets/          # Static images (hero.png, etc.)
│   ├── context/         # React context providers
│   │   ├── HeaderContext.jsx   # Dynamic page header (title, breadcrumbs, actions)
│   │   └── ToastContext.jsx    # Toast notifications (success/error/warning/info/loading)
│   ├── layout/          # Layout components
│   │   └── MainLayout.jsx     # Header + content area + footer wrapper
│   ├── components/      # Reusable/shared components
│   │   ├── PageHeader/        # Dynamic header with breadcrumbs, actions, filters, theme toggle
│   │   ├── ActionBar/         # Search + filter toolbar
│   │   ├── List/              # ListView, ListRow, ListHeader
│   │   ├── ListLayout.jsx     # Action bar + list + pagination wrapper
│   │   ├── FormField/         # Dynamic form field renderer
│   │   ├── ChildTable/        # Editable child table (table + mobile card view)
│   │   ├── LinkField/         # Link/select field with dropdown
│   │   ├── FilterModal/       # Advanced filter configuration
│   │   ├── Pagination/        # Page navigation
│   │   ├── AppModal.jsx       # Reusable modal dialog
│   │   ├── RightDrawer.jsx    # Slide-in right panel
│   │   ├── ActionTile.jsx     # Clickable module tile
│   │   ├── StatCard.jsx       # Stat display card
│   │   ├── Section.jsx        # Generic titled section wrapper
│   │   ├── Approval/          # Full approval workflow (dashboard, list, preview, actions)
│   │   ├── StockEntry/        # Stock entry creation flow
│   │   ├── CheckinLogs.jsx    # Check-in log viewer
│   │   ├── AttendanceRegularizationDialog.jsx  # Attendance regularization UI
│   │   ├── AttendanceRequestForm.jsx           # Attendance request form
│   │   ├── LeaveRequestForm.jsx                # Leave request form
│   │   └── Theme/             # Theme customization panel
│   ├── pages/           # Route page components
│   │   ├── Dashboard/         # Main landing with module grid + quick stats
│   │   ├── Production/        # Production dashboard, Work Orders, Job Cards
│   │   ├── Quality/           # Quality dashboard, Parameters, Templates, Inspections, Reports
│   │   ├── Store/             # Store dashboard, Stock Entry, Material Requests, Delivery Notes, Stock Balance
│   │   ├── requests/          # Requests dashboard, Attendance, Leave, Expense Claims
│   │   ├── Reports/           # Reports dashboard, Attendance Report
│   │   ├── DemoList/          # Demo list page
│   │   └── StockEntry.jsx     # Standalone stock entry page
│   ├── services/        # API layer
│   │   └── api.jsx            # Fetch wrapper + attendance regularization API endpoints
│   └── utils/           # Utilities
│       ├── theme.js           # Dynamic CSS variable theme engine (dark/light mode)
│       └── attendanceRegularization.js  # Multi-shift attendance business logic
├── index.html
├── package.json
├── vite.config.js
├── eslint.config.js
├── .env.development
└── .env.production
```

## Routes (30+ routes)

| Route | Component | Module |
|---|---|---|
| `/` | Dashboard | Home |
| `/approvals` | Approval Dashboard | Approvals |
| `/approvals/:doctype` | Approval List | Approvals |
| `/production` | Production Dashboard | Production |
| `/production/job-cards` | Job Cards List | Production |
| `/production/work-order` | Work Order List | Production |
| `/quality` | Quality Dashboard | Quality |
| `/quality/parameters` | Inspection Parameters List | Quality |
| `/quality/parameters/new` | Inspection Parameter Form | Quality |
| `/quality/parameters/:name` | Inspection Parameter Form | Quality |
| `/quality/templates` | Quality Templates List | Quality |
| `/quality/templates/new` | Quality Template Form | Quality |
| `/quality/templates/:name` | Quality Template Form | Quality |
| `/quality/inspection` | Inspection List | Quality |
| `/quality/inspection/new` | Inspection Form | Quality |
| `/quality/inspection/:name` | Inspection Form | Quality |
| `/quality/reports` | Quality Reports | Quality |
| `/store` | Store Dashboard | Store |
| `/store/stock-entry` | Stock Entry | Store |
| `/store/material-request` | Material Request Dashboard | Store |
| `/store/material-request/type/:type` | Material Request List | Store |
| `/store/material-request/type/:type/new` | Material Request Form | Store |
| `/store/material-request/type/:type/:name` | Material Request Form | Store |
| `/store/delivery` | Delivery Note List | Store |
| `/store/delivery/new` | Delivery Note Form | Store |
| `/store/stock-balance` | Stock Balance | Store |
| `/requests` | Requests Dashboard | Requests |
| `/requests/attendance` | Attendance Request List | Requests |
| `/requests/attendance/new` | Attendance Request Form | Requests |
| `/requests/attendance/:name` | Attendance Request Form | Requests |
| `/requests/leave` | Leave Application List | Requests |
| `/requests/leave/new` | Leave Application Form | Requests |
| `/requests/leave/:name` | Leave Application Form | Requests |
| `/requests/expense` | Expense Claim List | Requests |
| `/requests/expense/new` | Expense Claim Form | Requests |
| `/requests/expense/:name` | Expense Claim Form | Requests |
| `/reports` | Reports Dashboard | Reports |
| `/reports/attendance` | Attendance Report | Reports |

## Built Features
- **Dashboard** — Module navigation grid + backend-driven quick stats
- **Approvals** — Multi-doctype approval with preview cards and Approve/Reject actions
- **Production** — Work Order and Job Card lists with preview modals
- **Quality** — Full CRUD for Inspection Parameters, Templates, and Inspections
- **Store** — Stock Entry creation flow, Material Requests (by type), Delivery Notes, Stock Balance
- **Requests** — Attendance, Leave, Expense Claim forms and lists
- **Reports** — Attendance Report with calendar, grid, and legend views
- **Theme System** — Dynamic CSS custom properties, dark/light mode, persisted to localStorage
- **Toast Notifications** — Success/error/warning/info/loading with progress bar
- **Dynamic Page Header** — Breadcrumbs, action buttons, status filters, user display
- **Reusable List System** — List + ActionBar + Pagination + FilterModal
- **Editable Child Tables** — Desktop table view + mobile card view
- **Attendance Regularization** — Multi-shift business logic with synthetic punch generation

## Gaps / Notes
- No testing framework or test files
- No internationalization (i18n) — all text hardcoded in English
- No TypeScript
- Bootstrap JS not imported — modals/dropdowns are custom React implementations
- Bootstrap CSS + global CSS (~2000 lines) used instead of CSS modules or Tailwind
