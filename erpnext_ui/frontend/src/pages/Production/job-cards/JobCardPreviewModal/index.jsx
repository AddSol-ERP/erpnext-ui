import { useEffect, useState } from "react";
import { get, post } from "../../../../services/api";
import AppModal from "../../../../components/AppModal";

export default function JobCardPreviewModal({ show, onClose, doc, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [fullDoc, setFullDoc] = useState(null);

  useEffect(() => {
    if (show && doc) {
      loadDoc();
    }
  }, [show, doc]);

  const loadDoc = async () => {
    const res = await get(`resource/Job Card/${doc.name}`);
    setFullDoc(res.data);
  };

  /* ===============================
     ACTIONS
  ============================== */

  const handleAction = async (action) => {
    try {
      setLoading(true);

      if (action === "start") {
        await post(
          "method/erpnext.manufacturing.doctype.job_card.job_card.start_job",
          { job_card: doc.name },
        );
      }

      if (action === "complete") {
        await post(
          "method/erpnext.manufacturing.doctype.job_card.job_card.complete_job",
          { job_card: doc.name },
        );
      }

      if (action === "pause") {
        await post(
          "method/erpnext.manufacturing.doctype.job_card.job_card.pause_job",
          { job_card: doc.name },
        );
      }

      onSuccess && onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert("Action failed");
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     STATE LOGIC
  ============================== */

  const getActions = () => {
    if (!fullDoc) return [];

    const status = fullDoc.status;

    if (status === "Open") {
      return [{ key: "start", label: "Start Job", class: "btn-primary" }];
    }

    if (status === "Work In Progress") {
      return [
        { key: "pause", label: "Pause", class: "btn-warning" },
        { key: "complete", label: "Complete", class: "btn-success" },
      ];
    }

    return [];
  };

  const actions = getActions();

  /* ===============================
     CALCULATIONS
  ============================== */

  const progress = fullDoc?.for_quantity
    ? Math.round((fullDoc.total_completed_qty / fullDoc.for_quantity) * 100)
    : 0;

  /* ===============================
     UI
  ============================== */

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={`Job Card · ${doc?.name}`}
      width="lg"
      footer={
        <div className="d-flex gap-2 w-100">
          {actions.map((a) => (
            <button
              key={a.key}
              className={`btn ${a.class} flex-fill`}
              disabled={loading}
              onClick={() => handleAction(a.key)}
            >
              {loading ? "Processing..." : a.label}
            </button>
          ))}
        </div>
      }
    >
      {!fullDoc ? (
        <div className="text-center p-4">Loading...</div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {/* 🔥 STATUS HEADER */}
          <div className="d-flex justify-content-between align-items-center">
            <div className="fw-semibold fs-5">{fullDoc.operation}</div>

            <span
              className={`badge ${
                fullDoc.status === "Work In Progress"
                  ? "bg-success"
                  : fullDoc.status === "Open"
                    ? "bg-warning text-dark"
                    : "bg-secondary"
              }`}
            >
              {fullDoc.status}
            </span>
          </div>

          {/* WORK ORDER */}
          <div className="small text-muted">
            Work Order: {fullDoc.work_order}
          </div>

          {/* 🔥 PROGRESS BAR */}
          <div>
            <div className="d-flex justify-content-between small mb-1">
              <span>Progress</span>
              <span>
                {fullDoc.total_completed_qty || 0} / {fullDoc.for_quantity || 0}
              </span>
            </div>

            <div
              style={{
                height: "8px",
                background: "#e9ecef",
                borderRadius: "6px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  background: "#0d6efd",
                  height: "100%",
                  transition: "width 0.3s",
                }}
              />
            </div>
          </div>

          {/* OPTIONAL: TIMER PLACEHOLDER */}
          {fullDoc.status === "Work In Progress" && (
            <div className="text-muted small">⏱ Job in progress...</div>
          )}
        </div>
      )}
    </AppModal>
  );
}
