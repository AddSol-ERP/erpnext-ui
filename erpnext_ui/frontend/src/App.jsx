import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import MainLayout from "./layout/MainLayout";
import DemoList from "./pages/DemoList";
import DemoForm from "./pages/StockEntry";
import StockEntryPage from "./components/StockEntry/StockEntryPage";
import PurchaseReceiptPicker from "./pages/Store/purchase-receipt";
import PurchaseReceiptForm from "./pages/Store/purchase-receipt/form";
import Approval from "./components/Approval";
import ApprovalListPage from "./components/Approval/ApprovalListPage";
import ProductionDashboard from "./pages/Production";
import QualityDashboard from "./pages/Quality";
import JobCardsList from "./pages/Production/job-cards";
import WorkOrderList from "./pages/Production/work-order";
import StoreDashboard from "./pages/Store";
import IndentQueue from "./pages/Store/indents";
import QualityTemplateList from "./pages/Quality/templates";
import QualityTemplateForm from "./pages/Quality/templates/form";
import InspectionParameterList from "./pages/Quality/parameters";
import InspectionParameterForm from "./pages/Quality/parameters/InspectionParameterForm";
import InspectionList from "./pages/Quality/entry";
import InspectionForm from "./pages/Quality/entry/InspectionForm";
import AttendanceRequestList from "./pages/ESS/requests/attendance/AttendanceRequestList";
import AttendanceRequestForm from "./pages/ESS/requests/attendance/AttendanceRequestForm";
import LeaveApplicationList from "./pages/ESS/requests/leave/LeaveApplicationList";
import LeaveApplicationForm from "./pages/ESS/requests/leave/LeaveApplicationForm";
import ExpenseClaimList from "./pages/ESS/requests/expense/ExpenseClaimList";
import ExpenseClaimForm from "./pages/ESS/requests/expense/ExpenseClaimForm";
import ReportDashboard from "./pages/Reports";
import MaterialRequestList from "./pages/Store/material-request/list";
import MaterialRequestForm from "./pages/Store/material-request/form";
import DeliveryNoteList from "./pages/Store/delivery";
import DeliveryNoteForm from "./pages/Store/delivery/form";
import StockBalance from "./pages/Store/stock-balance";

// Lazy: pulls recharts out of the initial bundle
const QualityInspectionReport = lazy(() => import("./pages/Quality/reports"));
const AttendancePage = lazy(() => import("./pages/Reports/attendance/AttendancePage"));
const OvertimeReportPage = lazy(
  () => import("./pages/Reports/overtime/OvertimeReportPage")
);
const LeaveBalance = lazy(
  () => import("./pages/Reports/leave-balance/LeaveBalance")
);
// Reports authored in another app, rendered from their own metadata.
const CustomReportPage = lazy(
  () => import("./pages/Reports/custom-report/CustomReportPage")
);

// NEW ROLE HUBS
import HRDashboard from "./pages/HR";
import SalesDashboard from "./pages/Sales";
import PurchaseDashboard from "./pages/Purchase";
import ESSDashboard from "./pages/ESS";
import ESSProfile from "./pages/ESS/Profile";
import ESSCalendar from "./pages/ESS/Attendance";
import OvertimeLogs from "./pages/ESS/OvertimeLogs";

// GENERIC LIST & FORM
import GenericListPage from "./components/GenericList";
import GenericFormPage from "./components/GenericForm";
import RequireReportAccess from "./components/RequireReportAccess";
import RequireApprovalDoctypeAccess from "./components/RequireApprovalDoctypeAccess";

// PRINT PREVIEW (read-only doctypes)
import PrintPreview from "./components/PrintPreview";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/demo-form" element={<DemoForm />} />
          <Route path="/demo-list" element={<DemoList />} />
          <Route path="/approvals" element={<Approval />} />
          <Route
            path="/approvals/:doctype"
            element={
              <RequireApprovalDoctypeAccess>
                <ApprovalListPage />
              </RequireApprovalDoctypeAccess>
            }
          />
          <Route path="/production" element={<ProductionDashboard />} />
          <Route path="/quality" element={<QualityDashboard />} />
          <Route path="/quality/templates" element={<QualityTemplateList />} />
          <Route
            path="/quality/parameters"
            element={<InspectionParameterList />}
          />
          <Route
            path="/quality/parameters/new"
            element={<InspectionParameterForm />}
          />
          <Route
            path="/quality/parameters/:name"
            element={<InspectionParameterForm />}
          />
          <Route
            path="/quality/templates/new"
            element={<QualityTemplateForm />}
          />
          <Route
            path="/quality/templates/:name"
            element={<QualityTemplateForm />}
          />
          <Route path="/quality/inspection" element={<InspectionList />} />
          <Route path="/quality/inspection/new" element={<InspectionForm />} />
          <Route
            path="/quality/inspection/:name"
            element={<InspectionForm />}
          />
          <Route
            path="/quality/reports"
            element={
              <Suspense fallback={null}>
                <QualityInspectionReport />
              </Suspense>
            }
          />
          {/* Quality generic routes for new doctypes */}
          <Route path="/quality/:doctype" element={<GenericListPage />} />
          <Route path="/quality/:doctype/new" element={<GenericFormPage />} />
          <Route path="/quality/:doctype/:name" element={<GenericFormPage />} />

          <Route path="/production/job-cards" element={<JobCardsList />} />
          <Route path="/production/work-order" element={<WorkOrderList />} />
          <Route path="/store" element={<StoreDashboard />} />
          <Route path="/store/stock-entry" element={<StockEntryPage />} />
          {/* Store keeper's queue of indents waiting on material. */}
          <Route path="/store/indents" element={<IndentQueue />} />

          {/*
            Purchase Receipt is PO-first, but a receipt with no PO is a real
            case, so both ways in exist. The PO name rides in `?po=` rather
            than being mapped in the picker: nothing is written until Save, so
            abandoning the form leaves no half-created receipt, and a reload
            re-maps cleanly.
          */}
          <Route path="/store/purchase-receipt" element={<PurchaseReceiptPicker />} />
          <Route path="/store/purchase-receipt/new" element={<PurchaseReceiptForm />} />
          <Route
            path="/store/purchase-receipt/:name"
            element={<PurchaseReceiptForm />}
          />

          {/*
            Indents are addressed by PURPOSE, not by doctype value.
            `/purpose/:purpose/new` is the only way to create one, so a caller
            cannot put a `material_request_type` into the URL that ERPNext's
            Select validation would reject with a bare 417.

            `/material-request/:name` is the shared read/edit route: a purpose
            is not needed to open an existing request, and requiring one would
            break links to a request raised under a different purpose.

            There is deliberately NO per-purpose list route. Purpose cards open
            the form directly, so a per-purpose list would have no entry point.
            Browsing lives on the single all-requests list below; get_indent_list
            still takes a `purpose` argument for when a scoped view is needed.
          */}
          <Route
            path="/store/material-request/purpose/:purpose/new"
            element={<MaterialRequestForm />}
          />
          <Route
            path="/store/material-request/:name"
            element={<MaterialRequestForm />}
          />
          {/*
            No purpose in the segment = "all requests". This replaced a purpose
            hub whose cards only restated the Store dashboard, adding a level of
            drill-down without adding anything.
          */}
          <Route path="/store/material-request" element={<MaterialRequestList />} />

          <Route path="/store/delivery" element={<DeliveryNoteList />} />
          <Route path="/store/delivery/new" element={<DeliveryNoteForm />} />
          {/* The detail route was never registered, so both `onRowClick` and the
              post-save redirect fell through to `/store/:doctype/:name` with
              doctype="delivery" -- a lowercase path segment, not the doctype
              name "Delivery Note". GenericForm then queried a doctype that does
              not exist and rendered an empty form. A route that pattern-matches
              is not the same as a route that is *correct*, which is why a
              pattern-based audit passed it. */}
          <Route path="/store/delivery/:name" element={<DeliveryNoteForm />} />
          <Route path="/store/stock-balance" element={<StockBalance />} />
          {/* Store generic routes for new doctypes (Item, Warehouse, etc.) */}
          <Route path="/store/:doctype" element={<GenericListPage />} />
          <Route path="/store/:doctype/new" element={<GenericFormPage />} />
          <Route path="/store/:doctype/:name" element={<GenericFormPage />} />

          {/* ----------------------------------------------------------------
              Employee Self Service.

              Leave / attendance-request / expense-claim used to live at
              /requests/* behind a second dashboard tile and a second sidebar
              group, both gated by the SAME moduleKey ("ESS"). Two names for one
              module is the confusion this merge removes.

              The URLs below are deliberately singular and hyphenated:
              `/ess/attendance` is the read-only attendance calendar, so the
              request form cannot also be `/ess/attendance` -- hence
              `attendance-request`. Every segment is static, so these win over
              the generic `/ess/:doctype` routes below by React Router's
              static-beats-dynamic ranking.

              `/requests/*` is kept only as a <Navigate>, not as a duplicate
              route: HashRouter means every URL is typeable, and these paths are
              already in shared links and bookmarks. A redirect (rather than a
              second route) guarantees there is exactly one canonical path, so a
              stale link cannot render a page whose own breadcrumbs disagree.
              ---------------------------------------------------------------- */}
          <Route path="/ess" element={<ESSDashboard />} />
          <Route path="/ess/profile" element={<ESSProfile />} />
          <Route path="/ess/attendance" element={<ESSCalendar />} />
          <Route path="/ess/overtime" element={<OvertimeLogs />} />
          <Route path="/ess/leave" element={<LeaveApplicationList />} />
          <Route
            path="/ess/leave/new"
            element={<LeaveApplicationForm />}
          />
          <Route
            path="/ess/leave/:name"
            element={<LeaveApplicationForm />}
          />
          <Route
            path="/ess/attendance-request"
            element={<AttendanceRequestList />}
          />
          <Route
            path="/ess/attendance-request/new"
            element={<AttendanceRequestForm />}
          />
          <Route
            path="/ess/attendance-request/:name"
            element={<AttendanceRequestForm />}
          />
          <Route path="/ess/expense-claim" element={<ExpenseClaimList />} />
          <Route
            path="/ess/expense-claim/new"
            element={<ExpenseClaimForm />}
          />
          <Route
            path="/ess/expense-claim/:name"
            element={<ExpenseClaimForm />}
          />
          {/* Slugs for two doctypes whose names are not URL-safe. GenericList
              reads its doctype from useParams(), so the override prop supplies
              the real name -- see doctypeOverride in components/GenericList. */}
          <Route
            path="/ess/salary-slip"
            element={<GenericListPage doctypeOverride="Salary Slip" />}
          />
          <Route
            path="/ess/todo"
            element={<GenericListPage doctypeOverride="ToDo" />}
          />

          {/* Legacy /requests/* -> the merged module. See the block comment. */}
          <Route path="/requests" element={<Navigate to="/ess" replace />} />
          <Route
            path="/requests/leave"
            element={<Navigate to="/ess/leave" replace />}
          />
          <Route
            path="/requests/leave/new"
            element={<Navigate to="/ess/leave/new" replace />}
          />
          <Route
            path="/requests/leave/:name"
            element={<Navigate to="/ess/leave/:name" replace />}
          />
          <Route
            path="/requests/attendance"
            element={<Navigate to="/ess/attendance-request" replace />}
          />
          <Route
            path="/requests/attendance/new"
            element={<Navigate to="/ess/attendance-request/new" replace />}
          />
          <Route
            path="/requests/attendance/:name"
            element={<Navigate to="/ess/attendance-request/:name" replace />}
          />
          <Route
            path="/requests/expense"
            element={<Navigate to="/ess/expense-claim" replace />}
          />
          <Route
            path="/requests/expense/new"
            element={<Navigate to="/ess/expense-claim/new" replace />}
          />
          <Route
            path="/requests/expense/:name"
            element={<Navigate to="/ess/expense-claim/:name" replace />}
          />

          <Route path="/reports" element={<ReportDashboard />} />
          <Route
            path="/reports/attendance"
            element={
              <RequireReportAccess reportKey="attendance">
                <Suspense fallback={null}>
                  <AttendancePage />
                </Suspense>
              </RequireReportAccess>
            }
          />
          <Route
            path="/reports/overtime"
            element={
              <RequireReportAccess reportKey="overtime">
                <Suspense fallback={null}>
                  <OvertimeReportPage />
                </Suspense>
              </RequireReportAccess>
            }
          />
          <Route
            path="/reports/leave-balance"
            element={
              <RequireReportAccess reportKey="leave-balance">
                <Suspense fallback={null}>
                  <LeaveBalance context="reports" />
                </Suspense>
              </RequireReportAccess>
            }
          />
          {/* Cross-app Script Reports. `reportKey` is a key of
              SPA_CUSTOM_REPORTS in erpnext_ui/api.py — the report name and the
              app that must be installed for it stay server-side, so on a site
              without that app this key resolves to false and the guard denies
              the route even though the URL is typeable. */}
          <Route
            path="/reports/plate-stock-register"
            element={
              <RequireReportAccess reportKey="plate-stock-register">
                <Suspense fallback={null}>
                  <CustomReportPage reportKey="plate-stock-register" />
                </Suspense>
              </RequireReportAccess>
            }
          />
          <Route
            path="/reports/plate-receipt-weight-variance"
            element={
              <RequireReportAccess reportKey="plate-receipt-weight-variance">
                <Suspense fallback={null}>
                  <CustomReportPage reportKey="plate-receipt-weight-variance" />
                </Suspense>
              </RequireReportAccess>
            }
          />

          {/* ================================
              HR HUB
          ================================ */}
          <Route path="/hr" element={<HRDashboard />} />
          <Route path="/hr/:doctype" element={<GenericListPage />} />
          <Route path="/hr/:doctype/new" element={<GenericFormPage />} />
          <Route path="/hr/:doctype/:name" element={<GenericFormPage />} />

          {/* ================================
              SALES HUB
          ================================ */}
          <Route path="/sales" element={<SalesDashboard />} />
          <Route path="/sales/:doctype" element={<GenericListPage />} />
          <Route path="/sales/:doctype/new" element={<GenericFormPage />} />
          <Route path="/sales/:doctype/:name" element={<GenericFormPage />} />

          {/* ================================
              PURCHASE HUB
          ================================ */}
          <Route path="/purchase" element={<PurchaseDashboard />} />
          <Route path="/purchase/:doctype" element={<GenericListPage />} />
          <Route path="/purchase/:doctype/new" element={<GenericFormPage />} />
          <Route path="/purchase/:doctype/:name" element={<GenericFormPage />} />

          {/* ================================
              EMPLOYEE SELF SERVICE HUB
          ================================ */}
          <Route
            path="/ess/leave-balance"
            element={
              <Suspense fallback={null}>
                <LeaveBalance context="ess" />
              </Suspense>
            }
          />
          <Route path="/ess/:doctype" element={<GenericListPage />} />
          <Route path="/ess/:doctype/new" element={<GenericFormPage />} />
          <Route path="/ess/:doctype/:name" element={<GenericFormPage />} />
          <Route path="/ess/print/:doctype/:name" element={<PrintPreview />} />

          {/* ================================
              GENERIC PRINT PREVIEW (any hub)
          ================================ */}
          <Route path="/:hub/print/:doctype/:name" element={<PrintPreview />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
