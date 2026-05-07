import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import { get, post } from "../../../services/api";
import { FormField } from "../../../components/FormField";
import LinkField from "../../../components/LinkField";

export default function AttendanceRequestForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const isEdit = !!name;

  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [doc, setDoc] = useState({
    employee: "",
    company: "",
    from_date: "",
    to_date: "",
    half_day: 0,
    half_day_date: "",
    include_holidays: 0,
    shift: "",
    reason: "",
    explanation: "",
  });

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit
        ? `Attendance Request ${doc.name || ""}`
        : "New Attendance Request",

      subtitle: isEdit
        ? "Review and update attendance correction"
        : "Create a request to correct attendance records",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Requests", path: "/requests" },
        { label: "Attendance Requests", path: "/requests/attendance" },
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
    if (!isEdit) {
      autoSetEmployee();
    }
  }, []);

  const autoSetEmployee = async () => {
    try {
      const res = await get("method/frappe.client.get_list", {
        doctype: "Employee",
        fields: JSON.stringify(["name", "company"]),
        limit_page_length: 2,
      });

      const list = res.message || [];

      if (list.length === 1) {
        setDoc((prev) => ({
          ...prev,
          employee: list[0].name,
          company: list[0].company,
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= LOAD ================= */
  useEffect(() => {
    if (isEdit) loadDoc();
  }, [name]);

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Attendance Request/${name}`);
      const d = res.data;

      setDoc({
        employee: d.employee || "",
        company: d.company || "",
        from_date: d.from_date || "",
        to_date: d.to_date || "",
        half_day: d.half_day || 0,
        half_day_date: d.half_day_date || "",
        include_holidays: d.include_holidays || 0,
        shift: d.shift || "",
        reason: d.reason || "",
        explanation: d.explanation || "",
      });

      if (d.docstatus === 1) setIsSubmitted(true);
    } catch (e) {
      console.error(e);
      setError("Failed to load document");
    } finally {
      setLoading(false);
    }
  };

  /* ================= VALIDATION ================= */
  const validate = () => {
    if (!doc.employee || !doc.from_date || !doc.to_date || !doc.reason) {
      return "Employee, Dates and Reason are required";
    }

    if (doc.to_date < doc.from_date) {
      return "To Date cannot be before From Date";
    }

    if (doc.half_day && !doc.half_day_date) {
      return "Half Day Date required";
    }

    return "";
  };

  /* ================= SAVE ================= */
  const handleSave = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    try {
      setLoading(true);
      setError("");

      if (isEdit) {
        await post(`resource/Attendance Request/${name}`, doc);
      } else {
        await post("resource/Attendance Request", doc);
      }

      navigate("/requests/attendance");
    } catch (e) {
      console.error(e);
      setError("Save failed");
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = isSubmitted;

  /* ================= UI ================= */
  return (
    <div className="container-fluid px-2 px-md-3">
      {error && <div className="alert alert-danger">{error}</div>}

      {/* BASIC */}
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
            <FormField label="Company" required>
              <LinkField
                doctype="Company"
                value={doc.company}
                disabled={isDisabled}
                onChange={(v) => setDoc({ ...doc, company: v })}
              />
            </FormField>
          </div>

          <div className="col-md-6">
            <FormField label="From Date" required>
              <input
                type="date"
                className="form-control"
                disabled={isDisabled}
                value={doc.from_date}
                onChange={(e) => {
                  const val = e.target.value;
                  setDoc({
                    ...doc,
                    from_date: val,
                    to_date: doc.to_date || val,
                  });
                }}
              />
            </FormField>
          </div>

          <div className="col-md-6">
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
        </div>
      </div>

      {/* OPTIONS */}
      <div className="card mb-3">
        <div className="card-body row g-2">
          <div className="col-md-4">
            <FormField label="Half Day">
              <div className="d-flex gap-2 mt-2">
                <button
                  type="button"
                  disabled={isDisabled}
                  className={`btn ${
                    doc.half_day ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() =>
                    setDoc({ ...doc, half_day: 1, half_day_date: "" })
                  }
                >
                  Yes
                </button>

                <button
                  type="button"
                  disabled={isDisabled}
                  className={`btn ${
                    !doc.half_day ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() =>
                    setDoc({ ...doc, half_day: 0, half_day_date: "" })
                  }
                >
                  No
                </button>
              </div>
            </FormField>
          </div>

          {doc.half_day === 1 && (
            <div className="col-md-4">
              <FormField label="Half Day Date">
                {/* QUICK SELECT PILLS */}
                <div className="d-flex flex-wrap gap-2 mt-2">
                  {doc.from_date &&
                    doc.to_date &&
                    (() => {
                      const dates = [];
                      let current = new Date(doc.from_date);
                      const end = new Date(doc.to_date);

                      while (current <= end) {
                        const d = current.toISOString().split("T")[0];
                        dates.push(d);
                        current.setDate(current.getDate() + 1);
                      }

                      // avoid UI clutter
                      if (dates.length > 7) return null;

                      return dates.map((d) => (
                        <button
                          key={d}
                          type="button"
                          disabled={isDisabled}
                          className={`btn btn-sm ${
                            doc.half_day_date === d
                              ? "btn-primary"
                              : "btn-outline-secondary"
                          }`}
                          onClick={() => setDoc({ ...doc, half_day_date: d })}
                        >
                          {new Date(d).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </button>
                      ));
                    })()}
                </div>

                {/* FALLBACK DATE PICKER */}
                <div className="mt-2">
                  <input
                    type="date"
                    className="form-control"
                    disabled={isDisabled}
                    min={doc.from_date}
                    max={doc.to_date}
                    value={doc.half_day_date}
                    onChange={(e) =>
                      setDoc({ ...doc, half_day_date: e.target.value })
                    }
                  />
                </div>

                {/* HELPER TEXT */}
                <small className="text-muted">
                  Select a date within chosen range
                </small>
              </FormField>
            </div>
          )}

          <div className="col-md-4">
            <FormField label="Include Holidays">
              <div className="d-flex gap-2 mt-2">
                <button
                  type="button"
                  disabled={isDisabled}
                  className={`btn ${
                    doc.include_holidays
                      ? "btn-primary"
                      : "btn-outline-secondary"
                  }`}
                  onClick={() => setDoc({ ...doc, include_holidays: 1 })}
                >
                  Yes
                </button>

                <button
                  type="button"
                  disabled={isDisabled}
                  className={`btn ${
                    !doc.include_holidays
                      ? "btn-primary"
                      : "btn-outline-secondary"
                  }`}
                  onClick={() => setDoc({ ...doc, include_holidays: 0 })}
                >
                  No
                </button>
              </div>
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Shift">
              <LinkField
                doctype="Shift Type"
                value={doc.shift}
                disabled={isDisabled}
                onChange={(v) => setDoc({ ...doc, shift: v })}
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* REASON */}
      <div className="card mb-3">
        <div className="card-body row g-2">
          <div className="col-md-6">
            <FormField label="Reason" required>
              <select
                className="form-control"
                disabled={isDisabled}
                value={doc.reason}
                onChange={(e) => setDoc({ ...doc, reason: e.target.value })}
              >
                <option value="">Select</option>
                <option value="Work From Home">Work From Home</option>
                <option value="On Duty">On Duty</option>
              </select>
            </FormField>
          </div>

          <div className="col-md-6">
            <FormField label="Explanation">
              <textarea
                className="form-control"
                rows={3}
                disabled={isDisabled}
                value={doc.explanation}
                onChange={(e) =>
                  setDoc({ ...doc, explanation: e.target.value })
                }
              />
            </FormField>
          </div>
        </div>
      </div>
    </div>
  );
}
