import { useEffect, useState } from "react";
import { get, post } from "../../../../services/api";
import { useNavigate, useParams } from "react-router-dom";
import { useHeader } from "../../../../context/HeaderContext";
import LinkField from "../../../../components/LinkField";
import { FormField } from "../../../../components/FormField";

export default function QualityTemplateForm() {
  const navigate = useNavigate();
  const { name } = useParams();
  const { setHeader } = useHeader();

  const [loading, setLoading] = useState(false);

  const [doc, setDoc] = useState({
    quality_inspection_template_name: "",
    item_quality_inspection_parameter: [],
  });

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: name ? `Template ${doc.name || ""}` : "New Template",

      subtitle: name
        ? "Update inspection parameters"
        : "Create a template for quality inspection",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Quality", path: "/quality" },
        { label: "Templates", path: "/quality/templates" },
        {
          label: name ? doc.name || "Edit" : "New",
        },
      ],

      actions: [
        {
          label: loading ? "Saving..." : "Save",
          variant: "btn-success",
          onClick: handleSave,
          disabled: loading,
        },
      ],
    });

    return () => setHeader({});
  }, [name, loading, doc]);

  /* ================= LOAD ================= */

  const mapRowFromERP = (r) => {
    if (r.formula_based_criteria) return { ...r, mode: "formula" };
    if (r.numeric) return { ...r, mode: "numeric" };
    return { ...r, mode: "value" };
  };

  useEffect(() => {
    if (name) loadDoc();
  }, [name]);

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Quality Inspection Template/${name}`);
      const data = res.data;

      setDoc({
        quality_inspection_template_name:
          data.quality_inspection_template_name || "",
        item_quality_inspection_parameter: (
          data.item_quality_inspection_parameter || []
        ).map(mapRowFromERP),
      });
    } catch (e) {
      console.error(e);
      alert("Failed to load template");
    } finally {
      setLoading(false);
    }
  };

  /* ================= ROW ================= */

  const addRow = () => {
    setDoc((prev) => ({
      ...prev,
      item_quality_inspection_parameter: [
        ...prev.item_quality_inspection_parameter,
        {
          specification: "",
          mode: "numeric",
          value: "",
          min_value: "",
          max_value: "",
          acceptance_formula: "",
        },
      ],
    }));
  };

  const updateRow = (i, field, value) => {
    const rows = [...doc.item_quality_inspection_parameter];
    rows[i][field] = value;

    if (field === "mode") {
      rows[i].value = "";
      rows[i].min_value = "";
      rows[i].max_value = "";
      rows[i].acceptance_formula = "";
    }

    setDoc({ ...doc, item_quality_inspection_parameter: rows });
  };

  const removeRow = (i) => {
    setDoc({
      ...doc,
      item_quality_inspection_parameter:
        doc.item_quality_inspection_parameter.filter((_, idx) => idx !== i),
    });
  };

  /* ================= SAVE ================= */

  const preparePayload = () => {
    return {
      quality_inspection_template_name: doc.quality_inspection_template_name,
      item_quality_inspection_parameter:
        doc.item_quality_inspection_parameter.map((r) => {
          let row = {
            doctype: "Item Quality Inspection Parameter",
            specification: r.specification,
          };

          if (r.mode === "numeric") {
            row.numeric = 1;
            row.min_value = r.min_value;
            row.max_value = r.max_value;
          }

          if (r.mode === "value") {
            row.numeric = 0;
            row.value = r.value;
          }

          if (r.mode === "formula") {
            row.formula_based_criteria = 1;
            row.acceptance_formula = r.acceptance_formula;
          }

          return row;
        }),
    };
  };

  const handleSave = async () => {
    try {
      if (!doc.quality_inspection_template_name) {
        alert("Template name required");
        return;
      }

      if (!doc.item_quality_inspection_parameter.length) {
        alert("Add at least one parameter");
        return;
      }

      setLoading(true);

      const payload = preparePayload();

      if (name) {
        await post(`resource/Quality Inspection Template/${name}`, payload);
      } else {
        await post("resource/Quality Inspection Template", payload);
      }

      alert("Saved successfully");
      navigate("/quality-templates");
    } catch (e) {
      console.error(e);
      alert("Save failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI ================= */

  return (
    <div className="form-container" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* BASIC */}
      <div className="form-section">
        <div className="form-section-title">Basic Info</div>

        <div className="row">
          <div className="col-md-6">
            <FormField label="Template Name" required>
              <input
                className="form-control"
                value={doc.quality_inspection_template_name}
                onChange={(e) =>
                  setDoc({
                    ...doc,
                    quality_inspection_template_name: e.target.value,
                  })
                }
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* PARAMETERS */}
      <div className="form-section">
        <div className="form-section-title d-flex justify-content-between">
          <span>Inspection Parameters</span>
          <button className="btn btn-sm btn-primary" onClick={addRow}>
            + Add
          </button>
        </div>

        {doc.item_quality_inspection_parameter.map((row, idx) => (
          <div key={idx} className="border rounded p-3 mb-3">
            <div className="row">
              {/* PARAM */}
              <div className="col-md-4">
                <FormField label="Parameter" required>
                  <LinkField
                    doctype="Quality Inspection Parameter"
                    value={row.specification}
                    onChange={(v) => updateRow(idx, "specification", v)}
                  />
                </FormField>
              </div>

              {/* MODE */}
              <div className="col-md-4">
                <FormField label="Type">
                  <select
                    className="form-select"
                    value={row.mode}
                    onChange={(e) => updateRow(idx, "mode", e.target.value)}
                  >
                    <option value="numeric">Range</option>
                    <option value="value">Value</option>
                    <option value="formula">Formula</option>
                  </select>
                </FormField>
              </div>

              {/* REMOVE */}
              <div className="col-md-4 d-flex align-items-end justify-content-end">
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => removeRow(idx)}
                >
                  Remove
                </button>
              </div>
            </div>

            {/* VALUE INPUTS */}
            <div className="row mt-2">
              {row.mode === "numeric" && (
                <>
                  <div className="col-md-3">
                    <FormField label="Min">
                      <input
                        className="form-control"
                        value={row.min_value || ""}
                        onChange={(e) =>
                          updateRow(idx, "min_value", e.target.value)
                        }
                      />
                    </FormField>
                  </div>

                  <div className="col-md-3">
                    <FormField label="Max">
                      <input
                        className="form-control"
                        value={row.max_value || ""}
                        onChange={(e) =>
                          updateRow(idx, "max_value", e.target.value)
                        }
                      />
                    </FormField>
                  </div>
                </>
              )}

              {row.mode === "value" && (
                <div className="col-md-6">
                  <FormField label="Value">
                    <input
                      className="form-control"
                      value={row.value || ""}
                      onChange={(e) => updateRow(idx, "value", e.target.value)}
                    />
                  </FormField>
                </div>
              )}

              {row.mode === "formula" && (
                <div className="col-md-12">
                  <FormField label="Formula">
                    <textarea
                      className="form-control"
                      value={row.acceptance_formula || ""}
                      onChange={(e) =>
                        updateRow(idx, "acceptance_formula", e.target.value)
                      }
                    />
                  </FormField>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
