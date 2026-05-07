import { useState } from "react";

export default function SourceSelector({ loadSource }) {
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [qcDone, setQcDone] = useState(false);

  const options = {
    mr: ["MR-001", "MR-002"],
    bom: ["BOM-001"],
    pr: ["PR-001"],
  };

  return (
    <div className="action-bar">
      <div className="row g-2 align-items-center">
        {/* SOURCE TYPE */}
        <div className="col-12 col-md-3">
          <select
            className="form-select"
            value={sourceType}
            onChange={(e) => {
              setSourceType(e.target.value);
              setSourceId("");
            }}
          >
            <option value="">Source Type</option>
            <option value="mr">Material Request</option>
            <option value="bom">BOM</option>
            <option value="pr">Purchase Receipt</option>
          </select>
        </div>

        {/* DOCUMENT */}
        <div className="col-12 col-md-4">
          <select
            className="form-select"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            disabled={!sourceType}
          >
            <option value="">
              {sourceType ? "Select Document" : "Select Type first"}
            </option>

            {(options[sourceType] || []).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>

        {/* QC TOGGLE */}
        <div className="col-6 col-md-2">
          <div className="form-check mt-2">
            <input
              type="checkbox"
              className="form-check-input"
              id="qcDone"
              checked={qcDone}
              onChange={(e) => setQcDone(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="qcDone">
              QC Done
            </label>
          </div>
        </div>

        {/* LOAD */}
        <div className="col-6 col-md-3">
          <button
            className="btn btn-outline-primary w-100"
            disabled={!sourceType || !sourceId}
            onClick={() =>
              loadSource(sourceType, sourceId, { qc_done: qcDone })
            }
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
