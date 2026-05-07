import { useEffect } from "react";

export default function RightDrawer({
  show,
  onClose,
  title,
  children,
  width = "md", // sm | md | lg
}) {
  const widthMap = {
    sm: "320px",
    md: "420px",
    lg: "520px",
  };

  // 🔥 Prevent body scroll when open
  useEffect(() => {
    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [show]);

  return (
    <>
      {/* BACKDROP */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: show ? "rgba(0,0,0,0.35)" : "transparent",
          opacity: show ? 1 : 0,
          transition: "opacity 0.25s ease",
          pointerEvents: show ? "auto" : "none",
          zIndex: 1050,
        }}
      />

      {/* DRAWER */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100dvh",
          width: widthMap[width] || widthMap.md,
          maxWidth: "100%",
          borderLeft: "1px solid var(--bs-border-color)",
          boxShadow: "-10px 0 30px rgba(0,0,0,0.15)",
          transform: show ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 1051,
          display: "flex",
          flexDirection: "column",
          background: "var(--drawer-bg, #ffffff)",
          color: "var(--drawer-color, #000)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* HEADER */}
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <div className="fw-semibold">{title}</div>

          <button className="btn btn-sm btn-light" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* BODY */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "16px",
            paddingBottom: "32px",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
