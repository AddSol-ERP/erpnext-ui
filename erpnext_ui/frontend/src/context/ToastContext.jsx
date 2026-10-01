import { createContext, useContext, useEffect, useState } from "react";
import { toast as sonnerToast, Toaster } from "sonner";
import { getDirection } from "@/i18n";

const ToastContext = createContext();

function readThemeState() {
  const el = document.documentElement;
  return {
    mode: el.getAttribute("data-theme") === "light" ? "light" : "dark",
    dir: getDirection(el.lang || "en"),
  };
}

export function ToastProvider({ children }) {
  // Follow the document theme/language so the toaster flips with
  // ThemePanel changes and language switches (RTL position).
  const [themeState, setThemeState] = useState(readThemeState);

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setThemeState(readThemeState()));
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-theme", "lang", "dir"],
    });
    return () => observer.disconnect();
  }, []);

  const toast = {
    success: (msg) => sonnerToast.success(msg),
    error: (msg) => sonnerToast.error(msg),
    warning: (msg) => sonnerToast.warning(msg),
    info: (msg) => sonnerToast.info(msg),
    loading: (msg) => sonnerToast.loading(msg),
    dismiss: (id) => sonnerToast.dismiss(id),

    /** Update an existing toast (sonner reuses the id to replace it). */
    update: (id, data = {}) => {
      const type = data.type || "info";
      const fn =
        {
          success: sonnerToast.success,
          error: sonnerToast.error,
          warning: sonnerToast.warning,
          info: sonnerToast.info,
          loading: sonnerToast.loading,
        }[type] || sonnerToast;
      fn(data.message ?? "", { id, duration: data.persist ? Infinity : undefined });
    },
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toaster
        theme={themeState.mode}
        richColors
        closeButton
        position={themeState.dir === "rtl" ? "bottom-left" : "bottom-right"}
      />
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
