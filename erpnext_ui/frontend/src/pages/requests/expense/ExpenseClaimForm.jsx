import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import { useToast } from "../../../context/ToastContext";
import { get } from "../../../services/api";
import {
  getWorkflowActions,
  resolveDocstatusActions,
  resolveForwardActions,
  saveDocument,
  submitDocument,
  cancelDocument,
  workflowActionLabelKey,
} from "../../../lib/docTransition";
import { getApprovalMeta } from "../../../lib/approvalMeta";
import { useDocStatus } from "../../../hooks/useDocStatus";
import { FormField } from "../../../components/FormField";
import FormSection from "../../../components/FormSection";
import FormErrorSummary from "../../../components/FormErrorSummary";
import FormSelect from "../../../components/FormSelect";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { focusFirstError } from "../../../lib/formValidation";
import {
  applyEmployeeScope,
  fetchEmployeeFields,
  fetchEmployeeScope,
  isEmployeeLocked,
} from "../../../lib/employeeScope";
import { fetchNamedApprovers } from "../../../lib/namedApprovers";
import LinkField from "../../../components/LinkField";
import { FileText, Receipt, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ExpenseClaimForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();
  const { t } = useTranslation();

  const isEdit = !!name;

  // Submit / Workflow transition state. `hasWorkflow` is a doctype-level
  // fact (meta carries `workflow_state`) so it is knowable on a new form;
  // `transitions` is document-level and needs a saved document.
  const [hasWorkflow, setHasWorkflow] = useState(false);
  const [transitions, setTransitions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [workflowChecked, setWorkflowChecked] = useState(false);
  // Frappe hides Submit while a document has unsaved changes (`can_submit()`
  // requires `!doc.__unsaved`): both submit paths act on the STORED document, so
  // submitting a dirty form would silently discard the edits.
  //
  // Tracked from real user input rather than by diffing against the loaded
  // document. This form also writes to `doc` on its own -- employee scope
  // defaults, auto-selected named approvers, half-day validation -- and those
  // are not edits; a diff would call a freshly-opened document dirty and leave
  // Submit permanently hidden.
  const [dirty, setDirty] = useState(false);
  // Seeded rather than defaulted at render time: ERPNext defaults
  // `approval_status` to "Draft" server-side, but the select falls back to that
  // value for display only. Without seeding it here, a Save made before the
  // select is ever touched would PUT `approval_status: ""`.
  const [doc, setDoc] = useState({
    employee: "",
    company: "",
    expense_approver: "",
    posting_date: "",
    remark: "",
    approval_status: "Draft",
    expenses: [],
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  /**
   * The single place the form's own fields change. Routing user input through
   * here is what marks the document dirty, so Frappe's rule (hide Submit while
   * there are unsaved changes) stays true even when other code paths below
   * write to `doc`.
   */
  const updateField = (fieldname, value) => {
    setDirty(true);
    setDoc((prev) => ({
      ...prev,
      // Accepting an updater keeps callers from reading a stale `doc` when they
      // derive the next value from the current one.
      [fieldname]: typeof value === "function" ? value(prev[fieldname]) : value,
    }));
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Derived, not latched: docstatus 2 (Cancelled) locks the form exactly as
  // 1 (Submitted) does, and a flag set only when `docstatus === 1` would leave
  // a cancelled document editable and offering Submit.
  const isSubmitted = Number(doc.docstatus) > 0;

  // Which lifecycle buttons this document can offer. Centralised so this form,
  // the Leave form and the Attendance form cannot drift apart.
  const { showBack, showCancel } = resolveDocstatusActions({
    isEdit,
    docstatus: doc.docstatus,
    // A Workflow owns cancellation once it routes to a doc_status "2" state,
    // so the docstatus Cancel yields to the Workflow's Cancel transition.
    hasWorkflow,
  });

  // Always points at the newest document. The header holds a `handleSave`
  // captured in an earlier render (its effect intentionally does not depend on
  // `doc`), so Save must read the live state through this ref rather than
  // through a captured `doc`. Without it, every value typed after mount was
  // invisible to validation and the form reported those fields as required.
  const docRef = useRef(doc);

  // Read-only lifecycle badge for the form header. Must sit after the `doc`
  // state above -- reading it earlier is a temporal-dead-zone crash.
  const status = useDocStatus({ doctype: "Expense Claim", doc });

  // Synced in an effect rather than during render: the React Compiler lint
  // rule forbids mutating a ref while rendering. Save always runs after a
  // commit (it is a click handler), so the ref is current by then.
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  /* ================= EMPLOYEE SCOPE ================= */
  const [scope, setScope] = useState({
    user: "",
    myEmployee: "",
    myCompany: "",
    canSelect: false,
    loaded: false,
  });

  /* ================= APPROVER ================= */
  const [approvers, setApprovers] = useState([]);
  const [approverError, setApproverError] = useState("");

  // fetchApprovers setState after awaited API responses; the compiler rule
  // conservatively flags any setState-reaching call from an effect.
  async function fetchApprovers(employee) {
    if (!employee) return;

    const { approvers: list, error: message } = await fetchNamedApprovers(
      employee,
      "Expense Claim",
    );

    setApprovers(list);
    setApproverError(list.length ? "" : message);

    setDoc((prev) => {
      const stillValid = list.some((a) => a.value === prev.expense_approver);
      if (stillValid) return prev;

      return {
        ...prev,
        // Auto-select when there is exactly one option, otherwise leave blank
        // so the user makes an explicit choice.
        expense_approver: list.length === 1 ? list[0].value : "",
      };
    });
  }

  // Selecting an employee re-derives both the company (Expense Claim requires
  // it and it is not read-only) and the approver list.
  async function selectEmployee(employee) {
    if (!employee) return;

    const data = await fetchEmployeeFields(employee, ["company"]);

    setDoc((prev) => ({
      ...prev,
      employee,
      company: data.company || "",
      expense_approver: "",
    }));

    fetchApprovers(employee);
  }

  // loadScope setState after awaited API responses; the compiler rule
  // conservatively flags any setState-reaching call from an effect.
  async function loadScope() {
    const resolved = await fetchEmployeeScope();
    setScope(resolved);

    if (!isEdit) {
      const patch = applyEmployeeScope({}, resolved, {
        posting_date: new Date().toISOString().split("T")[0],
        company: resolved.myCompany,
      });

      setDoc((prev) => ({ ...prev, ...patch }));

      if (patch.employee) {
        fetchApprovers(patch.employee);
      }
    }
  }

  useEffect(() => {
     
     
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadScope();
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

      const loaded = {
        employee: d.employee || "",
        company: d.company || "",
        expense_approver: d.expense_approver || "",
        posting_date: d.posting_date || "",
        remark: d.remark || "",
        expenses: d.expenses || [],

        // The pick above lists the fields this form is allowed to write, but the
        // document's status lives in columns that pick would otherwise drop.
        // `docstatus` is what makes a submitted or cancelled document read-only,
        // and `approval_status` / `workflow_state` feed both the header badge and the
        // read-only Approval Status field below.
        docstatus: d.docstatus ?? 0,
        approval_status: d.approval_status || "",
        workflow_state: d.workflow_state || "",
      };

      setDoc(loaded);
      setDirty(false);

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
    updateField("expenses", (rows = []) => [
      ...rows,
      {
        expense_date: "",
        expense_type: "",
        amount: "",
        description: "",
      },
    ]);
  };

  const updateRow = (i, field, value) => {
    updateField("expenses", (rows = []) =>
      rows.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    );
  };

  const removeRow = (i) => {
    updateField("expenses", (rows = []) => rows.filter((_, idx) => idx !== i));
  };

  /* ================= TOTAL ================= */
  const getTotal = () => {
    return doc.expenses.reduce(
      (sum, row) => sum + (parseFloat(row.amount) || 0),
      0,
    );
  };

  /* ================= VALIDATION ================= */
  const validate = (d = docRef.current) => {
    const errs = {};

    if (!d.employee) {
      errs.employee = t("common.fieldRequired", {
        field: t("requests.expense.employee"),
      });
    }
    if (!d.company) {
      errs.company = t("common.fieldRequired", {
        field: t("requests.expense.company"),
      });
    }
    if (!d.expense_approver) {
      errs.expense_approver = t("requests.expense.validationApprover");
    }

    if (!d.expenses.length) {
      errs.expenses = t("requests.expense.validationAddOne");
    } else {
      const badRow = d.expenses.findIndex(
        (row) =>
          !row.expense_date ||
          !row.expense_type ||
          !row.amount ||
          parseFloat(row.amount) <= 0,
      );
      if (badRow >= 0) {
        errs.expenses =
          parseFloat(d.expenses[badRow].amount) <= 0 &&
          d.expenses[badRow].amount !== ""
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
    const current = docRef.current;

    const result = validate(current);
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await saveDocument({
        doctype: "Expense Claim",
        name: isEdit ? name : undefined,
        doc: current,
      });

      setDirty(false);

      if (isEdit) {
        navigate("/requests/expense");
      } else {
        // A new form offers Save only, so land on the saved document where
        // Submit (or the Workflow transitions) is reachable.
        navigate(`/requests/expense/${res?.data?.name}`);
      }
    } catch (e) {
      // Map Frappe's `_server_messages` back onto the individual fields so the
      // user sees which field was rejected, instead of a bare "ValidationError".
      const serverFields = e?.fieldMessages || {};
      if (Object.keys(serverFields).length) {
        setFieldErrors((prev) => ({ ...prev, ...serverFields }));
      }
      setError(e?.message || t("common.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  /* ================= DISABLED STATE ================= */
  // A submitted document is fully locked; only self-only users are pinned to
  // their own Employee. A missing approver blocks saving but never the rest of
  // the form.
  const isDisabled = isSubmitted;
  const employeeLocked = isSubmitted || isEmployeeLocked(scope);
  const approverMissing = !doc.expense_approver;
  const canSave = !isDisabled && !approverMissing;
  const total = getTotal();


  const { showSubmit, showTransitions } = resolveForwardActions({
    isEdit,
    isSubmitted,
    isDirty: dirty,
    hasWorkflow,
    workflowChecked,
    transitionCount: transitions.length,
  });

  /* ================= WORKFLOW PROBE ================= */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const meta = await getApprovalMeta("Expense Claim");
      if (cancelled) return;
      setHasWorkflow(Boolean(meta?.hasWorkflow));
      // Until this resolves we cannot tell a Workflow doctype from a plain one,
      // and offering Submit on a Workflow doctype would bypass its first state.
      setWorkflowChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // `get_transitions` returns [] for an unsaved document -- there is no current
  // state to transition from yet.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { actions } = name
        ? await getWorkflowActions({ doc: { doctype: "Expense Claim", name } })
        : { actions: [] };

      if (!cancelled) setTransitions(actions);
    })();

    return () => {
      cancelled = true;
    };
  }, [name]);

  /**
   * Apply one Workflow transition, or a plain submit when `action` is null.
   *
   * Only reached for a saved, unmodified document, and `submitDocument` submits
   * the document the SERVER holds -- a partial form payload would fail Frappe's
   * mandatory-field validation, and `apply_workflow` reloads from the database.
   */
  const handleSubmit = async (action = null) => {
    const result = validate(docRef.current);
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }

    const labelKey = action ? workflowActionLabelKey(action) : null;
    const label = labelKey ? t(labelKey) : action || t("common.submit");

    setSubmitting(true);
    setError("");

    try {
      let docName = name;

      // A new document must exist before it can be transitioned, so the first
      // click saves it. With no Workflow we submit straight after, keeping the
      // whole flow to a single click.
      if (!docName) {
        const res = await saveDocument({ doctype: "Expense Claim", doc: docRef.current });
        docName = res?.data?.name;
      }

      // With a Workflow the transition can only be chosen against a saved
      // document, so continue there where those buttons now exist.
      if (hasWorkflow) {
        navigate(`/requests/expense/${docName}`);
        return;
      }

      await submitDocument({ doctype: "Expense Claim", name: docName, action });
      toast.success(t("common.submittedSuccess", { name: label }));
      navigate("/requests/expense");
    } catch (e) {
      const message = e?.message || t("common.submitFailed");
      toast.error(message);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Open the confirmation for cancelling the stored document.
   *
   * `showCancel` (docstatus 1) has already gated the button; the repeat check
   * keeps a stale click (the header can outlive a re-render) from cancelling
   * something the current docstatus does not allow.
   */
  function handleCancel() {
    if (!isEdit || !name || !showCancel) return;
    setCancelOpen(true);
  }

  async function confirmCancel() {
    setCancelling(true);
    try {
      await cancelDocument({ doctype: "Expense Claim", name });
      toast.success(t("common.cancelledSuccess", { name }));
      navigate("/requests/expense");
    } catch (e) {
      const message = e?.message || t("common.cancelFailed");
      toast.error(message);
      setError(message);
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  }

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      status,
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

      // Built flat on purpose: PageToolbar renders `actions.map(action => ...)`
      // and reads action.label/onClick directly, so a nested array (what
      // `transitions.map(...)` returns) renders one dead, unlabelled button.
      actions: [
        !isSubmitted && {
          label: loading ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          disabled: !canSave || submitting,
          onClick: handleSave,
        },

        // Workflow transitions replace Submit entirely. Unrecognised action
        // names are shown verbatim, as the backend's Action Master has them.
        ...(showTransitions
          ? transitions.map((tr, i) => {
              const labelKey = workflowActionLabelKey(tr.action);
              return {
                label: labelKey ? t(labelKey) : tr.action,
                variant: i === 0 ? "btn-primary" : "btn-outline-primary",
                disabled: !canSave || submitting,
                onClick: () => handleSubmit(tr.action),
              };
            })
          : []),

        // Plain doctype lifecycle, only once we know no Workflow exists.
        showSubmit && {
          label: submitting ? t("common.submitting") : t("common.submit"),
          variant: "btn-primary",
          disabled: !canSave || submitting,
          onClick: () => handleSubmit(),
        },

        // Leave the form without saving. Offered on a new form too, so there is
        // always a way out that does not create a document.
        showBack && {
          label: t("common.back"),
          variant: "btn-outline-primary",
          disabled: loading || submitting,
          onClick: () => navigate("/requests/expense"),
        },

        // Cancel the stored document (docstatus 1 -> 2), confirmed first.
        showCancel && {
          label: cancelling ? t("common.cancelling") : t("common.cancel"),
          variant: "btn-outline-danger",
          disabled: loading || submitting || cancelling,
          onClick: handleCancel,
        },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    t,
    name,
    isEdit,
    setHeader,
    loading,
    isSubmitted,
    submitting,
    hasWorkflow,
    transitions,
    status,
    workflowChecked,
    dirty,
    showSubmit,
    showTransitions,
    cancelling,
    showBack,
    showCancel,
  ]);

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-3 pt-4">
      <ConfirmDialog
        open={cancelOpen}
        loading={cancelling}
        onCancel={() => {
          if (!cancelling) setCancelOpen(false);
        }}
        onConfirm={confirmCancel}
        message={t("common.cancelConfirm", {
          name: t("requests.expense.doctypeName"),
        })}
      />

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
          {employeeLocked ? (
            <Input value={doc.employee} disabled readOnly />
          ) : (
            <LinkField
              doctype="Employee"
              value={doc.employee}
              disabled={isDisabled}
              onChange={selectEmployee}
            />
          )}
        </FormField>

        <FormField
          label={t("requests.expense.company")}
          required
          name="company"
          error={fieldErrors.company}
        >
          <Input value={doc.company} disabled readOnly />
        </FormField>

        <FormField
          label={t("requests.expense.approver")}
          required
          name="expense_approver"
          error={fieldErrors.expense_approver}
        >
          {isDisabled ? (
            <Input value={doc.expense_approver || ""} disabled readOnly />
          ) : (
            <FormSelect
              value={doc.expense_approver}
              placeholder={t("requests.expense.selectApprover")}
              onChange={(v) => updateField("expense_approver", v)}
              options={[
                // Keep the stored approver visible even if they are no longer
                // in the configured list (e.g. a legacy document).
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
                  label: a.label,
                })),
              ]}
            />
          )}

          {approverError && !isSubmitted && (
            <small className="text-xs text-amber-600 dark:text-amber-400">
              {approverError}
            </small>
          )}
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
              updateField("posting_date", e.target.value)
            }
          />
        </FormField>

        <div className="lg:col-span-4">
          <FormField label={t("common.approvalStatus")} name="approval_status">
            <FormSelect
              value={doc.approval_status || "Draft"}
              onChange={(v) => updateField("approval_status", v)}
              // With a Workflow configured, `apply_workflow` rewrites
              // `approval_status` from the next state's update_value on every
              // transition, so anything typed here is overwritten the moment the
              // document moves. Read-only in that case; still editable with no
              // Workflow, which is the only case a human has to set it.
              disabled={hasWorkflow || isSubmitted || loading || submitting}
              options={[
                { value: "Draft", label: "Draft" },
                { value: "Approved", label: "Approved" },
                { value: "Rejected", label: "Rejected" },
              ]}
            />
          </FormField>
        </div>
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
            onChange={(e) => updateField("remark", e.target.value)}
          />
        </FormField>
      </FormSection>
    </div>
  );
}
