import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import { get, post } from "../../../services/api";
import { FormField } from "../../../components/FormField";
import LinkField from "../../../components/LinkField";

export default function ExpenseClaimForm() {
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
    expense_approver: "",
    posting_date: "",
    remark: "",
    expenses: [],
  });

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit ? `Expense Claim ${doc.name || ""}` : "New Expense Claim",

      subtitle: isEdit
        ? "Review and update expense details"
        : "Create and submit a new expense claim",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Requests", path: "/requests" },
        { label: "Expense Claims", path: "/requests/expense" },
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
    try {
      const res = await get("method/frappe.client.get_list", {
        doctype: "Employee",
        fields: JSON.stringify(["name", "company"]),
        limit_page_length: 2,
      });

      const list = res.message || [];

      if (list.length === 1) {
        const emp = list[0];

        setDoc((prev) => ({
          ...prev,
          employee: emp.name,
          company: emp.company,
          posting_date: new Date().toISOString().split("T")[0],
        }));

        fetchApprovers(emp.name);
      }
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= APPROVER ================= */
  const [approvers, setApprovers] = useState([]);

  const fetchApprovers = async (employee) => {
    if (!employee) return;

    try {
      setError("");

      const res = await post("method/frappe.desk.search.search_link", {
        txt: "",
        doctype: "User",
        ignore_user_permissions: 0,
        reference_doctype: "Expense Claim",
        page_length: 10,
        query:
          "hrms.hr.doctype.department_approver.department_approver.get_approvers",
        filters: {
          employee: employee,
          doctype: "Expense Claim",
        },
      });

      const list = res.message || []; // ✅ CORRECT for your API

      if (!list.length) {
        setApprovers([]);
        setDoc((prev) => ({ ...prev, expense_approver: "" }));
        setError("No Expense Approver found. Contact HR.");
        return;
      }

      setApprovers(list);

      // auto-select first approver
      setDoc((prev) => ({
        ...prev,
        expense_approver: list[0].value,
      }));
    } catch (e) {
      console.error(e);
      setError("Failed to fetch approver");
    }
  };

  /* ================= LOAD ================= */
  useEffect(() => {
    if (isEdit) loadDoc();
  }, [name]);

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Expense Claim/${name}`);
      const d = res.data;

      setDoc({
        employee: d.employee,
        company: d.company,
        expense_approver: d.expense_approver,
        posting_date: d.posting_date,
        remark: d.remark || "",
        expenses: d.expenses || [],
      });

      if (d.docstatus === 1) setIsSubmitted(true);
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  };

  /* ================= EXPENSE ROWS ================= */
  const addRow = () => {
    setDoc({
      ...doc,
      expenses: [
        ...doc.expenses,
        {
          expense_date: "",
          expense_type: "",
          amount: "",
          description: "",
        },
      ],
    });
  };

  const updateRow = (i, field, value) => {
    const updated = [...doc.expenses];
    updated[i][field] = value;
    setDoc({ ...doc, expenses: updated });
  };

  const removeRow = (i) => {
    const updated = doc.expenses.filter((_, idx) => idx !== i);
    setDoc({ ...doc, expenses: updated });
  };

  /* ================= TOTAL ================= */
  const getTotal = () => {
    return doc.expenses.reduce(
      (sum, row) => sum + (parseFloat(row.amount) || 0),
      0,
    );
  };

  /* ================= VALIDATION ================= */
  const validate = () => {
    if (!doc.employee || !doc.company) {
      return "Employee, Company and Approver required";
    }

    if (!doc.expense_approver) {
      return "Expense Approver is required";
    }

    if (!doc.expenses.length) {
      return "Add at least one expense";
    }

    for (const row of doc.expenses) {
      if (!row.expense_date || !row.expense_type || !row.amount) {
        return "All expense rows must be filled";
      }

      if (parseFloat(row.amount) <= 0) {
        return "Amount must be greater than 0";
      }
    }

    return "";
  };

  /* ================= SAVE ================= */
  const handleSave = async () => {
    const err = validate();
    if (err) return setError(err);

    try {
      setLoading(true);
      setError("");

      if (isEdit) {
        await post(`resource/Expense Claim/${name}`, doc);
      } else {
        await post("resource/Expense Claim", doc);
      }

      navigate("/expense-claims");
    } catch {
      setError("Save failed");
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = isSubmitted;
  const total = getTotal();

  /* ================= UI ================= */
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {error && <div className="alert alert-danger">{error}</div>}

      {/* BASIC */}
      <div className="card mb-3">
        <div className="card-body row g-2">
          <div className="col-md-4">
            <FormField label="Employee" required>
              <LinkField
                doctype="Employee"
                value={doc.employee}
                disabled={isDisabled}
                onChange={async (v) => {
                  setDoc((prev) => ({
                    ...prev,
                    employee: v,
                    expense_approver: "",
                  }));

                  try {
                    const res = await get(`resource/Employee/${v}`, {
                      fields: JSON.stringify(["company"]),
                    });

                    setDoc((prev) => ({
                      ...prev,
                      employee: v,
                      company: res.data?.company || "",
                    }));
                  } catch {}

                  fetchApprovers(v);
                }}
              />
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Company" required>
              <LinkField doctype="Company" value={doc.company} disabled />
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Approver" required>
              <select
                className="form-control"
                value={doc.expense_approver}
                disabled={isDisabled || approvers.length === 1}
                onChange={(e) =>
                  setDoc({ ...doc, expense_approver: e.target.value })
                }
              >
                <option value="">Select Approver</option>

                {approvers.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.description || a.value}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Posting Date">
              <input
                type="date"
                className="form-control"
                disabled={isDisabled}
                value={doc.posting_date}
                onChange={(e) =>
                  setDoc({ ...doc, posting_date: e.target.value })
                }
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* EXPENSE TABLE */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex justify-content-between mb-2">
            <h6>Expenses</h6>
            {!isDisabled && (
              <button className="btn btn-sm btn-primary" onClick={addRow}>
                + Add Row
              </button>
            )}
          </div>

          {doc.expenses.map((row, i) => (
            <div key={i} className="row g-2 mb-2 align-items-end">
              <div className="col-md-3">
                <input
                  type="date"
                  className="form-control"
                  disabled={isDisabled}
                  value={row.expense_date}
                  onChange={(e) => updateRow(i, "expense_date", e.target.value)}
                />
              </div>

              <div className="col-md-3">
                <LinkField
                  doctype="Expense Claim Type"
                  value={row.expense_type}
                  disabled={isDisabled}
                  onChange={(v) => updateRow(i, "expense_type", v)}
                />
              </div>

              <div className="col-md-2">
                <input
                  type="number"
                  className="form-control"
                  disabled={isDisabled}
                  value={row.amount}
                  onChange={(e) => updateRow(i, "amount", e.target.value)}
                />
              </div>

              <div className="col-md-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Description"
                  disabled={isDisabled}
                  value={row.description}
                  onChange={(e) => updateRow(i, "description", e.target.value)}
                />
              </div>

              {!isDisabled && (
                <div className="col-md-1">
                  <button
                    className="btn btn-danger w-100"
                    onClick={() => removeRow(i)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* TOTAL */}
          <div className="text-end mt-3">
            <strong>Total: ₹ {total}</strong>
          </div>
        </div>
      </div>

      {/* REMARK */}
      <div className="card">
        <div className="card-body">
          <FormField label="Remark">
            <textarea
              className="form-control"
              disabled={isDisabled}
              value={doc.remark}
              onChange={(e) => setDoc({ ...doc, remark: e.target.value })}
            />
          </FormField>
        </div>
      </div>
    </div>
  );
}
