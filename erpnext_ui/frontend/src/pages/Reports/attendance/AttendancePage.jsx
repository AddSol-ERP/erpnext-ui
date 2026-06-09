import { useEffect, useState } from "react";
import { useHeader } from "../../../context/HeaderContext";

import AttendanceCalendar from "./AttendanceCalendar";
import AttendanceGrid from "./AttendanceGrid";
import AttendanceLegend from "./AttendanceLegend";

import FilterModal from "../../../components/FilterModal";
import CheckinLogs from "../../../components/CheckinLogs";
import AttendanceRequestForm from "../../requests/attendance/AttendanceRequestForm";
import LeaveApplicationForm from "../../requests/leave/LeaveApplicationForm";

export default function AttendancePage() {
  const { setHeader } = useHeader();

  const [view, setView] = useState("calendar");
  const [month, setMonth] = useState(new Date());

  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({
    employee: "",
    department: "",
  });

  // 🔥 NEW STATE FOR MODALS
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [requestType, setRequestType] = useState("attendance"); // "attendance" or "leave"

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: "Attendance",
      subtitle: "View and analyze employee attendance records",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Reports", path: "/reports" },
        { label: "Attendance" },
      ],
    });

    return () => setHeader({});
  }, []);

  /* ================= FILTER CONFIG ================= */
  const filterConfig = {
    filters: [
      {
        label: "Employee",
        field: "employee",
        type: "link",
        doctype: "Employee",
      },
      {
        label: "Department",
        field: "department",
        type: "link",
        doctype: "Department",
      },
    ],
  };

  /* ================= HANDLERS ================= */
  const handleDateClick = (date, employee, status) => {
    setSelectedDate(date);
    setSelectedEmployee(employee);
    setSelectedStatus(status);

    // Show check-in logs for present status
    if (status === "Present") {
      setShowCheckinModal(true);
    } else if (status === "Absent" || !status) {
      // Show request options for absent/no data
      setShowRequestModal(true);
    }
  };

  const handleCreateRequest = (type) => {
    setRequestType(type);
    setShowRequestModal(true);
  };

  /* ================= UI ================= */
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* FILTER MODAL */}
      <FilterModal
        show={showFilter}
        onClose={() => setShowFilter(false)}
        config={filterConfig}
        initialFilters={filters}
        onApply={(f) => setFilters(f)}
      />

      {/* CONTROLS */}
      <div
        style={{
          position: "sticky",
          zIndex: 10,
          paddingBottom: 8,
        }}
      >
        {/* CONTROLS */}
        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          {/* LEFT */}
          <div className="d-flex gap-2">
            <button
              className={`btn ${
                view === "calendar" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>

            <button
              className={`btn ${
                view === "grid" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={() => setView("grid")}
            >
              Grid
            </button>
          </div>

          {/* RIGHT */}
          <div className="d-flex align-items-center gap-2">
            <button
              className="btn btn-outline-primary"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              ◀
            </button>

            <strong>
              {month.toLocaleString("default", {
                month: "short",
                year: "numeric",
              })}
            </strong>

            <button
              className="btn btn-outline-primary"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              ▶
            </button>

            <button
              className="btn btn-icon"
              onClick={() => setShowFilter(true)}
            >
              <i className="bi bi-funnel" />
            </button>
          </div>
        </div>

        {/* LEGEND */}
        <AttendanceLegend />
      </div>

      {(filters.employee || filters.department) && (
        <div className="mb-2 d-flex gap-2 flex-wrap">
          {filters.employee && (
            <span className="badge bg-primary">
              Emp: {filters.employee}
              <i
                className="bi bi-x ms-1"
                style={{ cursor: "pointer" }}
                onClick={() => setFilters((f) => ({ ...f, employee: "" }))}
              />
            </span>
          )}

          {filters.department && (
            <span className="badge bg-info">
              Dept: {filters.department}
              <i
                className="bi bi-x ms-1"
                style={{ cursor: "pointer" }}
                onClick={() => setFilters((f) => ({ ...f, department: "" }))}
              />
            </span>
          )}
        </div>
      )}

      <div className="mt-2">
        {/* VIEW */}
        {view === "calendar" ? (
          <AttendanceCalendar
            month={month}
            employee={filters.employee}
            department={filters.department}
            onDateClick={handleDateClick}
          />
        ) : (
          <AttendanceGrid
            month={month}
            employee={filters.employee}
            department={filters.department}
            onDateClick={handleDateClick}
          />
        )}
      </div>

      {/* 🔥 CHECK-IN LOGS MODAL */}
      {showCheckinModal && (
        <div
          className="modal d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Check-in Logs - {selectedDate}</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowCheckinModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <CheckinLogs date={selectedDate} employee={selectedEmployee} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 REQUEST MODAL */}
      {showRequestModal && (
        <div
          className="modal d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {selectedStatus === "Absent"
                    ? "Create Request"
                    : "New Request"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowRequestModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                {selectedStatus === "Absent" || !selectedStatus ? (
                  <div className="d-flex gap-3 mb-4">
                    <button
                      className={`btn btn-outline-primary flex-fill ${requestType === "leave" ? "active" : ""}`}
                      onClick={() => handleCreateRequest("leave")}
                    >
                      <i className="bi bi-calendar-check me-2"></i>
                      Create Leave Request
                    </button>
                    <button
                      className={`btn btn-outline-primary flex-fill ${requestType === "attendance" ? "active" : ""}`}
                      onClick={() => handleCreateRequest("attendance")}
                    >
                      <i className="bi bi-clock me-2"></i>
                      Create Attendance Request
                    </button>
                  </div>
                ) : null}

                {requestType === "leave" && (
                  <LeaveApplicationFormWrapper
                    date={selectedDate}
                    employee={selectedEmployee}
                    onClose={() => setShowRequestModal(false)}
                  />
                )}

                {requestType === "attendance" && (
                  <AttendanceRequestFormWrapper
                    date={selectedDate}
                    employee={selectedEmployee}
                    onClose={() => setShowRequestModal(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 🔥 WRAPPER FOR LEAVE APPLICATION FORM
function LeaveApplicationFormWrapper({ date, employee, onClose }) {
  const [docData, setDocData] = useState({
    employee: employee,
    from_date: date,
    to_date: date,
    leave_type: "",
    reason: "",
    half_day: 0,
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { post } = await import("../../../services/api");
      await post("resource/Leave Application", docData);
      alert("Leave request created successfully");
      onClose();
    } catch (error) {
      console.error("Error creating leave request:", error);
      alert("Failed to create leave request");
    } finally {
      setLoading(false);
    }
  };

  return <LeaveApplicationForm />;
}

// 🔥 WRAPPER FOR ATTENDANCE REQUEST FORM
function AttendanceRequestFormWrapper({ date, employee, onClose }) {
  const [docData, setDocData] = useState({
    employee: employee,
    from_date: date,
    to_date: date,
    reason: "",
    explanation: "",
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { post } = await import("../../../services/api");
      await post("resource/Attendance Request", docData);
      alert("Attendance request created successfully");
      onClose();
    } catch (error) {
      console.error("Error creating attendance request:", error);
      alert("Failed to create attendance request");
    } finally {
      setLoading(false);
    }
  };

  return <AttendanceRequestForm />;
}
