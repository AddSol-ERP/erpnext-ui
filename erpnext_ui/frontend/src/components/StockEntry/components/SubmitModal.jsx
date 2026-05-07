import AppModal from "../../AppModal";
import LinkField from "../../LinkField";

export default function SubmitModal({
  show,
  onClose,
  onSubmit,
  project,
  setProject,
  workOrder,
  setWorkOrder,
}) {
  return (
    <AppModal
      show={show}
      onClose={onClose}
      title="Confirm Stock Entry"
      footer={
        <>
          <button className="btn btn-outline-primary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSubmit}>
            Submit
          </button>
        </>
      }
    >
      <div className="row g-2">
        <div className="col-12">
          <label className="form-label">Project</label>
          <LinkField
            doctype="Project"
            value={project}
            onChange={setProject}
            placeholder="Search Project"
          />
        </div>

        <div className="col-12">
          <label className="form-label">Work Order</label>
          <LinkField
            doctype="Work Order"
            value={workOrder}
            onChange={setWorkOrder}
            placeholder="Search Work Order"
          />
        </div>
      </div>
    </AppModal>
  );
}
