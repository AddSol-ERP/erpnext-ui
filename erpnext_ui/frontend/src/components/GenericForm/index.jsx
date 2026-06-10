import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useToast } from "../../context/ToastContext";
import { get, post, put } from "../../services/api";
import { FormField } from "../FormField";
import ChildTable from "../ChildTable";
import { getFieldRenderer } from "./fieldTypes";
import { getDoctypeConfig } from "../../config/doctypes";

/** Extract the hub name from the first segment of the current path. */
function useHub() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  return segments[0] || "";
}

const SKIP_FIELDS = [
  "Section Break", "Column Break", "Tab Break",
  "Fold", "Page Break",
];

const SYSTEM_FIELDS = [
  "name", "owner", "creation", "modified", "modified_by",
  "idx", "docstatus", "amended_from", "amended_by",
  "_user_tags", "_comments", "_assign", "_liked_by",
  "doctype",
];

/* ===============================
   GENERIC FORM
=============================== */
export default function GenericFormPage() {
  const { doctype, name } = useParams();
  const hub = useHub();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();

  const [meta, setMeta] = useState(null);        // DocType metadata
  const [childMeta, setChildMeta] = useState({}); // Child doctype metadata cache
  const [doc, setDoc] = useState({});             // Current form data
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const calculateTimer = useRef(null); // Debounce timer for server-side calc

  const isNew = name === "new" || !name;
  const decodedDoctype = decodeURIComponent(doctype);
  const decodedName = isNew ? null : decodeURIComponent(name);

  /* ===============================
     NATIVE FORM REDIRECT
     If the doctype is configured as nativeForm,
     open ERPNext native form in a new tab and go back.
  ============================== */
  useEffect(() => {
    const config = getDoctypeConfig(decodedDoctype);
    if (config.nativeForm) {
      const doctypeUrl = decodedDoctype.toLowerCase().replace(/\s+/g, "-");
      const url = isNew
        ? `/app/${doctypeUrl}/new-${doctypeUrl}`
        : `/app/${doctypeUrl}/${decodedName}`;
      window.open(url, '_blank');
      navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
    }
  }, []); // run once on mount

  /* ===============================
     LOAD METADATA + DOC
  ============================== */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // 1. Load doctype metadata
        const metaRes = await get(`resource/DocType/${decodedDoctype}`);
        const fields = metaRes.data?.fields || [];
        setMeta(fields);

        // 2. Fetch child doctype metadata for Table fields
        const childMetaCache = {};
        const tableFields = fields.filter((f) => f.fieldtype === "Table" && f.options);
        await Promise.all(
          tableFields.map(async (tf) => {
            try {
              const childRes = await get(`resource/DocType/${tf.options}`);
              childMetaCache[tf.options] = childRes.data?.fields || [];
            } catch {
              childMetaCache[tf.options] = [];
            }
          })
        );
        setChildMeta(childMetaCache);

        // 3. Build initial doc state
        const initialDoc = {};
        fields.forEach((f) => {
          if (SYSTEM_FIELDS.includes(f.fieldname) || SKIP_FIELDS.includes(f.fieldtype)) return;
          // Set defaults
          if (f.default && !isNew) return; // don't override loaded data
          if (f.default) {
            initialDoc[f.fieldname] = f.default;
          } else if (f.fieldtype === "Check") {
            initialDoc[f.fieldname] = 0;
          } else if (f.fieldtype === "Table") {
            initialDoc[f.fieldname] = [];
          } else {
            initialDoc[f.fieldname] = null;
          }
        });

        // 3. If editing, load existing document
        if (!isNew && decodedName) {
          const docRes = await get(`resource/${decodedDoctype}/${decodedName}`);
          const docData = docRes.data || {};

          // Merge loaded data over defaults
          Object.keys(initialDoc).forEach((key) => {
            if (docData[key] !== undefined) {
              initialDoc[key] = docData[key];
            }
          });
          // Add system fields as read-only
          initialDoc.name = docData.name;
          initialDoc.docstatus = docData.docstatus;
        }

        setDoc(initialDoc);
      } catch (e) {
        console.error("Failed to load form:", e);
        toast.error(`Failed to load ${decodedDoctype}`);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [doctype, name]);

  /* ===============================
     HEADER
  ============================== */
  useEffect(() => {
    const hubName = hub ? hub.charAt(0).toUpperCase() + hub.slice(1) : "";
    setHeader({
      title: isNew ? `New ${decodedDoctype}` : `${doc.name || decodedDoctype}`,
      subtitle: isNew ? `Create a new ${decodedDoctype}` : `Editing ${decodedDoctype}`,
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: hubName, path: `/${hub}` },
        { label: decodedDoctype, path: `/${hub}/${encodeURIComponent(decodedDoctype)}` },
        { label: isNew ? "New" : doc.name || "" },
      ],
      actions: [
        {
          label: saving ? "Saving..." : "Save",
          variant: "btn-success",
          disabled: saving || loading,
          onClick: handleSave,
        },
        ...(!isNew && doc.docstatus === 0
          ? [
              {
                label: "Submit",
                variant: "btn-primary",
                disabled: saving || loading,
                onClick: () => handleSubmit(doc.name),
              },
              {
                label: "Delete",
                variant: "btn-outline-danger",
                disabled: saving || loading,
                onClick: () => handleDelete(doc.name),
              },
            ]
          : []),
      ],
    });
    return () => setHeader({});
  }, [doctype, name, hub, doc, loading, saving]);

  /* ===============================
     FIELD CHANGE
  ============================== */
  const handleFieldChange = async (fieldname, value) => {
    setDoc((prev) => ({ ...prev, [fieldname]: value }));
    // Clear error for this field
    if (errors[fieldname]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldname];
        return next;
      });
    }

    // ========== fetch_from auto-population ==========
    if (meta && value) {
      const changedField = meta.find((f) => f.fieldname === fieldname);
      if (changedField?.fieldtype === "Link" && changedField.options) {
        const dependentFields = meta.filter(
          (f) => f.fetch_from && f.fetch_from.startsWith(fieldname + ".")
        );
        if (dependentFields.length > 0) {
          try {
            const res = await get(
              `resource/${changedField.options}/${encodeURIComponent(value)}`
            );
            const linkedData = res.data || {};
            const updates = {};
            dependentFields.forEach((f) => {
              const sourceKey = f.fetch_from.split(".").slice(1).join(".");
              if (linkedData[sourceKey] !== undefined) {
                updates[f.fieldname] = linkedData[sourceKey];
              }
            });
            if (Object.keys(updates).length > 0) {
              setDoc((prev) => ({ ...prev, ...updates }));
            }
          } catch (e) {
            console.warn(`fetch_from failed for ${fieldname}:`, e);
          }
        }
      }
    }

    // Debounced server-side calculation (only for doctypes with tables)
    if (meta?.some((f) => f.fieldtype === "Table")) {
      if (calculateTimer.current) clearTimeout(calculateTimer.current);
      calculateTimer.current = setTimeout(() => {
        calculateServerSide();
      }, 1500);
    }
  };

  /* ===============================
     SERVER-SIDE CALCULATION
  ============================== */
  const calculateServerSide = async () => {
    if (!meta?.some((f) => f.fieldtype === "Table")) return;

    try {
      const payload = { ...doc, doctype: decodedDoctype };
      SYSTEM_FIELDS.forEach((f) => delete payload[f]);
      const res = await post("method/frappe.client.validate", { doc: payload });
      const result = res.message || res.data;
      if (result) {
        setDoc((prev) => ({
          ...prev,
          total_qty: result.total_qty,
          total: result.total,
          net_total: result.net_total,
          total_taxes_and_charges: result.total_taxes_and_charges,
          grand_total: result.grand_total,
          rounded_total: result.rounded_total,
          in_words: result.in_words,
        }));
      }
    } catch (e) {
      // Silently fail — user can still save manually
    }
  };

  /* ===============================
     VALIDATION
  ============================== */
  const validate = () => {
    const newErrors = {};
    if (!meta) return true;

    meta.forEach((field) => {
      if (field.reqd && !SKIP_FIELDS.includes(field.fieldtype) && field.fieldtype !== "Table") {
        const val = doc[field.fieldname];
        if (val === null || val === undefined || val === "") {
          newErrors[field.fieldname] = `${field.label} is required`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /* ===============================
     SAVE
  ============================== */
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    try {
      // Prepare payload: remove system fields
      const payload = { ...doc };
      SYSTEM_FIELDS.forEach((f) => delete payload[f]);
      payload.doctype = decodedDoctype;

      if (isNew) {
        // CREATE
        await post(`resource/${decodedDoctype}`, payload);
        toast.success(`${decodedDoctype} created successfully`);
      } else {
        // UPDATE: set_value for each field individually
        // Or use PUT (full update)
        await put(`resource/${decodedDoctype}/${decodedName}`, payload);
        toast.success(`${decodedDoctype} updated successfully`);
      }

      // Navigate back to list
      navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
    } catch (e) {
      console.error("Save failed:", e);
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  /* ===============================
     SUBMIT
  ============================== */
  const handleSubmit = async (docName) => {
    setSaving(true);
    try {
      await get("method/frappe.client.submit", {
        doctype: decodedDoctype,
        name: docName,
      });
      toast.success(`${decodedDoctype} submitted successfully`);
      navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
    } catch (e) {
      console.error("Submit failed:", e);
      toast.error(e.message || "Failed to submit");
    } finally {
      setSaving(false);
    }
  };

  /* ===============================
     DELETE
  ============================== */
  const handleDelete = async (docName) => {
    if (!window.confirm(`Are you sure you want to delete this ${decodedDoctype}?`)) return;

    setSaving(true);
    try {
      // Use frappe.client.delete
      await get("method/frappe.client.delete", {
        doctype: decodedDoctype,
        name: docName,
      });
      toast.success(`${decodedDoctype} deleted`);
      navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error(e.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  /* ===============================
     RENDER SECTION
  ============================== */
  const renderField = (field) => {
    const Renderer = getFieldRenderer(field.fieldtype);
    return (
      <Renderer
        key={field.fieldname}
        field={field}
        value={doc[field.fieldname]}
        onChange={(val) => handleFieldChange(field.fieldname, val)}
        error={errors[field.fieldname]}
      />
    );
  };

  const renderSection = (fields) => {
    // Group fields into rows (Column Break creates new column)
    const rows = [];
    let currentRow = [];

    fields.forEach((field) => {
      const ft = field.fieldtype;

      if (SKIP_FIELDS.includes(ft)) {
        // Column Break → close current column if there's content
        if (ft === "Column Break" && currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        return;
      }

      // Table fieldtype gets special full-width rendering
      if (ft === "Table") {
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        rows.push([field]);
        return;
      }

      currentRow.push(field);
    });

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    return (
      <div>
        {rows.map((row, rowIdx) => {
          // If it's a table child field, render full-width
          if (row.length === 1 && row[0].fieldtype === "Table") {
            return (
              <div key={rowIdx} className="mb-4">
                <ChildTable
                  title={row[0].label}
                  columns={
                    (row[0].options && childMeta[row[0].options]
                      ? childMeta[row[0].options]
                      : []
                    ).filter((cf) => cf.fieldname && cf.fieldname !== "parent" && cf.fieldname !== "parenttype" && cf.fieldname !== "parentfield" && cf.fieldname !== "idx")
                    .map((cf) => ({
                      field: cf.fieldname,
                      label: cf.label,
                      type: cf.fieldtype === "Check" ? "checkbox" :
                            cf.fieldtype === "Select" ? "select" :
                            cf.fieldtype === "Int" ? "number" :
                            cf.fieldtype === "Float" || cf.fieldtype === "Currency" ? "number" :
                            cf.fieldtype === "Link" ? "link" : "text",
                      options: cf.options,
                      required: cf.reqd,
                      fetchFrom: cf.fetch_from,
                    }))
                  }
                  value={doc[row[0].fieldname] || []}
                  onChange={(val) => handleFieldChange(row[0].fieldname, val)}
                />
              </div>
            );
          }

          // Regular field row
          return (
            <div key={rowIdx} className="row mb-3">
              {row.map((field) => {
                const colSize = row.length >= 3 ? 4 : row.length === 2 ? 6 : 12;
                // Skip hidden fields
                if (field.hidden) return null;

                return (
                  <div key={field.fieldname} className={`col-md-${colSize}`}>
                    {field.fieldtype === "Check" ? (
                      renderField(field)
                    ) : (
                      <FormField
                        label={field.label}
                        required={field.reqd}
                      >
                        {renderField(field)}
                      </FormField>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  /* ===============================
     BUILD FORM LAYOUT
  ============================== */
  const buildFormLayout = () => {
    if (!meta) return null;

    // Group fields by Section Break
    const sections = [];
    let currentSection = null;

    meta.forEach((field) => {
      if (field.fieldtype === "Section Break") {
        currentSection = {
          label: field.label || "",
          description: field.description || "",
          fields: [],
        };
        sections.push(currentSection);
      } else if (field.fieldtype === "Tab Break") {
        currentSection = {
          label: field.label || "",
          description: "",
          fields: [],
          isTab: true,
        };
        sections.push(currentSection);
      } else if (currentSection) {
        currentSection.fields.push(field);
      }
    });

    // If no section breaks, put all fields in one section
    if (sections.length === 0) {
      sections.push({
        label: "",
        description: "",
        fields: meta.filter((f) => !SKIP_FIELDS.includes(f.fieldtype) && !SYSTEM_FIELDS.includes(f.fieldname)),
      });
    }

    return sections.map((section, idx) => {
      // Skip empty sections
      const visibleFields = section.fields.filter(
        (f) => !SYSTEM_FIELDS.includes(f.fieldname)
      );
      if (visibleFields.length === 0) return null;

      return (
        <div key={idx} className="form-section mb-4">
          {section.label && (
            <div className="form-section-title mb-3">{section.label}</div>
          )}
          {section.description && (
            <div className="text-muted small mb-2">{section.description}</div>
          )}
          {renderSection(visibleFields)}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="mt-2 text-muted small">Loading form...</div>
      </div>
    );
  }

  return (
    <div className="generic-form" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {buildFormLayout()}

      {/* Read-only system info for existing docs */}
      {!isNew && (
        <div className="text-muted small mt-4 pt-3 border-top">
          <div className="row">
            <div className="col-md-3">ID: {doc.name}</div>
            <div className="col-md-3">Created: {doc.creation}</div>
            <div className="col-md-3">Modified: {doc.modified}</div>
            <div className="col-md-3">Owner: {doc.owner}</div>
          </div>
        </div>
      )}

      {/* Bottom save button */}
      <div className="mt-4 mb-4">
        <button
          className="btn btn-success"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" />
              Saving...
            </>
          ) : (
            <>
              <i className="bi bi-check-lg me-2"></i>
              Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
