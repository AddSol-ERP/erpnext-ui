import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, FileText, SlidersHorizontal } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { useToast } from "../../../context/ToastContext";
import { get } from "../../../services/api";
import {
  cancelDocument,
  deleteDocument,
  getWorkflowActions,
  resolveDocstatusActions,
  resolveForwardActions,
  saveDocument,
  submitDocument,
  workflowActionLabelKey,
} from "../../../lib/docTransition";
import { getApprovalMeta } from "../../../lib/approvalMeta";
import { useDocStatus } from "../../../hooks/useDocStatus";
import { FormField } from "../../../components/FormField";
import { DocStatusField } from "../../../components/DocStatusField";
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
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DATE_LOCALES = { en: "en-IN", hi: "hi-IN", ar: "ar" };

const parseIsoDate = (value) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const formatDayMonth = (value, locale) =>
  parseIsoDate(value).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  });

export default function AttendanceRequestForm() {
  const { name } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();
  const { t, i18n } = useTranslation();

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

  // Cancel and Delete confirmation state. Both are lifecycle changes to a
  // stored document, so both are confirmed before they run.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const updateFieldObject = (patch) => {
    setDirty(true);
    setDoc((prev) => ({ ...prev, ...patch }));
  };
  const lang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const dateLocale = DATE_LOCALES[lang] || DATE_LOCALES.en;

  // Pre-fill from URL search params (used when navigating from attendance calendar)
  const prefilledFromDate = searchParams.get("from_date") || "";
  const prefilledToDate = searchParams.get("to_date") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({
    employee: "",
    company: "",
    from_date: prefilledFromDate,
    to_date: prefilledToDate || prefilledFromDate,
    half_day: 0,
    half_day_date: "",
    include_holidays: 0,
    shift: "",
    reason: "",
    explanation: "",
  });

  // Derived, not latched: docstatus 2 (Cancelled) locks the form exactly as
  // 1 (Submitted) does, and a flag set only when `docstatus === 1` would leave
  // a cancelled document editable and offering Submit.
  const isSubmitted = Number(doc.docstatus) > 0;

  // Which lifecycle buttons this document can offer. Centralised so this form,
  // the Leave form and the Expense form cannot drift apart.
  //
  // Note there is deliberately no status select here: Attendance Request has no
  // `status` field of its own, so its lifecycle lives entirely in `docstatus`
  // (and `workflow_state` when a Workflow is configured). The read-only
  // `DocStatusField` below reflects that, and `useDocStatus` resolves the right
  // column from meta rather than assuming one.
  const { showBack, showCancel, showDelete } = resolveDocstatusActions({
    isEdit,
    docstatus: doc.docstatus,
    // When a Workflow governs this doctype it owns cancellation (see
    // `resolveDocstatusActions`), so the docstatus-derived Cancel is dropped
    // and the Workflow's own Cancel transition is the only control offered.
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
  const status = useDocStatus({ doctype: "Attendance Request", doc });

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

  // Attendance Request requires `company`, and it is NOT read-only on the
  // doctype, so it must be sent. Changing employee has to refresh it --
  // previously it was only set once on mount, which left the form with a stale
  // (or empty) company whenever the employee was changed.
  async function selectEmployee(employee) {
    if (!employee) {
      setDoc((prev) => ({ ...prev, employee: "", company: "" }));
      return;
    }

    const data = await fetchEmployeeFields(employee, ["company"]);
    setDoc((prev) => ({ ...prev, employee, company: data.company || "" }));
  }

  // loadScope setState after awaited API responses; the compiler rule
  // conservatively flags any setState-reaching call from an effect.
  async function loadScope() {
    const resolved = await fetchEmployeeScope();
    setScope(resolved);

    if (!isEdit) {
      setDoc((prev) => ({ ...prev, ...applyEmployeeScope(prev, resolved) }));
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

      const res = await get(`resource/Attendance Request/${name}`);
      const d = res.data;

      const loaded = {
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

        // The pick above lists the fields this form is allowed to write, but the
        // document's status lives in columns that pick would otherwise drop.
        // `docstatus` is what makes a submitted or cancelled document read-only,
        // and `status` / `workflow_state` feed both the header badge and the
        // read-only Status field below.
        docstatus: d.docstatus ?? 0,
        status: d.status || "",
        workflow_state: d.workflow_state || "",
      };

      setDoc(loaded);
      setDirty(false);

    } catch (e) {
      console.error(e);
      setError(t("requests.attendance.loadFailed"));
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

  /* ================= VALIDATION ================= */
  const validate = (d = docRef.current) => {
    const errs = {};

    if (!d.employee) {
      errs.employee = t("common.fieldRequired", {
        field: t("requests.attendance.employee"),
      });
    }
    if (!d.from_date) {
      errs.from_date = t("common.fieldRequired", {
        field: t("requests.attendance.fromDate"),
      });
    }
    if (!d.to_date) {
      errs.to_date = t("common.fieldRequired", {
        field: t("requests.attendance.toDate"),
      });
    }
    if (!d.reason) {
      errs.reason = t("common.fieldRequired", {
        field: t("requests.attendance.reason"),
      });
    }
    if (d.from_date && d.to_date && d.to_date < d.from_date) {
      errs.to_date = t("requests.attendance.validationRange");
    }
    if (d.half_day && !d.half_day_date) {
      errs.half_day_date = t("requests.attendance.validationHalfDayDate");
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
        doctype: "Attendance Request",
        name: isEdit ? name : undefined,
        doc: current,
      });

      setDirty(false);

      if (isEdit) {
        navigate("/requests/attendance");
      } else {
        // A new form offers Save only, so land on the saved document where
        // Submit (or the Workflow transitions) is reachable.
        navigate(`/requests/attendance/${res?.data?.name}`);
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

  /* ================= CANCEL ================= */
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

  /** Runs only after the user confirms. Reloads so the form locks read-only. */
  async function confirmCancel() {
    if (!isEdit || !name) return;

    setCancelling(true);
    try {
      await cancelDocument({ doctype: "Attendance Request", name });
      await loadDoc();

      toast.success(
        t("common.cancelledSuccess", {
          name: t("requests.attendance.doctypeName"),
        }),
      );
    } catch (e) {
      const message = e?.message || t("common.cancelFailed");
      toast.error(message);
      // Keep the reason on the page too, in case the toast is missed.
      setError(message);
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  }

  /* ================= DELETE ================= */
  // Offered on an existing draft or cancelled document; `showDelete` already
  // excludes docstatus 1, which Frappe refuses outright ("Submitted Record
  // cannot be deleted. You must Cancel it first"). Whether the signed-in user
  // may actually delete it remains the server's call, and its message is shown
  // as-is rather than failing silently.
  function handleDelete() {
    if (!isEdit || !name || !showDelete) return;
    setConfirmOpen(true);
  }

  /** Runs only after the user confirms in the modal. */
  async function confirmDelete() {
    if (!isEdit || !name) return;

    setDeleting(true);
    setLoading(true);
    try {
      await deleteDocument({ doctype: "Attendance Request", name });

      toast.success(
        t("common.deletedSuccess", {
          name: t("requests.attendance.doctypeName"),
        }),
      );
      navigate("/requests/attendance");
    } catch (e) {
      toast.error(e?.message || t("common.deleteFailed"));
      setError(e?.message || t("common.deleteFailed"));
    } finally {
      setDeleting(false);
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  /* ================= DISABLED STATE ================= */
  // A submitted document is fully locked; only self-only users are pinned to
  // their own Employee.
  const isDisabled = isSubmitted;
  const employeeLocked = isSubmitted || isEmployeeLocked(scope);


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
      const meta = await getApprovalMeta("Attendance Request");
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
        ? await getWorkflowActions({ doc: { doctype: "Attendance Request", name } })
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
        const res = await saveDocument({ doctype: "Attendance Request", doc: docRef.current });
        docName = res?.data?.name;
      }

      // With a Workflow the transition can only be chosen against a saved
      // document, so continue there where those buttons now exist.
      if (hasWorkflow) {
        navigate(`/requests/attendance/${docName}`);
        return;
      }

      await submitDocument({ doctype: "Attendance Request", name: docName, action });
      toast.success(t("common.submittedSuccess", { name: label }));
      navigate("/requests/attendance");
    } catch (e) {
      const message = e?.message || t("common.submitFailed");
      toast.error(message);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      status,
      title: isEdit
        ? t("requests.header.attendanceEditTitle", { name })
        : t("requests.header.attendanceNewTitle"),

      subtitle: isEdit
        ? t("requests.header.attendanceEditSubtitle")
        : t("requests.header.attendanceNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.requests"), path: "/requests" },
        {
          label: t("requests.header.attendanceListTitle"),
          path: "/requests/attendance",
        },
        {
          label: isEdit ? name : t("common.new"),
        },
      ],

      // Built flat on purpose: PageToolbar renders `actions.map(action => ...)`
      // and reads action.label/onClick directly, so a nested array (what
      // `transitions.map(...)` returns) renders one dead, unlabelled button.
      actions: [
        !isSubmitted && {
          label: loading ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          disabled: submitting,
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
                disabled: submitting,
                onClick: () => handleSubmit(tr.action),
              };
            })
          : []),

        // Plain doctype lifecycle, only once we know no Workflow exists.
        showSubmit && {
          label: submitting ? t("common.submitting") : t("common.submit"),
          variant: "btn-primary",
          disabled: submitting,
          onClick: () => handleSubmit(),
        },

        // Leave the form without saving. Offered on a new form too, so there is
        // always a way out that does not create a document.
        showBack && {
          label: t("common.back"),
          variant: "btn-outline-primary",
          disabled: loading || submitting,
          onClick: () => navigate("/requests/attendance"),
        },

        // Cancel the stored document (docstatus 1 -> 2), confirmed first.
        showCancel && {
          label: cancelling ? t("common.cancelling") : t("common.cancel"),
          variant: "btn-outline-danger",
          disabled: loading || submitting || cancelling,
          onClick: handleCancel,
        },

        // Delete the saved document. Draft or Cancelled only: Frappe refuses a
        // submitted document outright ("You must Cancel it first"), so the
        // button is omitted there rather than left to fail.
        showDelete && {
          label: deleting ? t("common.deleting") : t("common.delete"),
          variant: "btn-outline-danger",
          disabled: loading || submitting,
          onClick: handleDelete,
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
    deleting,
    showBack,
    showCancel,
    showDelete,
  ]);

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-3 pt-4">
      <ConfirmDialog
        open={cancelOpen}
        loading={cancelling}
        title={t("common.cancel")}
        confirmLabel={t("common.cancel")}
        onCancel={() => {
          if (!cancelling) setCancelOpen(false);
        }}
        onConfirm={confirmCancel}
        message={t("common.cancelConfirm", {
          name: t("requests.attendance.doctypeName"),
        })}
      />

      <ConfirmDialog
        open={confirmOpen}
        loading={deleting}
        title={t("common.deleteConfirmTitle")}
        confirmLabel={t("common.delete")}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        onConfirm={confirmDelete}
        message={t("common.deleteConfirm", {
          name: t("requests.attendance.doctypeName"),
        })}
      />

      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {/* BASIC */}
      <FormSection
        title={t("requests.attendance.sectionDetails")}
        icon={CalendarDays}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <div className="md:col-span-2">
          <DocStatusField label={t("common.status")} status={status} />
        </div>

        <FormField
          label={t("requests.attendance.employee")}
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
          label={t("requests.attendance.company")}
          required
          name="company"
          error={fieldErrors.company}
        >
          {isDisabled ? (
            <Input value={doc.company} disabled readOnly />
          ) : (
            <LinkField
              doctype="Company"
              value={doc.company}
              disabled={isDisabled}
              onChange={(v) => updateField("company", v)}
            />
          )}
        </FormField>

        <FormField
          label={t("requests.attendance.fromDate")}
          required
          name="from_date"
          error={fieldErrors.from_date}
        >
          <Input
            type="date"
            disabled={isDisabled}
            value={doc.from_date}
            onChange={(e) => {
              const val = e.target.value;
              updateFieldObject({
                from_date: val,
                to_date: doc.to_date || val,
              });
            }}
          />
        </FormField>

        <FormField
          label={t("requests.attendance.toDate")}
          required
          name="to_date"
          error={fieldErrors.to_date}
        >
          <Input
            type="date"
            disabled={isDisabled}
            min={doc.from_date}
            value={doc.to_date}
            onChange={(e) => updateField("to_date", e.target.value)}
          />
        </FormField>
      </FormSection>

      {/* OPTIONS */}
      <FormSection
        title={t("requests.attendance.sectionOptions")}
        icon={SlidersHorizontal}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        <FormField label={t("requests.attendance.halfDay")} name="half_day">
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isDisabled}
              variant={doc.half_day ? "default" : "outline"}
              onClick={() =>
                updateFieldObject({ half_day: 1, half_day_date: "" })
              }
            >
              {t("common.yes")}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isDisabled}
              variant={!doc.half_day ? "default" : "outline"}
              onClick={() =>
                updateFieldObject({ half_day: 0, half_day_date: "" })
              }
            >
              {t("common.no")}
            </Button>
          </div>
        </FormField>

        {doc.half_day === 1 && (
          <FormField
            label={t("requests.attendance.halfDayDate")}
            name="half_day_date"
            error={fieldErrors.half_day_date}
          >
            {/* QUICK SELECT PILLS */}
            <div className="mt-1 flex flex-wrap gap-2">
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
                    <Button
                      key={d}
                      type="button"
                      size="xs"
                      disabled={isDisabled}
                      variant={
                        doc.half_day_date === d ? "default" : "outline"
                      }
                      onClick={() => updateField("half_day_date", d)}
                    >
                      {formatDayMonth(d, dateLocale)}
                    </Button>
                  ));
                })()}
            </div>

            {/* FALLBACK DATE PICKER */}
            <div className="mt-2">
              <Input
                type="date"
                disabled={isDisabled}
                min={doc.from_date}
                max={doc.to_date}
                value={doc.half_day_date}
                onChange={(e) =>
                  updateField("half_day_date", e.target.value)
                }
              />
            </div>

            {/* HELPER TEXT */}
            {!fieldErrors.half_day_date && (
              <small className="text-xs text-muted-foreground">
                {t("requests.attendance.halfDayHint")}
              </small>
            )}
          </FormField>
        )}

        <FormField
          label={t("requests.attendance.includeHolidays")}
          name="include_holidays"
        >
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isDisabled}
              variant={doc.include_holidays ? "default" : "outline"}
              onClick={() => updateField("include_holidays", 1)}
            >
              {t("common.yes")}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isDisabled}
              variant={!doc.include_holidays ? "default" : "outline"}
              onClick={() => updateField("include_holidays", 0)}
            >
              {t("common.no")}
            </Button>
          </div>
        </FormField>

        <FormField label={t("requests.attendance.shift")} name="shift">
          {isDisabled ? (
            <Input value={doc.shift} disabled />
          ) : (
            <LinkField
              doctype="Shift Type"
              value={doc.shift}
              disabled={isDisabled}
              onChange={(v) => updateField("shift", v)}
            />
          )}
        </FormField>
      </FormSection>

      {/* REASON */}
      <FormSection
        title={t("requests.attendance.reason")}
        icon={FileText}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <FormField
          label={t("requests.attendance.reason")}
          required
          name="reason"
          error={fieldErrors.reason}
        >
          <FormSelect
            value={doc.reason}
            disabled={isDisabled}
            placeholder={t("requests.attendance.select")}
            onChange={(v) => updateField("reason", v)}
            options={[
              ["Work From Home", t("requests.attendance.workFromHome")],
              ["On Duty", t("requests.attendance.onDuty")],
            ]}
          />
        </FormField>


        <FormField
          label={t("requests.attendance.explanation")}
          name="explanation"
        >
          <Textarea
            rows={3}
            disabled={isDisabled}
            value={doc.explanation}
            onChange={(e) =>
              updateField("explanation", e.target.value)
            }
          />
        </FormField>
      </FormSection>
    </div>
  );
}
