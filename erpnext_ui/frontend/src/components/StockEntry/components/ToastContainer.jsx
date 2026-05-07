function ToastContainer({ toasts, removeToast }) {
  const getIcon = (type) => {
    switch (type) {
      case "success":
        return "bi-check-circle-fill";
      case "error":
        return "bi-x-circle-fill";
      case "warning":
        return "bi-exclamation-triangle-fill";
      case "info":
        return "bi-info-circle-fill";
      default:
        return "bi-arrow-repeat"; // loading
    }
  };

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type} show`}>
          {/* LEFT ICON */}
          <div className="toast-icon">
            {t.type === "loading" ? (
              <span className="spinner" />
            ) : (
              <i className={`bi ${getIcon(t.type)}`} />
            )}
          </div>

          {/* CONTENT */}
          <div className="toast-body">
            <div className="toast-message">{t.message}</div>

            {/* optional description */}
            {t.description && <div className="toast-sub">{t.description}</div>}
          </div>

          {/* CLOSE */}
          <button className="toast-close" onClick={() => removeToast(t.id)}>
            <i className="bi bi-x"></i>
          </button>

          {/* PROGRESS BAR */}
          {!t.persist && <div className="toast-progress" />}
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
