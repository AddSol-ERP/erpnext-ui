import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHeader } from "../../../../context/HeaderContext";
import { get, post } from "../../../../services/api";
import { FormField } from "../../../../components/FormField";
import LinkField from "../../../../components/LinkField";

export default function InspectionForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const isEdit = !!name;

  const [loading, setLoading] = useState(false);

  const [doc, setDoc] = useState({
    template: "",
    item_code: "",
  });

  const [parameters, setParameters] = useState([]);

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit ? `Inspection ${doc.name || ""}` : "New Inspection",

      subtitle: isEdit
        ? "Review and update inspection results"
        : "Create a new quality inspection",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Quality", path: "/quality" },
        { label: "Inspections", path: "/quality/inspection" },
        {
          label: isEdit ? doc.name || "Edit" : "New",
        },
      ],

      actions: [
        {
          label: loading ? "Saving..." : "Save",
          variant: "btn-success",
          onClick: handleSave,
          disabled: loading,
        },

        isEdit &&
          !doc.docstatus && {
            label: "Submit",
            variant: "btn-primary",
            onClick: handleSave,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
  }, [loading, isEdit, doc]);

  /* ================= LOAD ================= */
  useEffect(() => {
    if (isEdit) loadDoc();
  }, [name]);

  const loadDoc = async () => {
    const res = await get(`resource/Quality Inspection/${name}`);
    const d = res.data;

    setDoc({
      template: d.quality_inspection_template,
      item_code: d.item_code,
    });

    const templateRes = await get(
      `resource/Quality Inspection Template/${d.quality_inspection_template}`,
    );

    const templateParams =
      templateRes.data.item_quality_inspection_parameter || [];

    const readingsMap = {};
    (d.readings || []).forEach((r) => {
      readingsMap[r.specification] = r;
    });

    const merged = templateParams.map((t) => {
      const existing = readingsMap[t.specification];

      return {
        parameter: t.specification,
        numeric: t.numeric,
        min_value: t.min_value,
        max_value: t.max_value,
        tolerance: 5, // 🔥 default %
        values: [
          existing?.reading_1,
          existing?.reading_2,
          existing?.reading_3,
        ].filter((v) => v) || [""],
        status: existing?.status || "Pending",
        avg: 0,
        deviation: 0,
      };
    });

    setParameters(merged);
  };

  /* ================= TEMPLATE LOAD ================= */
  const handleTemplateChange = async (template) => {
    setDoc({ ...doc, template });

    const res = await get(`resource/Quality Inspection Template/${template}`);

    const rows = res.data.item_quality_inspection_parameter || [];

    const mapped = rows.map((r) => ({
      parameter: r.specification,
      numeric: r.numeric,
      min_value: r.min_value,
      max_value: r.max_value,
      tolerance: 5,
      values: [""],
      status: "Pending",
      avg: 0,
      deviation: 0,
    }));

    setParameters(mapped);
  };

  /* ================= CALC ================= */
  const updateReading = (pi, vi, value) => {
    const updated = [...parameters];
    const p = updated[pi];

    p.values[vi] = value;

    const nums = p.values.map((v) => parseFloat(v)).filter((v) => !isNaN(v));

    if (nums.length === 0) {
      p.status = "Pending";
      setParameters(updated);
      return;
    }

    // 🔥 AVG
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;

    // 🔥 TARGET
    const target = (p.min_value + p.max_value) / 2;

    // 🔥 DEVIATION %
    const deviation = Math.abs((avg - target) / target) * 100;

    p.avg = avg.toFixed(2);
    p.deviation = deviation.toFixed(2);

    // 🔥 STATUS
    if (deviation <= p.tolerance) {
      p.status = "PASS";
    } else {
      p.status = "FAIL";
    }

    setParameters(updated);
  };

  /* ================= RESULT ================= */
  const overallStatus = (() => {
    if (!parameters.length) return "";

    if (parameters.some((p) => p.status === "Pending")) return "Pending";

    if (parameters.some((p) => p.status === "FAIL")) return "Rejected";

    return "Accepted";
  })();

  /* ================= SAVE ================= */
  const handleSave = async () => {
    const payload = {
      item_code: doc.item_code,
      quality_inspection_template: doc.template,
      status: overallStatus,
      readings: parameters.map((p) => ({
        specification: p.parameter,
        reading_1: p.values[0] || "",
        reading_2: p.values[1] || "",
        reading_3: p.values[2] || "",
        status: p.status,
      })),
    };

    if (isEdit) {
      await post(`resource/Quality Inspection/${name}`, payload);
    } else {
      await post("resource/Quality Inspection", {
        doctype: "Quality Inspection",
        ...payload,
      });
    }

    navigate("/quality/inspection");
  };

  /* ================= UI ================= */
  return (
    <div className="container-fluid px-2 px-md-3">
      {/* BASIC */}
      <div className="card mb-3">
        <div className="card-body row g-2">
          <div className="col-md-6">
            <FormField label="Template">
              <LinkField
                doctype="Quality Inspection Template"
                value={doc.template}
                onChange={handleTemplateChange}
                disabled={isEdit}
              />
            </FormField>
          </div>

          <div className="col-md-6">
            <FormField label="Item">
              <LinkField
                doctype="Item"
                value={doc.item_code}
                onChange={(v) => setDoc({ ...doc, item_code: v })}
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* PARAMETERS */}
      <div className="row g-3">
        {parameters.map((p, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-4">
            <div className="card">
              <div className="card-body">
                <div className="fw-bold text-center">{p.parameter}</div>

                <div className="small text-muted text-center mb-2">
                  {p.min_value} → {p.max_value} | Tol: {p.tolerance}%
                </div>

                {/* INPUTS */}
                {p.values.map((val, vi) => (
                  <input
                    key={vi}
                    className="form-control mb-2 text-center"
                    type="number"
                    value={val}
                    placeholder={`Reading ${vi + 1}`}
                    onChange={(e) => updateReading(i, vi, e.target.value)}
                  />
                ))}

                <button
                  className="btn btn-sm btn-outline-primary w-100"
                  onClick={() => {
                    const updated = [...parameters];
                    updated[i].values.push("");
                    setParameters(updated);
                  }}
                >
                  + Add Reading
                </button>

                {/* METRICS */}
                {p.avg > 0 && (
                  <div className="mt-3 small text-center">
                    <div>
                      Avg: <b>{p.avg}</b>
                    </div>
                    <div>
                      Dev:{" "}
                      <b
                        className={
                          p.deviation > p.tolerance
                            ? "text-danger"
                            : "text-success"
                        }
                      >
                        {p.deviation}%
                      </b>
                    </div>
                  </div>
                )}

                {/* STATUS */}
                <div className="text-center mt-2">
                  <span
                    className={`badge ${
                      p.status === "PASS"
                        ? "bg-success"
                        : p.status === "FAIL"
                          ? "bg-danger"
                          : "bg-secondary"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FINAL RESULT */}
      <div className="card mt-3">
        <div className="card-body text-center">
          <div className="small text-muted">Final Result</div>
          <div
            className={`fw-bold fs-4 ${
              overallStatus === "Accepted"
                ? "text-success"
                : overallStatus === "Rejected"
                  ? "text-danger"
                  : "text-secondary"
            }`}
          >
            {overallStatus}
          </div>
        </div>
      </div>
    </div>
  );
}
