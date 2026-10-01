import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle,
  ExternalLink,
  Eye,
  FileText,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { get, post } from "../../../services/api";
import { useToast } from "../../../context/ToastContext";
import AppModal from "../../AppModal";
import PreviewRenderer from "./PreviewRenderer";
import RightDrawer from "../../RightDrawer";
import { Button } from "@/components/ui/button";
import { getApprovalMeta, getApprovalStates } from "../../../lib/approvalMeta";

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
    showTerms: true,
  },
  Quotation: {
    type: "submit",
    titleKey: "approvals.preview.quotationApproval",
    showTerms: true,
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
  const [mode, setMode] = useState("preview");
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [workflowActions, setWorkflowActions] = useState([]);
  const [states, setStates] = useState({
    source: "unknown",
    fieldname: null,
    states: [],
  });
  const [isSubmittable, setIsSubmittable] = useState(false);

  const loadWorkflowActions = async () => {
    // Without a document name there is nothing to fetch transitions for.
    if (!doc?.name) {
      setWorkflowActions([]);
      return;
    }

    try {
      // ✅ fetch full doc
      const full = await get(
        `resource/${doctype}/${encodeURIComponent(doc.name)}`,
      );

      const res = await post("method/frappe.model.workflow.get_transitions", {
        doc: JSON.stringify(full.data),
      });

      const actions = res.message || [];

      // 🔥 1. deduplicate
      const unique = Object.values(
        actions.reduce((acc, a) => {
          if (!acc[a.action]) acc[a.action] = a;
          return acc;
        }, {}),
      );

      // 🔥 2. sort (Reject first, Approve last)
      const sorted = unique.sort((a, b) => {
        const aVal = a.action.toLowerCase();
        const bVal = b.action.toLowerCase();

        if (aVal.includes("reject")) return -1;
        if (bVal.includes("reject")) return 1;

        if (aVal.includes("approve")) return 1;
        if (bVal.includes("approve")) return -1;

        return 0;
      });

      setWorkflowActions(sorted);
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
   * Submitting is ERPNext's native approve step: each doctype's `on_submit`
   * moves its own status/approval_status forward (Purchase Order ->
   * "To Receive and Bill", Leave Application -> "Approved", Expense Claim ->
   * approval_status "Approved"). We call Frappe's own client endpoints rather
   * than writing status directly, so all server-side validation, permissions
   * and status transitions apply unchanged.
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

      if (action === "save" || action === "submit") {
        await post(`method/frappe.client.${action}`, {
          doc: JSON.stringify(full.data),
        });
      } else {
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
    if (action === "delete") {
      const ok = window.confirm(t("common.deleteConfirm", { name: doctype }));
      if (!ok) return;
    }
    handleDefaultAction(action);
  };

  const handleWorkflowAction = async (workflowAction) => {

    if (!doc?.name) return;

    try {
      setLoading(true);

      // always fetch fresh doc
      const full = await get(
        `resource/${doctype}/${encodeURIComponent(doc.name)}`,
      );

      await post("method/frappe.model.workflow.apply_workflow", {
        doc: JSON.stringify(full.data),
        action: workflowAction, // EXACT value
      });

      onSuccess && onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || t("approvals.workflowFailed"));
    } finally {
      setLoading(false);
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
      : DEFAULT_ACTIONS_BY_DOCSTATUS[Number(doc.docstatus) || 0] || [];

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

            {/* TERMS (ONLY IF CONFIG ENABLED) */}
            {config.showTerms && (
              <Button
                variant="outline"
                onClick={() => setShowTerms((s) => !s)}
                disabled={!doc.terms}
                title={t("approvals.terms")}
              >
                <FileText />
                <span className="hidden md:inline">{t("approvals.terms")}</span>
              </Button>
            )}

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
            {workflowActions.length > 0 ? (
              workflowActions.map((a) => {
                const isReject = a.action.toLowerCase().includes("reject");
                return (
                  <Button
                    key={a.action}
                    variant={isReject ? "destructive" : "default"}
                    className={
                      isReject
                        ? undefined
                        : "bg-emerald-600 text-white hover:bg-emerald-600/85"
                    }
                    disabled={loading}
                    onClick={() => handleWorkflowAction(a.action)}
                  >
                    {isReject ? <XCircle /> : <CheckCircle />}
                    {/* Workflow transition labels come from the backend. */}
                    <span className="hidden md:inline">{a.action}</span>
                  </Button>
                );
              })
            ) : defaultActions.length > 0 ? (
              /* No Workflow on this doctype: offer the doctype's own default
                 document actions for its current docstatus. */
              defaultActions.map((action) => {
                const meta = DEFAULT_ACTION_META[action];
                const Icon = meta.icon;
                const isPrimary = action === "submit";
                return (
                  <Button
                    key={action}
                    variant={
                      meta.destructive ? "destructive" : isPrimary ? "default" : "outline"
                    }
                    className={
                      isPrimary
                        ? "bg-emerald-600 text-white hover:bg-emerald-600/85"
                        : undefined
                    }
                    disabled={loading}
                    onClick={() => runDefaultAction(action)}
                  >
                    <Icon />
                    <span className="hidden md:inline">
                      {t(meta.labelKey)}
                    </span>
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

        {/* TERMS DRAWER */}
        {config.showTerms && doc.terms && (
          <RightDrawer
            show={showTerms}
            onClose={() => setShowTerms(false)}
            title={t("approvals.termsAndConditions")}
            width="lg"
          >
            <div
              className="break-words text-sm leading-relaxed text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: doc.terms }}
            />
          </RightDrawer>
        )}
      </div>
    </AppModal>
  );
}
