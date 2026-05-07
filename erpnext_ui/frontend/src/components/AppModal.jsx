export default function AppModal({
  show,
  onClose,
  title,
  children,
  footer,
  width = "md", // sm | md | lg | fullscreen
}) {
  if (!show) return null;

  const widthMap = {
    sm: "modal-sm",
    md: "modal-md",
    lg: "modal-lg",
  };

  const isFullscreen = width === "fullscreen";

  return (
    <>
      <div className="modal d-block" tabIndex="-1">
        <div
          className={`modal-dialog ${
            isFullscreen
              ? "modal-fullscreen"
              : `modal-dialog-centered ${widthMap[width] || ""}`
          }`}
          style={{
            margin: isFullscreen ? 0 : "1.75rem auto", // 👈 keeps center spacing
          }}
        >
          <div
            className="modal-content"
            style={{
              height: width === "fullscreen" ? "100vh" : "auto",
              maxHeight: width === "fullscreen" ? "100vh" : "95vh",
              background: "var(--card-bg)",
              border: "1px solid var(--bs-border-color)",
              borderRadius: width === "fullscreen" ? "0" : "16px",
              backdropFilter: "blur(12px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* HEADER */}
            <div className="modal-header border-0">
              <h5 className="modal-title">{title}</h5>
              <button className="btn-close" onClick={onClose} />
            </div>

            {/* BODY */}
            <div
              className="modal-body pt-0"
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
              }}
            >
              {children}
            </div>

            {/* FOOTER */}
            {footer && (
              <div
                className="modal-footer border-0"
                style={{
                  position: "sticky",
                  bottom: 0,
                  background: "var(--card-bg)",
                }}
              >
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BACKDROP */}
      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
  );
}
