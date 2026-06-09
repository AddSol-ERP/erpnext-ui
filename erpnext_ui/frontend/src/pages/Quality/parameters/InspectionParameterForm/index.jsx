import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHeader } from "../../../../context/HeaderContext";
import { get, post } from "../../../../services/api";
import { FormField } from "../../../../components/FormField";
import LinkField from "../../../../components/LinkField";

export default function InspectionParameterForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const [loading, setLoading] = useState(false);

  const [doc, setDoc] = useState({
    parameter: "",
    parameter_group: "",
    description: "",
  });

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: name ? `Parameter ${doc.name || ""}` : "New Parameter",

      subtitle: name
        ? "Update inspection parameter"
        : "Create a measurable parameter for quality inspection",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Quality", path: "/quality" },
        { label: "Inspection Parameters", path: "/quality/parameters" },
        {
          label: name ? doc.name || "Edit" : "New",
        },
      ],

      actions: [
        {
          label: loading ? "Saving..." : "Save",
          variant: "btn-success",
          disabled: loading,
          onClick: handleSave,
        },
      ],
    });

    return () => setHeader({});
  }, [name, loading, doc]);
  /* ================= LOAD ================= */
  useEffect(() => {
    if (name) loadDoc();
  }, [name]);

  const loadDoc = async () => {
    try {
      setLoading(true);
      const res = await get(`resource/Quality Inspection Parameter/${name}`);

      setDoc({
        parameter: res.data.parameter || "",
        parameter_group: res.data.parameter_group || "",
        description: res.data.description || "",
      });
    } catch (e) {
      console.error(e);
      alert("Failed to load parameter");
    } finally {
      setLoading(false);
    }
  };

  /* ================= SAVE ================= */
  const handleSave = async () => {
    try {
      if (!doc.parameter) {
        alert("Parameter is required");
        return;
      }

      setLoading(true);

      if (name) {
        await post(`resource/Quality Inspection Parameter/${name}`, doc);
      } else {
        await post("resource/Quality Inspection Parameter", doc);
      }

      alert("Saved successfully");
      navigate("/quality/parameters");
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
        <div className="form-section-title">Basic Details</div>

        <div className="row">
          <div className="col-md-6">
            <FormField label="Parameter" required>
              <input
                className="form-control"
                value={doc.parameter}
                onChange={(e) => setDoc({ ...doc, parameter: e.target.value })}
              />
            </FormField>
          </div>

          <div className="col-md-6">
            <FormField label="Parameter Group">
              <LinkField
                doctype="Quality Inspection Parameter Group"
                value={doc.parameter_group}
                onChange={(v) => setDoc({ ...doc, parameter_group: v })}
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* DESCRIPTION */}
      <div className="form-section">
        <div className="form-section-title">Description</div>

        <FormField label="Description">
          <textarea
            className="form-control"
            rows={4}
            value={doc.description || ""}
            onChange={(e) => setDoc({ ...doc, description: e.target.value })}
          />
        </FormField>
      </div>
    </div>
  );
}
