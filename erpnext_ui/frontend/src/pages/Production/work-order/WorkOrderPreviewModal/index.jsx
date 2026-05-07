import { useEffect, useState } from "react";
import { get } from "../../../../services/api";
import AppModal from "../../../../components/AppModal";

export default function WorkOrderPreviewModal({ show, onClose, doc }) {
  const [fullDoc, setFullDoc] = useState(null);

  useEffect(() => {
    if (show && doc) loadDoc();
  }, [show, doc]);

  const loadDoc = async () => {
    const res = await get(`resource/Work Order/${doc.name}`);
    setFullDoc(res.data);
  };

  if (!fullDoc) return null;

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={`Work Order · ${doc.name}`}
      width="lg"
    >
      <div className="mb-2 fw-semibold">{fullDoc.production_item}</div>

      <div className="small text-muted mb-2">
        Qty: {fullDoc.produced_qty || 0} / {fullDoc.qty || 0}
      </div>

      <div className="badge bg-info mb-3">{fullDoc.status}</div>

      <div>
        <div className="fw-semibold mb-2">Operations</div>

        {(fullDoc.operations || []).map((op) => (
          <div key={op.name} className="border rounded p-2 mb-2">
            <div className="fw-semibold">{op.operation}</div>
            <div className="small text-muted">
              Workstation: {op.workstation}
            </div>
            <div className="small">
              {op.completed_qty || 0} / {op.qty || 0}
            </div>
          </div>
        ))}
      </div>
    </AppModal>
  );
}
