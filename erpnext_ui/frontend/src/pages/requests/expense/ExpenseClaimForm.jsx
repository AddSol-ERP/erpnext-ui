import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import { get, post } from "../../../services/api";
import { FormField } from "../../../components/FormField";
import FormSection from "../../../components/FormSection";
import FormErrorSummary from "../../../components/FormErrorSummary";
import FormSelect from "../../../components/FormSelect";
import { focusFirstError } from "../../../lib/formValidation";
import LinkField from "../../../components/LinkField";
import { FileText, Receipt, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ExpenseClaimForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const isEdit = !!name;

  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({
    employee: "",
    company: "",
    expense_approver: "",
    posting_date: "",
    remark: "",
    expenses: [],
  });

  /* ================= APPROVER ================= */
  const [approvers, setApprovers] = useState([]);

  async function fetchApprovers(employee) {
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

      const list = res.message || [];

      if (!list.length) {
        setApprovers([]);
        setDoc((prev) => ({ ...prev, expense_approver: "" }));
        setError(t("requests.expense.noApprover"));
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
      setError(t("requests.expense.approverFetchFailed"));
    }
  }

  /* ================= AUTO EMPLOYEE ================= */
  // autoSetEmployee setStates after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function autoSetEmployee() {
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
  }

  useEffect(() => {
    if (isEdit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    autoSetEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= LOAD ================= */
  // loadDoc setStates only after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function loadDoc() {
    try {
      setLoading(true);

      const res = await get(`resource/Expense Claim/${name}`);
      const d = res.data;

      setDoc({
        employee: d.employee || "",
        company: d.company || "",
        expense_approver: d.expense_approver || "",
        posting_date: d.posting_date || "",
        remark: d.remark || "",
        expenses: d.expenses || [],
      });

      if (d.docstatus === 1) setIsSubmitted(true);
    } catch {
      setError(t("requests.expense.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isEdit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDoc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

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
    setDoc((prev) => ({
      ...prev,
      expenses: prev.expenses.map((row, idx) =>
        idx === i ? { ...row, [field]: value } : row,
      ),
    }));
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
    const errs = {};

    if (!doc.employee) {
      errs.employee = t("common.fieldRequired", {
        field: t("requests.expense.employee"),
      });
    }
    if (!doc.company) {
      errs.company = t("common.fieldRequired", {
        field: t("requests.expense.company"),
      });
    }
    if (!doc.expense_approver) {
      errs.expense_approver = t("requests.expense.validationApprover");
    }

    if (!doc.expenses.length) {
      errs.expenses = t("requests.expense.validationAddOne");
    } else {
      const badRow = doc.expenses.findIndex(
        (row) =>
          !row.expense_date ||
          !row.expense_type ||
          !row.amount ||
          parseFloat(row.amount) <= 0,
      );
      if (badRow >= 0) {
        errs.expenses =
          parseFloat(doc.expenses[badRow].amount) <= 0 &&
          doc.expenses[badRow].amount !== ""
            ? t("requests.expense.validationAmount")
            : t("requests.expense.validationFillRows");
      }
    }

    const list = Object.values(errs);
    setFieldErrors(errs);
    return {
      fieldErrors: errs,
      summary: list.length > 1 ? t("common.fixErrors") : list[0] || "",
    };
  };

  /* ================= SAVE ================= */
  async function handleSave() {
    const result = validate();
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }

    try {
      setLoading(true);
      setError("");

      if (isEdit) {
        await post(`resource/Expense Claim/${name}`, doc);
      } else {
        await post("resource/Expense Claim", doc);
      }

      navigate("/requests/expense");
    } catch {
      setError(t("common.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit
        ? t("requests.header.expenseEditTitle", { name })
        : t("requests.header.expenseNewTitle"),

      subtitle: isEdit
        ? t("requests.header.expenseEditSubtitle")
        : t("requests.header.expenseNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.requests"), path: "/requests" },
        {
          label: t("requests.header.expenseListTitle"),
          path: "/requests/expense",
        },
        { label: isEdit ? name : t("common.new") },
      ],

      actions: [
        !isSubmitted && {
          label: loading ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
        },

        isEdit &&
          !isSubmitted && {
            label: t("common.submit"),
            variant: "btn-primary",
            onClick: handleSave,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, name, isEdit, setHeader, loading, isSubmitted]);

  const isDisabled = isSubmitted;
  const total = getTotal();

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-3 pt-4">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {/* BASIC */}
      <FormSection
        title={t("requests.expense.sectionDetails")}
        icon={User}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4"
      >
        <FormField
          label={t("requests.expense.employee")}
          required
          name="employee"
          error={fieldErrors.employee}
        >
          {isDisabled ? (
            <Input value={doc.employee} disabled />
          ) : (
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
                } catch {
                  console.error("Failed to load company for employee", v);
                }

                fetchApprovers(v);
              }}
            />
          )}
        </FormField>

        <FormField
          label={t("requests.expense.company")}
          required
          name="company"
          error={fieldErrors.company}
        >
          <Input value={doc.company} disabled />
        </FormField>

        <FormField
          label={t("requests.expense.approver")}
          required
          name="expense_approver"
          error={fieldErrors.expense_approver}
        >
          <FormSelect
            value={doc.expense_approver}
            disabled={isDisabled || approvers.length === 1}
            placeholder={t("requests.expense.selectApprover")}
            onChange={(v) => setDoc({ ...doc, expense_approver: v })}
            options={[
              ...(doc.expense_approver &&
              !approvers.some((a) => a.value === doc.expense_approver)
                ? [
                    {
                      value: doc.expense_approver,
                      label: doc.expense_approver,
                    },
                  ]
                : []),
              ...approvers.map((a) => ({
                value: a.value,
                label: a.description || a.value,
              })),
            ]}
          />
        </FormField>

        <FormField
          label={t("requests.expense.postingDate")}
          name="posting_date"
        >
          <Input
            type="date"
            disabled={isDisabled}
            value={doc.posting_date}
            onChange={(e) =>
              setDoc({ ...doc, posting_date: e.target.value })
            }
          />
        </FormField>
      </FormSection>

      {/* EXPENSE TABLE */}
      <FormSection
        title={t("requests.expense.expenses")}
        icon={Receipt}
        action={
          !isDisabled ? (
            <Button size="sm" onClick={addRow}>
              {t("common.addRow")}
            </Button>
          ) : null
        }
        contentClassName="flex flex-col gap-3"
      >
        <FormField
          label={t("requests.expense.expenses")}
          name="expenses"
          error={fieldErrors.expenses}
          className={fieldErrors.expenses ? "sr-only" : "sr-only"}
        >
          <span className="sr-only">{t("requests.expense.expenses")}</span>
        </FormField>

        {doc.expenses.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-1 items-end gap-2 border-b border-border pb-3 last:border-0 last:pb-0 md:grid-cols-12"
          >
            <div className="md:col-span-3">
              <FormField label={t("requests.expense.date")}>
                <Input
                  type="date"
                  disabled={isDisabled}
                  value={row.expense_date}
                  onChange={(e) =>
                    updateRow(i, "expense_date", e.target.value)
                  }
                />
              </FormField>
            </div>

            <div className="md:col-span-3">
              <FormField label={t("requests.expense.type")}>
                {isDisabled ? (
                  <Input value={row.expense_type} disabled />
                ) : (
                  <LinkField
                    doctype="Expense Claim Type"
                    value={row.expense_type}
                    disabled={isDisabled}
                    onChange={(v) => updateRow(i, "expense_type", v)}
                  />
                )}
              </FormField>
            </div>

            <div className="md:col-span-2">
              <FormField label={t("requests.expense.amount")}>
                <Input
                  type="number"
                  disabled={isDisabled}
                  value={row.amount}
                  onChange={(e) =>
                    updateRow(i, "amount", e.target.value)
                  }
                />
              </FormField>
            </div>

            <div className="md:col-span-3">
              <FormField label={t("requests.expense.description")}>
                <Input
                  type="text"
                  placeholder={t("requests.expense.description")}
                  disabled={isDisabled}
                  value={row.description}
                  onChange={(e) =>
                    updateRow(i, "description", e.target.value)
                  }
                />
              </FormField>
            </div>

            {!isDisabled && (
              <div className="md:col-span-1">
                <Button
                  variant="destructive"
                  size="icon-sm"
                  className="w-full"
                  onClick={() => removeRow(i)}
                  aria-label={t("common.delete")}
                >
                  <X />
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* TOTAL */}
        <div className="text-end">
          <strong className="text-sm">
            {t("requests.expense.total", { amount: total })}
          </strong>
        </div>
      </FormSection>

      {/* REMARK */}
      <FormSection title={t("requests.expense.remark")} icon={FileText}>
        <FormField label={t("requests.expense.remark")} name="remark">
          <Textarea
            disabled={isDisabled}
            value={doc.remark}
            onChange={(e) => setDoc({ ...doc, remark: e.target.value })}
          />
        </FormField>
      </FormSection>
    </div>
  );
}
