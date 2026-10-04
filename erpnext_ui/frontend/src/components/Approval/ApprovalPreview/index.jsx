import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle,
  ExternalLink,
  Eye,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { get, post } from "../../../services/api";
import { useToast } from "../../../context/ToastContext";
import { useRole } from "../../../context/RoleContext";
import AppModal from "../../AppModal";
import PreviewRenderer from "./PreviewRenderer";
import { Button } from "@/components/ui/button";
import { getApprovalMeta, getApprovalStates } from "../../../lib/approvalMeta";
import {
  canSubmitDocument,
  getWorkflowActions,
  saveDocument,
  submitDocument,
} from "../../../lib/docTransition";
import {
  LEAVE_APPROVED,
  LEAVE_REJECTED,
  resolveLeaveApprovalActions,
  setLeaveApprovalStatus,
} from "../../../lib/leaveApproval";
import ConfirmDialog from "../../ConfirmDialog";

/* ===============================
   CONFIG
=============================== */

/**
 * Document actions offered when a doctype has no Workflow configured, keyed by
 * `docstatus` so we mirror Frappe's own state machine:
 *
 *   Draft (0)     -> Submit, Save, Delete
 *   Submitted (1) -> Cancel
 *   Cancelled (2) -> Delete
 *
 * Delete is deliberately absent for submitted documents: Frappe refuses it with
 * "Submitted Record cannot be deleted. You must Cancel it first", so Cancel is
 * the only way forward from that state.
 *
 * Frappe enforces permissions (`write` / `submit` / `cancel` / `delete`) and the
 * docstatus transition on the server, so this only decides what to render.
 */
const DEFAULT_ACTIONS_BY_DOCSTATUS = {
  0: ["submit", "save", "delete"],
  1: ["cancel"],
  2: ["delete"],
};

const DEFAULT_ACTION_META = {
  submit: { icon: CheckCircle, labelKey: "common.submit", destructive: false },
  save: { icon: Save, labelKey: "common.save", destructive: false },
  cancel: { icon: XCircle, labelKey: "common.cancel", destructive: true },
  delete: { icon: Trash2, labelKey: "common.delete", destructive: true },
};

const APPROVAL_CONFIG = {
  "Leave Application": {
    type: "workflow",
    titleKey: "approvals.preview.leaveApproval",
  },

  "Expense Claim": {
    type: "workflow", // if workflow exists (likely yes)
    titleKey: "approvals.preview.expenseApproval",
  },

  "Purchase Order": {
    type: "submit",
    titleKey: "approvals.preview.purchaseOrderApproval",
  },
  Quotation: {
    type: "submit",
    titleKey: "approvals.preview.quotationApproval",
  },
  "Overtime Log": {
    type: "workflow",
    titleKey: "approvals.preview.overtimeApproval",
  },
};

export default function ApprovalPreview({
  show,
  onClose,
  doc,
  doctype,
  onSuccess,
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { currentUser } = useRole();
  const [mode, setMode] = useState("preview");
  const [loading, setLoading] = useState(false);
  const [workflowActions, setWorkflowActions] = useState([]);
  const [states, setStates] = useState({
    source: "unknown",
    fieldname: null,
    states: [],
  });
  const [isSubmittable, setIsSubmittable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  /**
   * Transitions this user may run right now.
   *
   * The fetching, deduplication and ordering all live in `docTransition`, so
   * this screen and the request forms cannot drift apart.
   */
  const loadWorkflowActions = async () => {
    // Without a document name there is nothing to fetch transitions for.
    if (!doc?.name) {
      setWorkflowActions([]);
      return;
    }

    try {
      // get_transitions needs the full document, not the preview payload.
      const full = await get(
        `resource/${doctype}/${encodeURIComponent(doc.name)}`,
      );
      const { actions } = await getWorkflowActions({ doc: full?.data || doc });
      setWorkflowActions(actions);
    } catch (e) {
      console.error("Failed to load workflow", e);
      setWorkflowActions([]);
    }
  };

  useEffect(() => {
    if (show && doc?.name) {
      // loadWorkflowActions setStates only after awaited API responses;
      // the compiler rule conservatively flags setState-reaching calls.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadWorkflowActions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, doc]);

  // Which states this doctype actually offers. When no Workflow is configured
  // this falls back to the doctype's own status column, and then to the default
  // docstatus lifecycle, so the approval UI still has something meaningful.
  useEffect(() => {
    let cancelled = false;

    const loadStates = async () => {
      const meta = await getApprovalMeta(doctype);
      const resolved = getApprovalStates(meta);
      if (!cancelled) {
        setStates(resolved);
        setIsSubmittable(Boolean(meta?.isSubmittable));
      }
    };

    loadStates();

    return () => {
      cancelled = true;
    };
  }, [doctype]);

  if (!doc) return null;

  const config = APPROVAL_CONFIG[doctype] || {
    titleKey: null,
  };

  const title = config.titleKey
    ? t(config.titleKey)
    : t("approvals.preview.doctypeApproval", { doctype });

  /* ===============================
     GENERIC ACTION HANDLER
  =============================== */

  /**
   * Default document actions for doctypes with no Workflow.
   *
   * Submitting is NOT ERPNext's native approve step, though it looks like it.
   * For Purchase Order and Expense Claim, `on_submit` does advance the outcome
   * (Expense Claim's approval_status becomes "Approved"), so Submit doubles as
   * approval there. Leave Application is the exception and inverts it: HRMS's
   * `LeaveApplication.on_submit` throws unless `status` is ALREADY "Approved" or
   * "Rejected", so submitting an "Open" leave can only fail. That is why the
   * default action list is filtered through `canSubmitDocument`, and why leave
   * gets an explicit Approve/Reject pair instead (see `lib/leaveApproval`).
   *
   * We call Frappe's own client endpoints rather than writing status directly,
   * so all server-side validation, permissions and status transitions apply
   * unchanged.
   *
   * Note the differing signatures: `save` / `submit` take the whole document,
   * while `cancel` / `delete` are addressed by doctype + name.
   */
  const handleDefaultAction = async (action) => {
    if (!doc?.name) return;

    try {
      setLoading(true);

      const full = await get(
        `resource/${doctype}/${encodeURIComponent(doc.name)}`,
      );
      const name = full?.data?.name || doc.name;

      if (action === "save") {
        // PUT for an existing document -- POST here is not an update.
        await saveDocument({ doctype, name, doc: full.data });
      } else if (action === "submit") {
        await submitDocument({ doctype, name });
      } else {
        // cancel / delete are addressed by doctype + name.
        await post(`method/frappe.client.${action}`, { doctype, name });
      }

      onSuccess && onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || t("approvals.actionFailed"));
    } finally {
      setLoading(false);
    }
  };

  const runDefaultAction = (action) => {
    // Deleting is irreversible, so it gets a real dialog instead of a native
    // alert that ignores the app's theme and RTL direction.
    if (action === "delete") {
      setConfirmDelete(true);
      return;
    }
    handleDefaultAction(action);
  };

  const handleWorkflowAction = async (workflowAction) => {
    if (!doc?.name) return;

    try {
      setLoading(true);

      // Fetches the current document and drives `apply_workflow` with the
      // exact Action Master value, which is what actually advances the state.
      await submitDocument({ doctype, name: doc.name, action: workflowAction });

      onSuccess && onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || t("approvals.workflowFailed"));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Move a leave's `status` when no Workflow exists.
   *
   * Without a Workflow nothing else advances the status, and submitting is
   * refused until it is Approved/Rejected -- so the approver has to be able to
   * make that call from the approval screen, not only from the leave form.
   */
  const handleLeaveApproval = async (status) => {
    if (!doc?.name) return;

    try {
      setLoading(true);
      await setLeaveApprovalStatus({ name: doc.name, status });
      toast.success(
        status === LEAVE_APPROVED
          ? t("requests.leave.approveSuccess")
          : t("requests.leave.rejectSuccess"),
      );
      onSuccess && onSuccess();
      onClose();
    } catch (e) {
      toast.error(e?.message || t("requests.leave.approvalFailed"));
    } finally {
      setLoading(false);
      setConfirmReject(false);
    }
  };

  // The state this document is in, taken from whichever column this doctype
  // actually has.
  const currentState =
    doc.workflow_state ||
    doc[states.fieldname] ||
    (states.source === "docstatus"
      ? { 0: "Draft", 1: "Submitted", 2: "Cancelled" }[doc.docstatus]
      : "") ||
    "";

  // A Workflow exists but this user simply has no transitions available, so we
  // must NOT fall back to raw document actions - respect the Workflow's
  // permissions and let the backend transitions stand.
  const usesWorkflow = states.source === "workflow" || workflowActions.length > 0;

  const defaultActions =
    usesWorkflow || !isSubmittable
      ? []
      : (DEFAULT_ACTIONS_BY_DOCSTATUS[Number(doc.docstatus) || 0] || []).filter(
          // Drop Submit where the doctype would refuse it. Offering a button that
          // can only fail is worse than omitting it: it reads as a broken app
          // rather than as "this document is not ready yet".
          (action) => action !== "submit" || canSubmitDocument({ doctype, doc }),
        );

  /**
   * Approve/Reject for a leave with no Workflow.
   *
   * The preview always renders the stored document, so `isDirty` is false by
   * construction. `states.source` settles to "status" or "docstatus" once the
   * probe resolves, which is what `workflowChecked` means here: showing these
   * before we know a Workflow is absent would let someone bypass its conditions.
   */
  const approvalActions = resolveLeaveApprovalActions({
    isEdit: Boolean(doc?.name),
    isSubmitted: Number(doc?.docstatus) > 0,
    isDirty: false,
    hasWorkflow: usesWorkflow,
    workflowChecked: states.source !== "unknown",
    currentUser,
    leaveApprover: doc?.leave_approver,
  });

  /**
   * One flat list for the footer.
   *
   * Built as data because the three sources have different shapes (Workflow
   * action names are admin-authored and shown verbatim, default actions are
   * translated label keys), and rendering them in one map is what keeps a dead
   * button from appearing inside a nested branch.
   */
  const footerActions = [];

  // Approve first, then Reject: matches the leave form, and reading order is
  // "accept" then "refuse".
  if (approvalActions.showApprove) {
    footerActions.push({
      key: "leave:approve",
      label: t("requests.action.approve"),
      icon: CheckCircle,
      primary: true,
      run: () => handleLeaveApproval(LEAVE_APPROVED),
    });
  }

  if (approvalActions.showReject) {
    footerActions.push({
      key: "leave:reject",
      label: t("requests.action.reject"),
      icon: XCircle,
      destructive: true,
      run: () => setConfirmReject(true),
    });
  }

  if (workflowActions.length > 0) {
    for (const a of workflowActions) {
      const isReject = a.action.toLowerCase().includes("reject");
      footerActions.push({
        key: `workflow:${a.action}`,
        // Workflow transition labels come from the backend, verbatim.
        label: a.action,
        icon: isReject ? XCircle : CheckCircle,
        destructive: isReject,
        primary: !isReject,
        run: () => handleWorkflowAction(a.action),
      });
    }
  } else {
    for (const action of defaultActions) {
      const meta = DEFAULT_ACTION_META[action];
      footerActions.push({
        key: `default:${action}`,
        label: t(meta.labelKey),
        icon: meta.icon,
        destructive: meta.destructive,
        primary: action === "submit",
        run: () => runDefaultAction(action),
      });
    }
  }

  return (
  <AppModal
      show={show}
      onClose={onClose}
      title={title}
      width="full"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {/* LEFT */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setMode((m) => (m === "preview" ? "details" : "preview"))
              }
              title={
                mode === "preview"
                  ? t("approvals.showDetails")
                  : t("approvals.showPreview")
              }
            >
              <Eye />
              <span className="hidden md:inline">
                {mode === "preview"
                  ? t("approvals.showDetails")
                  : t("approvals.showPreview")}
              </span>
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                window.open(`/app/${doctype}/${doc.name}`, "_blank")
              }
              title={t("approvals.openFull")}
            >
              <ExternalLink />
              <span className="hidden md:inline">
                {t("approvals.openFull")}
              </span>
            </Button>
          </div>

          {/* RIGHT */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {footerActions.length > 0 ? (
              footerActions.map((a) => {
                const Icon = a.icon;
                return (
                  <Button
                    key={a.key}
                    variant={
                      a.destructive
                        ? "destructive"
                        : a.primary
                          ? "default"
                          : "outline"
                    }
                    className={
                      a.primary && !a.destructive
                        ? "bg-emerald-600 text-white hover:bg-emerald-600/85"
                        : undefined
                    }
                    disabled={loading}
                    onClick={a.run}
                  >
                    <Icon />
                    <span className="hidden md:inline">{a.label}</span>
                  </Button>
                );
              })
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t("approvals.noActions")}</span>
                {currentState && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                    {currentState}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      }
    >
      {/* CONTENT */}
      <div className="relative h-full">
        {/* PREVIEW */}
        {mode === "preview" && (
          <div className="h-full">
            <PreviewRenderer doctype={doctype} doc={doc} />
          </div>
        )}

        {/* DETAILS */}
        {mode === "details" && (
          <div className="flex max-h-full flex-col gap-4 overflow-auto">
            {Object.entries(doc).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  {key}
                </div>
                <div className="text-sm">{String(value || "-")}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    <ConfirmDialog
      open={confirmReject}
      onCancel={() => {
        if (!loading) setConfirmReject(false);
      }}
      onConfirm={() => handleLeaveApproval(LEAVE_REJECTED)}
      title={t("requests.leave.rejectConfirmTitle")}
      message={t("requests.leave.rejectConfirmBody")}
      confirmLabel={t("requests.action.reject")}
      loading={loading}
    />

    <ConfirmDialog
      open={confirmDelete}
      onCancel={() => setConfirmDelete(false)}
      onConfirm={() => {
        setConfirmDelete(false);
        handleDefaultAction("delete");
      }}
      title={t("common.deleteConfirmTitle")}
      message={t("common.deleteConfirm", { name: doctype })}
      loading={loading}
    />
    </AppModal>
  );
}
