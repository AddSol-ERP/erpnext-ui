import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, FileText } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { useToast } from "../../../context/ToastContext";
import { get, post } from "../../../services/api";
import {
  canSubmitDocument,
  deleteDocument,
  getWorkflowActions,
  resolveDocstatusActions,
  resolveForwardActions,
  saveDocument,
  submitDocument,
  cancelDocument,
  workflowActionLabelKey,
} from "../../../lib/docTransition";
import { getApprovalMeta } from "../../../lib/approvalMeta";
import { useRole } from "../../../context/RoleContext";
import {
  LEAVE_APPROVED,
  LEAVE_REJECTED,
  resolveLeaveApprovalActions,
  setLeaveApprovalStatus,
} from "../../../lib/leaveApproval";
import { useDocStatus } from "../../../hooks/useDocStatus";
import { FormField } from "../../../components/FormField";
import FormSection from "../../../components/FormSection";
import FormErrorSummary from "../../../components/FormErrorSummary";
import ConfirmDialog from "../../../components/ConfirmDialog";
import FormSelect from "../../../components/FormSelect";
import { focusFirstError } from "../../../lib/formValidation";
import {
  applyEmployeeScope,
  fetchEmployeeScope,
  isEmployeeLocked,
} from "../../../lib/employeeScope";
import { fetchNamedApprovers } from "../../../lib/namedApprovers";
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function LeaveApplicationForm() {
  const { name } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const { currentUser } = useRole();

  const isEdit = !!name;

  // Delete confirmation modal state (Delete itself stays edit-only --
  // there is nothing saved to delete on a new form).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  // Cancelling is its own in-flight state, separate from `approving`: the two
  // are never shown at once (Cancel only exists at docstatus 1, Approve only at
  // docstatus 0), so one shared flag would let the other operation's label
  // linger on the button.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Submit / Workflow transition state.
  // `hasWorkflow` is a doctype-level fact (meta carries `workflow_state`), so
  // it is knowable even on a new form. `transitions` is document-level and
  // only exists once the document is saved.
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

  // Pre-fill from URL search params (used when navigating from attendance calendar)
  const prefilledDate = searchParams.get("from_date") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [leaveBalance, setLeaveBalance] = useState(null);
  const [approverError, setApproverError] = useState("");
  const [approvers, setApprovers] = useState([]);

  const [scope, setScope] = useState({
    user: "",
    myEmployee: "",
    myCompany: "",
    canSelect: false,
    loaded: false,
  });

  const [doc, setDoc] = useState({
    employee: "",
    leave_approver: "",
    leave_type: "",
    from_date: prefilledDate,
    to_date: prefilledDate,
    half_day: 0,
    // Seeded rather than defaulted at render time. HRMS defaults `status` to
    // "Open" server-side, but the select below falls back to that value for
    // display only; without seeding it here a Save made before the select is
    // ever touched would PUT `status: ""` and ERPNext rejects the empty value.
    status: "Open",
    // HRMS Leave Application stores the reason in `description`
    // (Small Text, label "Reason"). The form previously sent `reason`,
    // which is not a field on the doctype and was silently discarded.
    description: "",
  });

  // Derived, not latched: docstatus 2 (Cancelled) locks the form exactly as
  // 1 (Submitted) does, and a flag set only when `docstatus === 1` would leave
  // a cancelled document editable and offering Submit.
  const isSubmitted = Number(doc.docstatus) > 0;

  // Which lifecycle buttons this document can offer. Centralised so this form,
  // the Expense form and the Attendance form cannot drift apart.
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
  // through a captured `doc`.
  const docRef = useRef(doc);

  // Read-only lifecycle badge for the form header. Must sit after the `doc`
  // state above -- reading it earlier is a temporal-dead-zone crash.
  const status = useDocStatus({ doctype: "Leave Application", doc });

  // Synced in an effect rather than during render: the React Compiler lint
  // rule forbids mutating a ref while rendering. Save always runs after a
  // commit (it is a click handler), so the ref is current by then.
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // `validate` also reads the leave balance, which arrives asynchronously after
  // a Leave Type is picked -- long after the toolbar captured this handler. Read
  // it through a ref as well, otherwise the stale value silently skipped or
  // misapplied the "insufficient balance" check.
  const leaveBalanceRef = useRef(leaveBalance);

  useEffect(() => {
    leaveBalanceRef.current = leaveBalance;
  }, [leaveBalance]);

  /* ================= EMPLOYEE SCOPE ================= */
  // loadScope/autoSetEmployee setState after awaited API responses; the
  // compiler rule conservatively flags any setState-reaching call from an
  // effect.
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
    setLoading(true);
    try {
      const res = await get(`resource/Leave Application/${name}`);
      const d = res.data;

      const loaded = {
        employee: d.employee || "",
        leave_approver: d.leave_approver || "",
        leave_type: d.leave_type || "",
        from_date: d.from_date || "",
        to_date: d.to_date || "",
        half_day: d.half_day || 0,
        description: d.description || "",

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

    } catch {
      setError(t("requests.leave.loadFailed"));
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

  /* ================= APPROVER ================= */
  // fetchApprovers setState after awaited API responses; the compiler rule
  // conservatively flags any setState-reaching call from an effect.
  async function fetchApprovers(employee) {
    if (!employee) return;

    const { approvers: list, error: message } = await fetchNamedApprovers(
      employee,
      "Leave Application",
    );

    setApprovers(list);
    setApproverError(list.length ? "" : message);

    setDoc((prev) => {
      // Keep the current approver if it is still a valid named approver.
      const stillValid = list.some((a) => a.value === prev.leave_approver);
      if (stillValid) return prev;

      return {
        ...prev,
        // Auto-select when there is exactly one option, otherwise leave blank
        // so the user makes an explicit choice.
        leave_approver: list.length === 1 ? list[0].value : "",
      };
    });
  }

  useEffect(() => {
    if (doc.employee) {
       
    // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchApprovers(doc.employee);
    }
  }, [doc.employee]);

  /* ================= LEAVE DETAILS ================= */
  // fetchLeaveDetails setStates after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function fetchLeaveDetails() {
    try {
      const res = await post(
        "method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
        { employee: doc.employee, date: doc.from_date },
      );

      // HRMS returns balances keyed by leave type under `leave_allocation`;
      // there is no `leave_balance` key at all. The old code read
      // `res.message.leave_balance || 0`, which always yielded 0, and the
      // balance check (`totalDays > leaveBalance`) then rejected EVERY
      // request with "Insufficient leave balance".
      const allocation = res.message?.leave_allocation || {};
      const entry = allocation[doc.leave_type];

      // A leave type with no allocation row (e.g. Leave Without Pay) has
      // nothing to validate against -- keep `null` so the balance check is
      // skipped rather than failing against a fake zero.
      setLeaveBalance(entry ? (entry.remaining_leaves ?? 0) : null);
    } catch {
      setLeaveBalance(null);
    }
  }

  useEffect(() => {
    if (doc.employee && doc.from_date) {
       
    // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchLeaveDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.employee, doc.leave_type, doc.from_date]);

  /* ================= DAYS ================= */
  const getTotalDays = (d = doc) => {
    if (!d.from_date || !d.to_date) return 0;

    const from = new Date(d.from_date);
    const to = new Date(d.to_date);

    let days = (to - from) / (1000 * 60 * 60 * 24) + 1;

    if (d.half_day) days -= 0.5;

    return days;
  };

  const totalDays = getTotalDays();

  /* ================= VALIDATION ================= */
  // `d` defaults to the live document held in `docRef`. The Save button lives in
  // the page header, which captures `handleSave` once per header effect -- and
  // that effect deliberately does not depend on `doc` (re-running it on every
  // keystroke would thrash the header). Without the ref, Save validated the
  // document as it looked on the first render, so everything the user typed
  // after mount was invisible and they were told Leave Type / From Date / To
  // Date were required.
  const validate = (d = docRef.current) => {
    const errs = {};

    if (!d.employee) {
      errs.employee = t("common.fieldRequired", {
        field: t("requests.leave.employee"),
      });
    }
    if (!d.leave_type) {
      errs.leave_type = t("common.fieldRequired", {
        field: t("requests.leave.leaveType"),
      });
    }
    if (!d.from_date) {
      errs.from_date = t("common.fieldRequired", {
        field: t("requests.leave.fromDate"),
      });
    }
    if (!d.to_date) {
      errs.to_date = t("common.fieldRequired", {
        field: t("requests.leave.toDate"),
      });
    }
    if (!d.leave_approver) {
      errs.leave_approver = t("requests.leave.validationApprover");
    }
    if (d.from_date && d.to_date && d.to_date < d.from_date) {
      errs.to_date = t("requests.leave.validationRange");
    }

    const days = getTotalDays(d);
    if (
      leaveBalanceRef.current !== null &&
      days > leaveBalanceRef.current &&
      !errs.to_date &&
      !errs.from_date
    ) {
      errs.from_date = t("requests.leave.validationBalance");
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

    setError("");
    setLoading(true);
    try {
      if (isEdit) {
        await saveDocument({
          doctype: "Leave Application",
          name,
          doc: current,
        });
        setDirty(false);
        toast.success(t("requests.leave.updatedSuccess"));
        // The <Toaster /> is mounted by ToastProvider above the router, so this
        // confirmation stays visible on the page we land on.
        navigate("/requests/leave");
      } else {
        const res = await saveDocument({
          doctype: "Leave Application",
          doc: current,
        });
        setDirty(false);
        toast.success(t("requests.leave.createdSuccess"));
        // Land on the saved document rather than the list: a new form offers
        // Save only, so this is where Submit (or the Workflow transitions)
        // becomes reachable without reopening the document by hand.
        navigate(`/requests/leave/${res?.data?.name}`);
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
  // A submitted document is fully locked; otherwise only self-only users are
  // pinned to their own Employee. An unconfigured approver must NOT disable the
  // whole form -- it should only block saving, so the rest stays editable.
  const isDisabled = isSubmitted;
  const employeeLocked = isSubmitted || isEmployeeLocked(scope);
  const approverMissing = !doc.leave_approver;
  const canSave = !isDisabled && !approverMissing;

  // HRMS refuses to submit a leave that is still "Open" or already "Cancelled"
  // (LeaveApplication.on_submit). With a Workflow the transition action
  // replaces Submit, so this only governs the plain no-Workflow path.
  const canSubmitLeave = canSubmitDocument({ doctype: "Leave Application", doc });

  const { showSubmit, showTransitions } = resolveForwardActions({
    isEdit,
    isSubmitted,
    isDirty: dirty,
    hasWorkflow,
    workflowChecked,
    transitionCount: transitions.length,
    canSubmit: canSubmitLeave,
  });

  // Only worth explaining when the status is the reason Submit is missing.
  const awaitingApproval =
    isEdit && !isSubmitted && !dirty && workflowChecked && !hasWorkflow && !canSubmitLeave;

  // No Workflow means the approver is the only thing that can move `status`, and
  // `approveLeaveAction` is what lets them do it here.
  const { showApprove, showReject } = resolveLeaveApprovalActions({
    isEdit,
    isSubmitted,
    isDirty: dirty,
    hasWorkflow,
    workflowChecked,
    currentUser,
    leaveApprover: doc.leave_approver,
  });

  /* ================= WORKFLOW PROBE ================= */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const meta = await getApprovalMeta("Leave Application");
      if (cancelled) return;
      setHasWorkflow(Boolean(meta?.hasWorkflow));
      // Until this resolves we cannot tell a Workflow doctype from a plain
      // one, and offering Submit on a Workflow doctype would bypass its first
      // state. `workflowChecked` gates the button so it never flashes.
      setWorkflowChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // `get_transitions` needs a saved document: it returns [] for a new one
  // because there is no current state to transition from yet.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { actions } = name
        ? await getWorkflowActions({
            doc: { doctype: "Leave Application", name },
          })
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
   * Only ever reached for a saved, unmodified document: Submit is not offered on
   * a new form, so there is no save-first branch here. `submitDocument` submits
   * the document the SERVER holds, which is what both paths require -- a partial
   * form payload would fail Frappe's mandatory-field validation, and
   * `apply_workflow` reloads from the database regardless.
   */
  const handleSubmit = async (action = null) => {
    const result = validate(docRef.current);
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }

    // Defence in depth. The button is already hidden for this case, but the
    // stored document is what gets submitted, so re-check against live state
    // rather than trusting the rendered button -- and say why, instead of
    // firing a request that can only come back as a server-side throw.
    if (!action && !canSubmitDocument({ doctype: "Leave Application", doc: docRef.current })) {
      const message = t("requests.leave.awaitingApproval");
      toast.error(message);
      setError(message);
      return;
    }

    const labelKey = action ? workflowActionLabelKey(action) : null;
    const label = labelKey ? t(labelKey) : action || t("common.submit");

    setSubmitting(true);
    setError("");

    try {
      await submitDocument({ doctype: "Leave Application", name, action });
      toast.success(t("common.submittedSuccess", { name: label }));
      navigate("/requests/leave");
    } catch (e) {
      const message = e?.message || t("common.submitFailed");
      toast.error(message);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ================= APPROVE / REJECT (no Workflow only) ================= */
  /**
   * Move the stored document's `status`, then reload.
   *
   * The reload is not cosmetic: approving is what unlocks Submit, so without it
   * the approver would set status server-side and still be looking at the stale
   * "Open" badge with no Submit button. `loadDoc` also clears the dirty flag,
   * since the approval acted on the saved document.
   */
  const handleApproval = async (status) => {
    setApproving(true);
    setError("");

    try {
      await setLeaveApprovalStatus({ name, status });
      await loadDoc();
      toast.success(
        status === LEAVE_APPROVED
          ? t("requests.leave.approveSuccess")
          : t("requests.leave.rejectSuccess"),
      );
    } catch (e) {
      const message = e?.message || t("requests.leave.approvalFailed");
      toast.error(message);
      setError(message);
    } finally {
      setApproving(false);
      setRejectOpen(false);
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
      await cancelDocument({ doctype: "Leave Application", name });
      await loadDoc();
      toast.success(t("common.cancelledSuccess", { name }));
    } catch (e) {
      const message = e?.message || t("common.cancelFailed");
      toast.error(message);
      setError(message);
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  }

  /* ================= DELETE ================= */
  // Deliberately always offered on an existing document: whether the signed-in
  // user may delete it is the server's call. `frappe.client.delete` raises
  // PermissionError (or "Cannot delete a submitted document") and that message
  // is shown as-is, so an unprivileged user finds out why rather than being
  // quietly given a button that silently does nothing.
  function handleDelete() {
    if (!isEdit || !name) return;
    setConfirmOpen(true);
  }

  /** Runs only after the user confirms in the modal. */
  async function confirmDelete() {
    if (!isEdit || !name) return;

    setDeleting(true);
    setLoading(true);
    try {
      await deleteDocument({ doctype: "Leave Application", name });

      toast.success(
        t("common.deletedSuccess", {
          name: t("requests.leave.doctypeName"),
        }),
      );
      navigate("/requests/leave");
    } catch (e) {
      toast.error(e?.message || t("common.deleteFailed"));
      // Keep the reason on the page too, in case the toast is missed.
      setError(e?.message || t("common.deleteFailed"));
    } finally {
      setDeleting(false);
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      status,
      title: isEdit
        ? t("requests.header.leaveEditTitle", { name })
        : t("requests.header.leaveNewTitle"),
      subtitle: isEdit
        ? t("requests.header.leaveEditSubtitle")
        : t("requests.header.leaveNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.requests"), path: "/requests" },
        { label: t("requests.header.leaveListTitle"), path: "/requests/leave" },
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

        // Workflow transitions replace Submit entirely. Labels come from the
        // backend's Action Master; anything unrecognised is shown verbatim so an
        // admin-authored workflow is never mistranslated.
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

        // No Workflow, so the approver is the only party who can move `status`
        // and therefore the only one who can enable Submit. Appears before
        // Submit so the causal order reads left to right: approve, then submit.
        showApprove && {
          label: approving ? t("common.saving") : t("requests.action.approve"),
          variant: "btn-primary",
          disabled: loading || submitting || approving,
          onClick: () => handleApproval(LEAVE_APPROVED),
        },

        showReject && {
          label: t("requests.action.reject"),
          variant: "btn-outline-danger",
          disabled: loading || submitting || approving,
          onClick: () => setRejectOpen(true),
        },

        // Plain doctype lifecycle, offered only once we know no Workflow exists.
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
          onClick: () => navigate("/requests/leave"),
        },

        // Cancel the stored document (docstatus 1 -> 2). This is a real
        // lifecycle change, confirmed before it runs.
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
    canSave,
    submitting,
    hasWorkflow,
    transitions,
    status,
    workflowChecked,
    dirty,
    showSubmit,
    showTransitions,
    showApprove,
    showReject,
    approving,
    cancelling,
    showBack,
    showCancel,
    showDelete,
    currentUser,
  ]);

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-3 pt-4">
      <ConfirmDialog
        open={rejectOpen}
        loading={approving}
        title={t("requests.leave.rejectConfirmTitle")}
        message={t("requests.leave.rejectConfirmBody")}
        confirmLabel={t("requests.action.reject")}
        onCancel={() => {
          if (!approving) setRejectOpen(false);
        }}
        onConfirm={() => handleApproval(LEAVE_REJECTED)}
      />

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
          name: t("requests.leave.doctypeName"),
        })}
      />

      <ConfirmDialog
        open={confirmOpen}
        loading={deleting}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        onConfirm={confirmDelete}
        message={t("common.deleteConfirm", {
          name: t("requests.leave.doctypeName"),
        })}
      />

      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {awaitingApproval && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-700 dark:text-sky-400"
        >
          {t("requests.leave.awaitingApproval")}
        </div>
      )}

      {approverError && !isSubmitted && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400"
        >
          {approverError}
        </div>
      )}

      <FormSection
        title={t("requests.leave.sectionDetails")}
        icon={CalendarDays}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        <div className="md:col-span-2">
          <FormField
            label={t("requests.leave.employee")}
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
                onChange={(v) => updateField("employee", v)}
              />
            )}
          </FormField>
        </div>

        <div className="md:col-span-2">
          <FormField
            label={t("requests.leave.approver")}
            required
            name="leave_approver"
            error={fieldErrors.leave_approver}
          >
            {isDisabled ? (
              <Input value={doc.leave_approver || ""} disabled readOnly />
            ) : (
              <FormSelect
                value={doc.leave_approver}
                placeholder={t("requests.leave.selectApprover")}
                onChange={(v) => updateField("leave_approver", v)}
                options={[
                  // Keep the stored approver visible even if they are no longer
                  // in the configured list (e.g. a submitted legacy document).
                  ...(doc.leave_approver &&
                  !approvers.some((a) => a.value === doc.leave_approver)
                    ? [
                        {
                          value: doc.leave_approver,
                          label: doc.leave_approver,
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
          </FormField>
        </div>

        <div className="md:col-span-2">
          <FormField
            label={t("requests.leave.leaveType")}
            required
            name="leave_type"
            error={fieldErrors.leave_type}
          >
            {isSubmitted ? (
              <Input value={doc.leave_type} disabled />
            ) : (
              <LinkField
                doctype="Leave Type"
                value={doc.leave_type}
                disabled={isDisabled}
                onChange={(v) => updateField("leave_type", v)}
              />
            )}

            {leaveBalance !== null && !fieldErrors.leave_type && (
              <small className="text-xs text-emerald-600 dark:text-emerald-400">
                {t("requests.leave.balance", { days: leaveBalance })}
              </small>
            )}
          </FormField>
        </div>

        <div className="md:col-span-1">
          <FormField
            label={t("requests.leave.fromDate")}
            required
            name="from_date"
            error={fieldErrors.from_date}
          >
            <Input
              type="date"
              disabled={isDisabled}
              value={doc.from_date}
              onChange={(e) => updateField("from_date", e.target.value)}
            />
          </FormField>
        </div>

        <div className="md:col-span-1">
          <FormField
            label={t("requests.leave.toDate")}
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
        </div>

        <div className="md:col-span-1">
          <FormField label={t("common.status")} name="status">
            <FormSelect
              value={doc.status || "Open"}
              onChange={(v) => updateField("status", v)}
              // With a Workflow configured, `apply_workflow` rewrites `status`
              // from the next state's update_value on EVERY transition, so
              // anything typed here would be overwritten the moment the document
              // moves. Read-only in that case; still editable with no Workflow,
              // which is the only situation where a human has to set it.
              disabled={hasWorkflow || isSubmitted || loading || submitting}
              options={[
                { value: "Open", label: "Open" },
                { value: "Approved", label: "Approved" },
                { value: "Rejected", label: "Rejected" },
                { value: "Cancelled", label: "Cancelled" },
              ]}
            />
          </FormField>
        </div>

        {totalDays > 0 && (
          <div className="md:col-span-4">
            <small className="text-xs text-primary">
              {t("requests.leave.totalDays", { days: totalDays })} ·{" "}
              {t("requests.leave.remaining", {
                days: leaveBalance !== null ? leaveBalance - totalDays : "-",
              })}
            </small>
          </div>
        )}
      </FormSection>

      <FormSection
        title={t("requests.leave.sectionNotes")}
        icon={FileText}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <FormField label={t("requests.leave.halfDay")} name="half_day">
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={doc.half_day ? "default" : "outline"}
              disabled={isDisabled}
              onClick={() => updateField("half_day", 1)}
            >
              {t("common.yes")}
            </Button>

            <Button
              type="button"
              size="sm"
              variant={!doc.half_day ? "default" : "outline"}
              disabled={isDisabled}
              onClick={() => updateField("half_day", 0)}
            >
              {t("common.no")}
            </Button>
          </div>
        </FormField>

        <FormField label={t("requests.leave.reason")} name="description">
          <Textarea
            disabled={isDisabled}
            rows={3}
            value={doc.description}
            onChange={(e) => updateField("description", e.target.value)}
          />
        </FormField>
      </FormSection>
    </div>
  );
}
