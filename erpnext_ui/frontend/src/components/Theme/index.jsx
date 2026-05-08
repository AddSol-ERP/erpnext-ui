import { useState, useEffect } from "react";

export default function ThemePanel({ applyTheme }) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState(`{
  "primary": "#00d1ff",
  "secondary": "#7b61ff",
  "mode": "dark"
}`);

  useEffect(() => {
    const savedTheme = localStorage.getItem("app_theme");
    if (savedTheme) {
      setJson(savedTheme);
    }
  }, []);

  const handleApply = () => {
    try {
      const config = JSON.parse(json);
      applyTheme(config);

      localStorage.setItem("app_theme", json);
      alert("Theme applied and saved! ✨");
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
            border: "1px solid var(--bs-border-color)",
            boxShadow: "var(--shadow-strong)",
            background: "var(--bs-body-bg)",
          }}
        >
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

          <div className="d-flex gap-2 mt-2 justify-content-end">
            <button className="btn btn-primary w-100" onClick={handleApply}>
              Apply
            </button>

            <button
              className="btn btn-outline-primary w-100"
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
