import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { get, post } from "../../../../services/api";
import { FormField } from "../../../../components/FormField";
import LinkField from "../../../../components/LinkField";
import { useHeader } from "../../../../context/HeaderContext";

export default function MaterialRequestForm() {
  const { name, type } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const isEdit = !!name;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [doc, setDoc] = useState({
    material_request_type: "",
    company: "",
    customer: "", // ✅ NEW
    schedule_date: "",
    items: [],
    docstatus: 0,
  });

  /* ================= HEADER ================= */
  useEffect(() => {
    const typeLabel = doc.material_request_type || "Material Request";

    setHeader({
      title: isEdit ? name : "New Material Request",
      subtitle: isEdit
        ? `${typeLabel} • ${doc.docstatus === 1 ? "Submitted" : "Draft"}`
        : `Create ${typeLabel}`,

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Store", path: "/store" },
        { label: "Material Requests", path: "/store/material-request" },
        doc.material_request_type && {
          label: doc.material_request_type,
          path: `/store/material-request/type/${doc.material_request_type}`,
        },
        { label: isEdit ? name : "New" },
      ].filter(Boolean),

      actions: [
        !doc.docstatus && {
          label: loading ? "Saving..." : "Save",
          variant: "btn-success",
          icon: "bi bi-save",
          onClick: handleSave,
        },

        isEdit &&
          doc.docstatus === 0 && {
            label: "Submit",
            variant: "btn-primary",
            icon: "bi bi-check-circle",
            onClick: handleSubmit,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
  }, [isEdit, name, doc.docstatus, doc.material_request_type, loading]);

  /* ================= DEFAULT ================= */
  useEffect(() => {
    if (!isEdit) {
      const t = type || params.get("type");

      setDoc((p) => ({
        ...p,
        material_request_type: t || "",
        schedule_date: new Date().toISOString().split("T")[0],
      }));

      autoCompany();
    }
  }, []);

  const autoCompany = async () => {
    try {
      const res = await get("method/frappe.client.get_list", {
        doctype: "Company",
        fields: JSON.stringify(["name"]),
        limit_page_length: 1,
      });

      if (res.message?.length) {
        setDoc((p) => ({ ...p, company: res.message[0].name }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= TYPE CHANGE CLEANUP ================= */
  useEffect(() => {
    setDoc((prev) => ({
      ...prev,
      customer:
        prev.material_request_type === "Customer Provided" ? prev.customer : "",
      items: prev.items.map((row) => ({
        ...row,
        from_warehouse:
          prev.material_request_type === "Transfer" ? row.from_warehouse : "",
      })),
    }));
  }, [doc.material_request_type]);

  /* ================= LOAD ================= */
  useEffect(() => {
    if (isEdit) loadDoc();
  }, [name]);

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Material Request/${name}`);
      const d = res.data;

      setDoc({
        material_request_type: d.material_request_type,
        company: d.company,
        customer: d.customer || "", // ✅
        schedule_date: d.schedule_date,
        items: d.items || [],
        docstatus: d.docstatus,
      });
    } catch {
      setError("Failed to load document");
    } finally {
      setLoading(false);
    }
  };

  /* ================= ITEMS ================= */
  const addRow = () => {
    setDoc((p) => ({
      ...p,
      items: [
        ...p.items,
        {
          item_code: "",
          qty: "",
          uom: "",
          stock_uom: "",
          conversion_factor: 1,
          schedule_date: p.schedule_date,
          from_warehouse: "",
          warehouse: "",
        },
      ],
    }));
  };

  const updateRow = (i, field, value) => {
    const updated = [...doc.items];
    updated[i][field] = value;
    setDoc({ ...doc, items: updated });
  };

  const removeRow = (i) => {
    setDoc({
      ...doc,
      items: doc.items.filter((_, idx) => idx !== i),
    });
  };

  /* ================= VALIDATION ================= */
  const validate = () => {
    if (!doc.material_request_type) return "Type is required";
    if (!doc.company) return "Company required";

    // ✅ CUSTOMER PROVIDED
    if (doc.material_request_type === "Customer Provided") {
      if (!doc.customer) return "Customer is required";
    }

    if (!row.uom) return "UOM required";
    if (!row.conversion_factor || row.conversion_factor <= 0)
      return "Invalid conversion factor";

    if (!doc.items.length) return "Add at least one item";

    for (const row of doc.items) {
      if (!row.item_code || !row.qty) return "Fill all item rows";

      if (parseFloat(row.qty) <= 0) return "Qty must be > 0";

      if (doc.material_request_type === "Transfer") {
        if (!row.from_warehouse || !row.warehouse) {
          return "From & To warehouse required";
        }

        if (row.from_warehouse === row.warehouse) {
          return "Source and target warehouse cannot be same";
        }
      } else {
        if (!row.warehouse) return "Warehouse required";
      }
    }

    return "";
  };

  /* ================= SAVE ================= */
  const handleSave = async () => {
    const err = validate();
    if (err) return setError(err);

    try {
      setLoading(true);
      setError("");

      let res;

      if (isEdit) {
        await post(`resource/Material Request/${name}`, doc);
        res = { data: { name } };
      } else {
        res = await post("resource/Material Request", doc);
      }

      navigate(
        `/store/material-request/${doc.material_request_type}/view/${res.data.name}`,
      );
    } catch {
      setError("Save failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async () => {
    try {
      setLoading(true);

      await post("method/frappe.client.submit", {
        doctype: "Material Request",
        name: name,
      });

      loadDoc();
    } catch {
      setError("Submit failed");
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = async (i, itemCode) => {
    updateRow(i, "item_code", itemCode);

    try {
      const res = await get(`resource/Item/${itemCode}`);
      const item = res.data;

      updateRow(i, "uom", item.stock_uom);
      updateRow(i, "stock_uom", item.stock_uom);
      updateRow(i, "conversion_factor", 1);
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= UI ================= */
  return (
    <div className="container-fluid px-2 px-md-3">
      {error && <div className="alert alert-danger">{error}</div>}

      {/* BASIC */}
      <div className="card mb-3">
        <div className="card-body row g-2">
          <div className="col-md-4">
            <FormField label="Type" required>
              <select
                className="form-select"
                disabled={isEdit}
                value={doc.material_request_type}
                onChange={(e) =>
                  setDoc({ ...doc, material_request_type: e.target.value })
                }
              >
                <option value="">Select</option>
                <option>Purchase</option>
                <option>Transfer</option>
                <option>Material Issue</option>
                <option>Material Receipt</option>
                <option>Customer Provided</option>
              </select>
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Company" required>
              <LinkField
                doctype="Company"
                value={doc.company}
                onChange={(v) => setDoc({ ...doc, company: v })}
              />
            </FormField>
          </div>

          {/* ✅ CUSTOMER FIELD */}
          {doc.material_request_type === "Customer Provided" && (
            <div className="col-md-4">
              <FormField label="Customer" required>
                <LinkField
                  doctype="Customer"
                  value={doc.customer}
                  onChange={(v) => setDoc({ ...doc, customer: v })}
                />
              </FormField>
            </div>
          )}

          <div className="col-md-4">
            <FormField label="Schedule Date">
              <input
                type="date"
                className="form-control"
                value={doc.schedule_date}
                onChange={(e) =>
                  setDoc({ ...doc, schedule_date: e.target.value })
                }
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* ITEMS */}
      <div className="card">
        <div className="card-body">
          <div className="d-flex justify-content-between mb-2">
            <h6>Items</h6>
            {!doc.docstatus && (
              <button className="btn btn-sm btn-primary" onClick={addRow}>
                + Add Row
              </button>
            )}
          </div>

          {doc.items.map((row, i) => (
            <div key={i} className="row g-2 mb-2">
              {/* ITEM */}
              <div className="col-md-3">
                <FormField label="Item" required>
                  <LinkField
                    doctype="Item"
                    value={row.item_code}
                    onChange={(v) => handleItemChange(i, v)}
                  />
                </FormField>
              </div>

              {/* QTY */}
              <div className="col-md-1">
                <FormField label="Qty" required>
                  <input
                    type="number"
                    className="form-control"
                    value={row.qty}
                    onChange={(e) => updateRow(i, "qty", e.target.value)}
                  />
                </FormField>
              </div>

              {/* UOM */}
              <div className="col-md-2">
                <FormField label="UOM" required>
                  <LinkField
                    doctype="UOM"
                    value={row.uom}
                    onChange={(v) => updateRow(i, "uom", v)}
                  />
                </FormField>
              </div>

              {/* STOCK UOM (READ ONLY) */}
              <div className="col-md-2">
                <FormField label="Stock UOM">
                  <input
                    className="form-control"
                    value={row.stock_uom || ""}
                    disabled
                  />
                </FormField>
              </div>

              {/* CONVERSION */}
              <div className="col-md-1">
                <FormField label="Conv">
                  <input
                    type="number"
                    className="form-control"
                    value={row.conversion_factor || 1}
                    onChange={(e) =>
                      updateRow(i, "conversion_factor", e.target.value)
                    }
                  />
                </FormField>
              </div>

              {/* SOURCE (TRANSFER ONLY) */}
              {doc.material_request_type === "Transfer" && (
                <div className="col-md-3">
                  <FormField label="Source" required>
                    <LinkField
                      doctype="Warehouse"
                      value={row.from_warehouse}
                      onChange={(v) => updateRow(i, "from_warehouse", v)}
                    />
                  </FormField>
                </div>
              )}

              {/* TARGET */}
              <div className="col-md-3">
                <FormField label="Warehouse" required>
                  <LinkField
                    doctype="Warehouse"
                    value={row.warehouse}
                    onChange={(v) => updateRow(i, "warehouse", v)}
                  />
                </FormField>
              </div>

              {/* DATE */}
              <div className="col-md-2">
                <FormField label="Schedule">
                  <input
                    type="date"
                    className="form-control"
                    value={row.schedule_date}
                    onChange={(e) =>
                      updateRow(i, "schedule_date", e.target.value)
                    }
                  />
                </FormField>
              </div>

              {/* DELETE */}
              {!doc.docstatus && (
                <div className="col-md-12 col-lg-1 d-flex align-items-end">
                  <button
                    className="btn btn-danger w-100"
                    onClick={() => removeRow(i)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
