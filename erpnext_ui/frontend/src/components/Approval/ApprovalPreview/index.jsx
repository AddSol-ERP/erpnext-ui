import { useEffect, useState } from "react";
import { get, post } from "../../../services/api";
import AppModal from "../../AppModal";
import PreviewRenderer from "./PreviewRenderer";
import RightDrawer from "../../RightDrawer";

/* ===============================
   CONFIG
================================ */

const APPROVAL_CONFIG = {
  "Leave Application": {
    type: "workflow",
    title: "Leave Approval",
  },

  "Expense Claim": {
    type: "workflow", // if workflow exists (likely yes)
    title: "Expense Approval",
  },

  "Purchase Order": {
    type: "submit",
    title: "Purchase Order Approval",
    showTerms: true,
  },
  Quotation: {
    type: "submit",
    title: "Quotation Approval",
    showTerms: true,
  },
  "Overtime Log": {
    type: "workflow",
    title: "Overtime Approval",
  },
};

export default function ApprovalPreview({
  show,
  onClose,
  doc,
  doctype,
  onSuccess,
}) {
  const [mode, setMode] = useState("preview");
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [workflowActions, setWorkflowActions] = useState([]);

  useEffect(() => {
    if (show && doc) {
      loadWorkflowActions();
    }
  }, [show, doc]);
  if (!doc) return null;

  const loadWorkflowActions = async () => {
    try {
      // ✅ fetch full doc
      const full = await get(`resource/${doctype}/${doc.name}`);

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

  const config = APPROVAL_CONFIG[doctype] || {
    title: `${doctype} Approval`,
  };

  /* ===============================
     GENERIC ACTION HANDLER
  ============================== */

  const handleWorkflowAction = async (workflowAction) => {
    try {
      setLoading(true);

      // always fetch fresh doc
      const full = await get(`resource/${doctype}/${doc.name}`);

      await post("method/frappe.model.workflow.apply_workflow", {
        doc: JSON.stringify(full.data),
        action: workflowAction, // EXACT value
      });

      onSuccess && onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert(e?.message || "Workflow failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={config.title}
      width="lg"
      footer={
        <div className="d-flex justify-content-between w-100 flex-wrap gap-2">
          {/* LEFT */}
          <div className="d-flex gap-2 flex-wrap">
            <button
              className="btn btn-outline-primary d-flex align-items-center gap-1"
              onClick={() =>
                setMode((m) => (m === "preview" ? "details" : "preview"))
              }
              title={mode === "preview" ? "Details" : "Preview"}
            >
              <i className="bi bi-eye"></i>
              <span className="d-none d-md-inline">
                {mode === "preview" ? "Details" : "Preview"}
              </span>
            </button>

            {/* TERMS (ONLY IF CONFIG ENABLED) */}
            {config.showTerms && (
              <button
                className="btn btn-outline-primary d-flex align-items-center gap-1"
                onClick={() => setShowTerms((s) => !s)}
                disabled={!doc.terms}
                title="Terms"
              >
                <i className="bi bi-file-text"></i>
                <span className="d-none d-md-inline">Terms</span>
              </button>
            )}

            <button
              className="btn btn-outline-primary d-flex align-items-center gap-1"
              onClick={() =>
                window.open(`/app/${doctype}/${doc.name}`, "_blank")
              }
              title="Open Full"
            >
              <i className="bi bi-box-arrow-up-right"></i>
              <span className="d-none d-md-inline">Open Full</span>
            </button>
          </div>

          {/* RIGHT */}
          <div className="d-flex gap-2 justify-content-end flex-wrap">
            {workflowActions.length > 0 ? (
              workflowActions.map((a) => (
                <button
                  key={a.action}
                  className={`btn d-flex align-items-center gap-1 ${
                    a.action.toLowerCase().includes("reject")
                      ? "btn-danger"
                      : "btn-primary"
                  }`}
                  disabled={loading}
                  onClick={() => handleWorkflowAction(a.action)}
                >
                  <i
                    className={`bi ${
                      a.action.toLowerCase().includes("reject")
                        ? "bi-x-circle"
                        : "bi-check-circle"
                    }`}
                  ></i>
                  <span className="d-none d-md-inline">{a.action}</span>
                </button>
              ))
            ) : (
              <div className="text-muted small">No actions available</div>
            )}
          </div>
        </div>
      }
    >
      {/* CONTENT */}
      <div style={{ position: "relative", height: "100%" }}>
        {/* PREVIEW */}
        {mode === "preview" && (
          <div className="preview-container">
            <PreviewRenderer doctype={doctype} doc={doc} />
          </div>
        )}

        {/* DETAILS */}
        {mode === "details" && (
          <div className="form-container overflow-auto">
            {Object.entries(doc).map(([key, value]) => (
              <div key={key} className="form-field">
                <div className="form-label">{key}</div>
                <div>{String(value || "-")}</div>
              </div>
            ))}
          </div>
        )}

        {/* TERMS DRAWER */}
        {config.showTerms && doc.terms && (
          <RightDrawer
            show={showTerms}
            onClose={() => setShowTerms(false)}
            title="Terms & Conditions"
            width="lg"
          >
            <div
              className="small text-muted"
              style={{ lineHeight: "1.5", wordBreak: "break-word" }}
              dangerouslySetInnerHTML={{ __html: doc.terms }}
            />
          </RightDrawer>
        )}
      </div>
    </AppModal>
  );
}
