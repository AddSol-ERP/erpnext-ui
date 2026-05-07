import { useEffect, useState } from "react";
import LinkField from "../LinkField";
import AppModal from "../AppModal";

export default function FilterModal({
  show,
  onClose,
  config,
  onApply,
  initialFilters = {},
}) {
  const [values, setValues] = useState(initialFilters || {});

  // 🔥 sync when reopening
  useEffect(() => {
    setValues(initialFilters || {});
  }, [initialFilters, show]);

  const update = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const clearAll = () => {
    setValues({});
  };

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title="🔎 Filters"
      width="lg"
      footer={
        <>
          <button className="btn btn-outline-primary" onClick={clearAll}>
            Clear
          </button>

          <button
            className="btn btn-primary"
            onClick={() => {
              onApply(values);
              onClose();
            }}
          >
            Apply
          </button>
        </>
      }
    >
      <div className="row g-3">
        {(config?.filters || []).map((f) => (
          <div key={f.field} className="col-12 col-md-6 col-lg-6">
            <div className="form-field">
              <div className="form-label">{f.label}</div>

              {/* SELECT */}
              {f.type === "select" && (
                <select
                  className="form-select"
                  value={values?.[f.field] || ""}
                  onChange={(e) => update(f.field, e.target.value)}
                >
                  <option value="">All</option>
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              )}

              {/* DATE */}
              {f.type === "date" && (
                <input
                  type="date"
                  className="form-control"
                  value={values?.[f.field] || ""}
                  onChange={(e) => update(f.field, e.target.value)}
                />
              )}

              {/* LINK */}
              {f.type === "link" && (
                <LinkField
                  doctype={f.doctype}
                  value={values?.[f.field] || ""}
                  onChange={(val) => update(f.field, val)}
                  placeholder={`Select ${f.label}`}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </AppModal>
  );
}
