import { useState, useEffect } from "react";
import { useHeader } from "../context/HeaderContext";
import { FormField } from "../components/FormField";
import ChildTable from "../components/ChildTable";
import { get } from "../services/api";

export default function DemoForm() {
  const { setHeader } = useHeader();

  const [form, setForm] = useState({
    name: "",
    age: "",
    salary: "",
    description: "",
    date: "",
    datetime: "",
    time: "",
    status: "Open",
    active: false,
    department: "",
    attachment: null,
  });
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    setHeader({
      title: "🧾 Universal Form",
      subtitle: "All field types demo",
      actions: [
        {
          label: "Save",
          icon: "bi bi-check",
          onClick: () => console.log(form),
        },
      ],
    });

    return () => setHeader({ title: "", subtitle: "", actions: [] });
  }, [form]);

  useEffect(() => {
    getResouse();
  }, []);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const getResouse = async () => {
    console.log("asdhajkshdj");
    // let res = await get(`resource/Work Order`);
    // console.log(res, "res");
  };

  return (
    <div className="form-container" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* BASIC */}
      <div className="form-section">
        <div className="form-section-title">Basic Fields</div>

        <div className="row">
          <div className="col-md-4">
            <FormField label="Name" required>
              <input
                className="form-control"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Age">
              <input
                type="number"
                className="form-control"
                value={form.age}
                onChange={(e) => handleChange("age", e.target.value)}
              />
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Salary">
              <input
                type="number"
                className="form-control"
                value={form.salary}
                onChange={(e) => handleChange("salary", e.target.value)}
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* TEXT */}
      <div className="form-section">
        <div className="form-section-title">Text Fields</div>

        <FormField label="Description">
          <textarea
            className="form-control"
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
          />
        </FormField>
      </div>

      {/* DATE */}
      <div className="form-section">
        <div className="form-section-title">Date & Time</div>

        <div className="row">
          <div className="col-md-4">
            <FormField label="Date">
              <input
                type="date"
                className="form-control"
                onChange={(e) => handleChange("date", e.target.value)}
              />
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Datetime">
              <input
                type="datetime-local"
                className="form-control"
                onChange={(e) => handleChange("datetime", e.target.value)}
              />
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Time">
              <input
                type="time"
                className="form-control"
                onChange={(e) => handleChange("time", e.target.value)}
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* SELECT */}
      <div className="form-section">
        <div className="form-section-title">Selection</div>

        <div className="row">
          <div className="col-md-4">
            <FormField label="Status">
              <select
                className="form-select"
                value={form.status}
                onChange={(e) => handleChange("status", e.target.value)}
              >
                <option>Open</option>
                <option>Pending</option>
                <option>Closed</option>
              </select>
            </FormField>
          </div>

          <div className="col-md-4">
            <FormField label="Department (Link)">
              <input
                className="form-control"
                placeholder="Search department..."
                onChange={(e) => handleChange("department", e.target.value)}
              />
            </FormField>
          </div>

          <div className="col-md-4 d-flex align-items-center">
            <FormField label="Active">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => handleChange("active", e.target.checked)}
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* FILE */}
      <div className="form-section">
        <div className="form-section-title">Attachments</div>

        <FormField label="Upload File">
          <div className="file-upload">
            <label className="file-upload-label">
              <input
                type="file"
                onChange={(e) => {
                  const file = e.target.files[0];
                  setFileName(file?.name || "");
                  handleChange("attachment", file);
                }}
              />

              <span className="file-upload-btn">
                <i className="bi bi-upload"></i>
                Choose File
              </span>
            </label>

            <div className="file-upload-name">
              {fileName || "No file selected"}
            </div>
          </div>
        </FormField>
      </div>

      {/* TABLE (SIMPLIFIED DEMO) */}
      <ChildTable
        columns={[
          { label: "Item Code", field: "item_code", type: "text" },
          { label: "Qty", field: "qty", type: "number" },
          { label: "Rate", field: "rate", type: "number" },
        ]}
        value={[{ item_code: "ITEM-001", qty: 10, rate: 100 }]}
        onChange={(data) => console.log(data)}
      />
    </div>
  );
}
