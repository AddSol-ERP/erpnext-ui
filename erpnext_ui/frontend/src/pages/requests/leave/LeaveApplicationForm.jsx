import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import { get, post } from "../../../services/api";
import { FormField } from "../../../components/FormField";
import LinkField from "../../../components/LinkField";

export default function LeaveApplicationForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const isEdit = !!name;

  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [leaveBalance, setLeaveBalance] = useState(null);
  const [approverError, setApproverError] = useState("");

  const [doc, setDoc] = useState({
    employee: "",
    leave_approver: "",
    leave_type: "",
    from_date: "",
    to_date: "",
    half_day: 0,
    reason: "",
  });

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit
        ? `Leave Application ${doc.name || ""}`
        : "New Leave Application",
      subtitle: isEdit
        ? "Review and update leave request"
        : "Create a new leave request",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Requests", path: "/requests" },
        { label: "Leave Applications", path: "/requests/leave" },
        {
          label: isEdit ? doc.name || "Edit" : "New",
        },
      ],

      actions: [
        !isSubmitted && {
          label: loading ? "Saving..." : "Save",
          variant: "btn-success",
          onClick: handleSave,
        },

        isEdit &&
          !isSubmitted && {
            label: "Submit",
            variant: "btn-primary",
            onClick: handleSave,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
  }, [loading, isSubmitted, doc]);

  /* ================= AUTO EMPLOYEE ================= */
  useEffect(() => {
    if (!isEdit) autoSetEmployee();
  }, []);

  const autoSetEmployee = async () => {
    const res = await get("method/frappe.client.get_list", {
      doctype: "Employee",
      fields: JSON.stringify(["name"]),
      limit_page_length: 2,
    });

    const list = res.message || [];

    if (list.length === 1) {
      setDoc((prev) => ({
        ...prev,
        employee: list[0].name,
      }));
    }
  };

  /* ================= LOAD ================= */
  useEffect(() => {
    if (isEdit) loadDoc();
  }, [name]);

  const loadDoc = async () => {
    setLoading(true);
    try {
      const res = await get(`resource/Leave Application/${name}`);
      const d = res.data;

      setDoc({
        employee: d.employee || "",
        leave_approver: d.leave_approver || "",
        leave_type: d.leave_type || "",
        from_date: d.from_date || "",
        to_date: d.to_date || "",
        half_day: d.half_day || 0,
        reason: d.reason || "",
      });

      if (d.docstatus === 1) setIsSubmitted(true);
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  };

  /* ================= APPROVER ================= */
  useEffect(() => {
    if (doc.employee) fetchApprover();
  }, [doc.employee]);

  const fetchApprover = async () => {
    try {
      const res = await get(
        "method/hrms.hr.doctype.leave_application.leave_application.get_leave_approver",
        { employee: doc.employee },
      );

      if (!res.message) {
        setApproverError("No Leave Approver assigned for this employee");
        setDoc((prev) => ({ ...prev, leave_approver: "" }));
      } else {
        setApproverError("");
        setDoc((prev) => ({
          ...prev,
          leave_approver: res.message,
        }));
      }
    } catch {
      setApproverError("Unable to fetch approver");
    }
  };

  /* ================= LEAVE DETAILS ================= */
  useEffect(() => {
    if (doc.employee && doc.leave_type) {
      fetchLeaveDetails();
    }
  }, [doc.employee, doc.leave_type]);

  const fetchLeaveDetails = async () => {
    try {
      const res = await get(
        "method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
        {
          employee: doc.employee,
          leave_type: doc.leave_type,
          date: doc.from_date,
        },
      );

      setLeaveBalance(res.message?.leave_balance || 0);
    } catch {
      setLeaveBalance(null);
    }
  };

  /* ================= DAYS ================= */
  const getTotalDays = () => {
    if (!doc.from_date || !doc.to_date) return 0;

    const from = new Date(doc.from_date);
    const to = new Date(doc.to_date);

    let days = (to - from) / (1000 * 60 * 60 * 24) + 1;

    if (doc.half_day) days -= 0.5;

    return days;
  };

  const totalDays = getTotalDays();

  /* ================= VALIDATION ================= */
  const validate = () => {
    if (!doc.employee || !doc.leave_type || !doc.from_date || !doc.to_date) {
      return "All required fields must be filled";
    }

    if (!doc.leave_approver) {
      return "Leave approver is required";
    }

    if (doc.to_date < doc.from_date) {
      return "Invalid date range";
    }

    if (leaveBalance !== null && totalDays > leaveBalance) {
      return "Insufficient leave balance";
    }

    return "";
  };

  /* ================= SAVE ================= */
  const handleSave = async () => {
    const err = validate();
    if (err) return setError(err);

    setLoading(true);
    try {
      if (isEdit) {
        await post(`resource/Leave Application/${name}`, doc);
      } else {
        await post("resource/Leave Application", doc);
      }

      navigate("/leave");
    } catch {
      setError("Save failed");
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = isSubmitted || !!approverError;

  /* ================= UI ================= */
  return (
    <div className="container-fluid px-2 px-md-3">
      {error && <div className="alert alert-danger">{error}</div>}
      {approverError && (
        <div className="alert alert-warning">{approverError}</div>
      )}

      <div className="card mb-3">
        <div className="card-body row g-2">
          <div className="col-md-6">
            <FormField label="Employee" required>
              <LinkField
                doctype="Employee"
                value={doc.employee}
                disabled={isDisabled}
                onChange={(v) => setDoc({ ...doc, employee: v })}
              />
            </FormField>
          </div>

          <div className="col-md-6">
            <FormField label="Approver">
              <input
                className="form-control"
                value={doc.leave_approver || "Auto assigned"}
                disabled
              />
            </FormField>
          </div>

          <div className="col-md-6">
            <FormField label="Leave Type" required>
              <LinkField
                doctype="Leave Type"
                value={doc.leave_type}
                disabled={isDisabled}
                onChange={(v) => setDoc({ ...doc, leave_type: v })}
              />
            </FormField>

            {leaveBalance !== null && (
              <small className="text-success">
                Balance: {leaveBalance} days
              </small>
            )}
          </div>

          <div className="col-md-3">
            <FormField label="From Date" required>
              <input
                type="date"
                className="form-control"
                disabled={isDisabled}
                value={doc.from_date}
                onChange={(e) => setDoc({ ...doc, from_date: e.target.value })}
              />
            </FormField>
          </div>

          <div className="col-md-3">
            <FormField label="To Date" required>
              <input
                type="date"
                className="form-control"
                disabled={isDisabled}
                min={doc.from_date}
                value={doc.to_date}
                onChange={(e) => setDoc({ ...doc, to_date: e.target.value })}
              />
            </FormField>
          </div>

          {totalDays > 0 && (
            <div className="col-12">
              <small className="text-info">
                Total Days: {totalDays} · Remaining:{" "}
                {leaveBalance !== null ? leaveBalance - totalDays : "-"}
              </small>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body row g-2">
          <div className="col-md-6">
            <FormField label="Half Day">
              <div className="d-flex gap-2">
                <button
                  className={`btn ${
                    doc.half_day ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  disabled={isDisabled}
                  onClick={() => setDoc({ ...doc, half_day: 1 })}
                >
                  Yes
                </button>

                <button
                  className={`btn ${
                    !doc.half_day ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  disabled={isDisabled}
                  onClick={() => setDoc({ ...doc, half_day: 0 })}
                >
                  No
                </button>
              </div>
            </FormField>
          </div>
          <div className="col-md-6">
            <FormField label="Reason">
              <textarea
                className="form-control"
                disabled={isDisabled}
                rows={3}
                value={doc.reason}
                onChange={(e) => setDoc({ ...doc, reason: e.target.value })}
              />
            </FormField>
          </div>
        </div>
      </div>
    </div>
  );
}
