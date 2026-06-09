import { useState, useEffect } from "react";
import FieldRenderer from "./FieldRenderer";
import { get } from "../../services/api";

export default function ChildTable({
  title = "Items",
  columns = [],
  value = [],
  onChange,
}) {
  const [data, setData] = useState(value || []);

  useEffect(() => {
    setData(value || []);
  }, [value]);

  const update = (newData) => {
    setData(newData);
    onChange && onChange(newData);
  };

  const handleChange = async (rowIndex, field, val) => {
    const updated = [...data];
    updated[rowIndex][field] = val;

    // ===== Auto-calculate amount = qty × rate =====
    const colFields = columns.map((c) => c.field);
    if (
      colFields.includes("amount") &&
      (field === "qty" || field === "rate")
    ) {
      const qty = parseFloat(updated[rowIndex].qty) || 0;
      const rate = parseFloat(updated[rowIndex].rate) || 0;
      updated[rowIndex].amount = qty * rate;
    }

    // ===== fetch_from auto-population in child rows =====
    const changedCol = columns.find((c) => c.field === field);
    if (changedCol?.type === "link" && changedCol.options && val) {
      const dependentCols = columns.filter(
        (c) => c.fetchFrom && c.fetchFrom.startsWith(field + ".")
      );
      if (dependentCols.length > 0) {
        try {
          const res = await get(
            `resource/${changedCol.options}/${encodeURIComponent(val)}`
          );
          const linkedData = res.data || {};
          dependentCols.forEach((col) => {
            const sourceKey = col.fetchFrom.split(".").slice(1).join(".");
            if (linkedData[sourceKey] !== undefined) {
              updated[rowIndex][col.field] = linkedData[sourceKey];
            }
          });
        } catch (e) {
          console.warn("Child row fetch_from failed:", e);
        }
      }
    }

    update(updated);
  };

  const addRow = () => {
    const newRow = {};
    columns.forEach((col) => {
      newRow[col.field] = col.default || "";
    });
    update([...data, newRow]);
  };

  const deleteRow = (index) => {
    update(data.filter((_, i) => i !== index));
  };

  return (
    <div className="child-table">
      {/* 🔹 HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-3 form-section-title ">
        <div className="mb-0">{title}</div>

        <button className="btn btn-primary btn-sm" onClick={addRow}>
          <i className="bi bi-plus"></i> Add Row
        </button>
      </div>

      {/* =========================
          🖥 DESKTOP TABLE
      ========================= */}
      <div className="table-responsive d-none d-md-block">
        <table className="table align-middle">
          <thead>
            <tr>
              <th style={{ width: "40px" }}>#</th>

              {columns.map((col) => (
                <th key={col.field}>{col.label}</th>
              ))}

              <th style={{ width: "50px" }}></th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2}>
                  <div className="child-table-empty">
                    No data available. Click "Add Row".
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {/* INDEX */}
                  <td className="text-muted small">{rowIndex + 1}</td>

                  {/* FIELDS */}
                  {columns.map((col) => (
                    <td key={col.field}>
                      <FieldRenderer
                        type={col.type}
                        value={row[col.field]}
                        options={col.options}
                        onChange={(val) =>
                          handleChange(rowIndex, col.field, val)
                        }
                      />
                    </td>
                  ))}

                  {/* DELETE */}
                  <td>
                    <button
                      className="btn btn-icon text-danger"
                      onClick={() => deleteRow(rowIndex)}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* =========================
          📱 MOBILE CARD VIEW
      ========================= */}
      <div className="d-block d-md-none">
        {data.length === 0 ? (
          <div className="child-table-empty">
            No data available. Click "Add Row".
          </div>
        ) : (
          data.map((row, rowIndex) => (
            <div key={rowIndex} className="child-card">
              {/* HEADER */}
              <div className="child-card-header">
                <span>Row {rowIndex + 1}</span>

                <button
                  className="btn btn-icon text-danger"
                  onClick={() => deleteRow(rowIndex)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              </div>

              {/* FIELDS */}
              {columns.map((col) => (
                <div key={col.field} className="child-card-field">
                  <div className="child-label">{col.label}</div>

                  <FieldRenderer
                    type={col.type}
                    value={row[col.field]}
                    options={col.options}
                    onChange={(val) => handleChange(rowIndex, col.field, val)}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
