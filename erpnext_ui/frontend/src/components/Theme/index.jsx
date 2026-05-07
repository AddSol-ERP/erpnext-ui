import { useState } from "react";

export default function ThemePanel({ applyTheme }) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState(`{
  "primary": "#00d1ff",
  "secondary": "#7b61ff",
  "mode": "dark"
}`);

  const handleApply = () => {
    try {
      const config = JSON.parse(json);
      applyTheme(config);

      // optional: persist
      localStorage.setItem("app_theme", JSON.stringify(config));
    } catch (err) {
      alert("Invalid JSON ❌");
      console.error(err);
    }
  };

  return (
    <>
      {/* BUTTON */}
      <button className="btn btn-icon" onClick={() => setOpen(true)}>
        <i className="bi bi-palette" />
      </button>

      {/* PANEL */}
      {open && (
        <div
          style={{
            position: "fixed",
            top: "80px",
            right: "20px",
            width: "320px",
            zIndex: 9999,
            padding: "14px",
            borderRadius: "12px",
            background: "var(--card-bg)",
            border: "1px solid var(--bs-border-color)",
            boxShadow: "var(--shadow-strong)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Theme JSON</div>

          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            style={{
              width: "100%",
              height: "120px",
              borderRadius: "8px",
              padding: "8px",
              fontSize: "12px",
              background: "var(--input-bg)",
              color: "var(--bs-body-color)",
              border: "1px solid var(--bs-border-color)",
            }}
          />

          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <button className="btn btn-primary btn-sm" onClick={handleApply}>
              Apply
            </button>

            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
