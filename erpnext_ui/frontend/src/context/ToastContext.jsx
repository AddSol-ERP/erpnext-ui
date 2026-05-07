import { createContext, useContext, useState } from "react";
import ToastContainer from "../components/StockEntry/components/ToastContainer";

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (toast) => {
    const id = Date.now();

    setToasts((prev) => [...prev, { id, ...toast }]);

    if (!toast.persist) {
      setTimeout(() => removeToast(id), toast.duration || 3000);
    }

    return id;
  };

  const updateToast = (id, updates) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    );
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toast = {
    success: (msg) => addToast({ type: "success", message: msg }),
    error: (msg) => addToast({ type: "error", message: msg }),
    warning: (msg) => addToast({ type: "warning", message: msg }),
    info: (msg) => addToast({ type: "info", message: msg }),

    loading: (msg) =>
      addToast({ type: "loading", message: msg, persist: true }),

    update: (id, data) => updateToast(id, data),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
