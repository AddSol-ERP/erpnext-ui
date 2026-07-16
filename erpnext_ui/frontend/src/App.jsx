import { HashRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import MainLayout from "./layout/MainLayout";
import DemoList from "./pages/DemoList";
import DemoForm from "./pages/StockEntry";
import StockEntryPage from "./components/StockEntry/StockEntryPage";
import Approval from "./components/Approval";
import ApprovalListPage from "./components/Approval/ApprovalListPage";
import ProductionDashboard from "./pages/Production";
import QualityDashboard from "./pages/Quality";
import JobCardsList from "./pages/Production/job-cards";
import WorkOrderList from "./pages/Production/work-order";
import StoreDashboard from "./pages/Store";
import QualityTemplateList from "./pages/Quality/templates";
import QualityTemplateForm from "./pages/Quality/templates/form";
import InspectionParameterList from "./pages/Quality/parameters";
import InspectionParameterForm from "./pages/Quality/parameters/InspectionParameterForm";
import InspectionList from "./pages/Quality/entry";
import InspectionForm from "./pages/Quality/entry/InspectionForm";
import RequestDashboard from "./pages/requests";
import AttendanceRequestList from "./pages/requests/attendance/AttendanceRequestList";
import AttendanceRequestForm from "./pages/requests/attendance/AttendanceRequestForm";
import LeaveApplicationList from "./pages/requests/leave/LeaveApplicationList";
import LeaveApplicationForm from "./pages/requests/leave/LeaveApplicationForm";
import ExpenseClaimList from "./pages/requests/expense/ExpenseClaimList";
import ExpenseClaimForm from "./pages/requests/expense/ExpenseClaimForm";
import ReportDashboard from "./pages/Reports";
import AttendancePage from "./pages/Reports/attendance/AttendancePage";
import OvertimeReportPage from "./pages/Reports/overtime/OvertimeReportPage";
import MaterialRequestDashboard from "./pages/Store/material-request";
import MaterialRequestList from "./pages/Store/material-request/list";
import MaterialRequestForm from "./pages/Store/material-request/form";
import QualityInspectionReport from "./pages/Quality/reports";
import DeliveryNoteList from "./pages/Store/delivery";
import DeliveryNoteForm from "./pages/Store/delivery/form";
import StockBalance from "./pages/Store/stock-balance";

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
          <Route path="/approvals/:doctype" element={<ApprovalListPage />} />
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
            path="/quality/templates/:name"
            element={<QualityTemplateForm />}
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
            element={<QualityInspectionReport />}
          />
          {/* Quality generic routes for new doctypes */}
          <Route path="/quality/:doctype" element={<GenericListPage />} />
          <Route path="/quality/:doctype/new" element={<GenericFormPage />} />
          <Route path="/quality/:doctype/:name" element={<GenericFormPage />} />

          <Route path="/production/job-cards" element={<JobCardsList />} />
          <Route path="/production/work-order" element={<WorkOrderList />} />
          <Route path="/store" element={<StoreDashboard />} />
          <Route path="/store/stock-entry" element={<StockEntryPage />} />
          <Route
            path="/store/material-request"
            element={<MaterialRequestDashboard />}
          />
          <Route
            path="/store/material-request/type/:type"
            element={<MaterialRequestList />}
          />

          <Route
            path="store/material-request/type/:type/new"
            element={<MaterialRequestForm />}
          />

          <Route
            path="store/material-request/type/:type/:name"
            element={<MaterialRequestForm />}
          />

          <Route path="/store/delivery" element={<DeliveryNoteList />} />
          <Route path="/store/delivery/new" element={<DeliveryNoteForm />} />
          <Route path="/store/stock-balance" element={<StockBalance />} />
          {/* Store generic routes for new doctypes (Item, Warehouse, etc.) */}
          <Route path="/store/:doctype" element={<GenericListPage />} />
          <Route path="/store/:doctype/new" element={<GenericFormPage />} />
          <Route path="/store/:doctype/:name" element={<GenericFormPage />} />

          <Route path="/requests" element={<RequestDashboard />} />
          <Route
            path="/requests/attendance"
            element={<AttendanceRequestList />}
          />
          <Route
            path="/requests/attendance/new"
            element={<AttendanceRequestForm />}
          />
          <Route
            path="/requests/attendance/:name"
            element={<AttendanceRequestForm />}
          />
          <Route path="/requests/leave" element={<LeaveApplicationList />} />
          <Route
            path="/requests/leave/new"
            element={<LeaveApplicationForm />}
          />
          <Route
            path="/requests/leave/:name"
            element={<LeaveApplicationForm />}
          />

          <Route path="/requests/expense" element={<ExpenseClaimList />} />
          <Route path="/requests/expense/new" element={<ExpenseClaimForm />} />
          <Route
            path="/requests/expense/:name"
            element={<ExpenseClaimForm />}
          />
          <Route path="/reports" element={<ReportDashboard />} />
          <Route path="/reports/attendance" element={<AttendancePage />} />
          <Route path="/reports/overtime" element={<OvertimeReportPage />} />

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
          <Route path="/ess" element={<ESSDashboard />} />
          <Route path="/ess/profile" element={<ESSProfile />} />
          <Route path="/ess/attendance" element={<ESSCalendar />} />
          <Route path="/ess/overtime" element={<OvertimeLogs />} />
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
