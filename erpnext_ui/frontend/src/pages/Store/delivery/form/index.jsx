import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHeader } from "../../../../context/HeaderContext";
import { get, post } from "../../../../services/api";
import { FormField } from "../../../../components/FormField";
import LinkField from "../../../../components/LinkField";
import DeliveryNotePicker from "./DeliveryNotePicker";

export default function DeliveryNoteForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [showSource, setShowSource] = useState(false);
  const isEdit = !!name;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [doc, setDoc] = useState({
    customer: "",
    company: "",
    posting_date: "",
    set_warehouse: "",
    items: [],
    // dispatch
    driver: "",
    vehicle_no: "",
    transporter: "",
    lr_number: "",
    dispatch_date: "",
    docstatus: 0,
  });

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit ? `Delivery ${name}` : "New Delivery",
      subtitle: "Dispatch goods",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Store", path: "/store" },
        { label: "Delivery", path: "/store/delivery" },
        { label: isEdit ? name : "New" },
      ],

      actions: [
        {
          label: "← Back",
          variant: "btn-outline-primary",
          onClick: () => navigate(-1),
        },
        !doc.docstatus && {
          label: loading ? "Saving..." : "💾 Save",
          variant: "btn-success",
          onClick: handleSave,
        },
        isEdit &&
          doc.docstatus === 0 && {
            label: "Submit",
            variant: "btn-primary",
            onClick: handleSubmit,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
  }, [loading, doc]);

  /* ================= INIT ================= */
  useEffect(() => {
    if (isEdit) loadDoc();
    else {
      setDoc((p) => ({
        ...p,
        posting_date: new Date().toISOString().split("T")[0],
      }));
      autoCompany();
    }
  }, [name]);

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
    } catch {}
  };

  /* ================= LOAD ================= */
  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Delivery Note/${name}`);
      const d = res.data;

      setDoc({
        customer: d.customer,
        company: d.company,
        posting_date: d.posting_date,
        set_warehouse: d.set_warehouse,
        items: d.items || [],
        driver: d.driver || "",
        vehicle_no: d.vehicle_no || "",
        transporter: d.transporter || "",
        lr_number: d.lr_number || "",
        dispatch_date: d.dispatch_date || "",
        docstatus: d.docstatus,
      });
    } catch {
      setError("Failed to load");
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
          warehouse: p.set_warehouse || "",
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

  /* ================= ITEM AUTO-POPULATE ================= */
  const handleItemChange = async (i, itemCode) => {
    const updated = [...doc.items];
    updated[i].item_code = itemCode;

    // Auto-fill UOM from Item master
    try {
      const res = await get(`resource/Item/${encodeURIComponent(itemCode)}`);
      const item = res.data;
      if (item) {
        updated[i].uom = item.stock_uom || "";
      }
    } catch (e) {
      console.warn("Failed to fetch item details:", e);
    }

    setDoc({ ...doc, items: updated });
  };

  /* ================= VALIDATION ================= */
  const validate = () => {
    if (!doc.customer) return "Customer required";
    if (!doc.company) return "Company required";
    if (!doc.items.length) return "Add items";

    for (const row of doc.items) {
      if (!row.item_code || !row.qty) return "Fill item rows";
      if (parseFloat(row.qty) <= 0) return "Qty must be > 0";
      if (!row.warehouse) return "Warehouse required";
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
        await post(`resource/Delivery Note/${name}`, doc);
        res = { data: { name } };
      } else {
        res = await post("resource/Delivery Note", doc);
      }

      navigate(`/store/delivery/${res.data.name}`);
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
        doctype: "Delivery Note",
        name,
      });

      loadDoc();
    } catch {
      setError("Submit failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI ================= */
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {showSource && (
        <DeliveryNotePicker
          show={showSource}
          onClose={() => setShowSource(false)}
          onLoad={(data) => {
            setDoc((p) => ({
              ...p,
              customer: data.customer || p.customer,
              items: data.items,
            }));
          }}
        />
      )}
      {error && <div className="alert alert-danger">{error}</div>}

      {/* BASIC */}
      <div className="card mb-3">
        <div className="card-body row g-2">
          <div className="col-md-4">
            <FormField label="Customer" required>
              <LinkField
                doctype="Customer"
                value={doc.customer}
                onChange={(v) => setDoc({ ...doc, customer: v })}
              />
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

          <div className="col-md-4">
            <FormField label="Posting Date">
              <input
                type="date"
                className="form-control"
                value={doc.posting_date}
                onChange={(e) =>
                  setDoc({ ...doc, posting_date: e.target.value })
                }
              />
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Default Warehouse">
              <LinkField
                doctype="Warehouse"
                value={doc.set_warehouse}
                onChange={(v) => setDoc({ ...doc, set_warehouse: v })}
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* ITEMS */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex justify-content-between mb-2">
            <h6>Items</h6>

            {!doc.docstatus && (
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setShowSource(true)}
                >
                  📦 Get Items
                </button>

                <button className="btn btn-sm btn-primary" onClick={addRow}>
                  + Add Row
                </button>
              </div>
            )}
          </div>

          {doc.items.map((row, i) => (
            <div key={i} className="row g-2 mb-2 align-items-end">
              <div className="col-md-3">
                <FormField label="Item" required>
                  <LinkField
                    doctype="Item"
                    value={row.item_code}
                    onChange={(v) => handleItemChange(i, v)}
                  />
                </FormField>
              </div>

              <div className="col-md-2">
                <FormField label="Qty" required>
                  <input
                    type="number"
                    className="form-control"
                    value={row.qty}
                    onChange={(e) => updateRow(i, "qty", e.target.value)}
                  />
                </FormField>
              </div>

              <div className="col-md-2">
                <FormField label="UOM">
                  <input
                    className="form-control"
                    value={row.uom}
                    onChange={(e) => updateRow(i, "uom", e.target.value)}
                  />
                </FormField>
              </div>

              <div className="col-md-3">
                <FormField label="Warehouse" required>
                  <LinkField
                    doctype="Warehouse"
                    value={row.warehouse}
                    onChange={(v) => updateRow(i, "warehouse", v)}
                  />
                </FormField>
              </div>

              {!doc.docstatus && (
                <div className="col-md-2">
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

      {/* DISPATCH */}
      <div className="card">
        <div className="card-body row g-2">
          <div className="col-md-3">
            <FormField label="Driver">
              <input
                className="form-control"
                value={doc.driver}
                onChange={(e) => setDoc({ ...doc, driver: e.target.value })}
              />
            </FormField>
          </div>

          <div className="col-md-3">
            <FormField label="Vehicle No">
              <input
                className="form-control"
                value={doc.vehicle_no}
                onChange={(e) => setDoc({ ...doc, vehicle_no: e.target.value })}
              />
            </FormField>
          </div>

          <div className="col-md-3">
            <FormField label="Transporter">
              <input
                className="form-control"
                value={doc.transporter}
                onChange={(e) =>
                  setDoc({ ...doc, transporter: e.target.value })
                }
              />
            </FormField>
          </div>

          <div className="col-md-3">
            <FormField label="LR Number">
              <input
                className="form-control"
                value={doc.lr_number}
                onChange={(e) => setDoc({ ...doc, lr_number: e.target.value })}
              />
            </FormField>
          </div>
        </div>
      </div>
    </div>
  );
}
