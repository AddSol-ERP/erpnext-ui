import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import I18nProvider from "./i18n/I18nProvider";
import { HeaderProvider } from "./context/HeaderContext";
import { ToastProvider } from "./context/ToastContext";
import { RoleProvider } from "./context/RoleContext";
import applyTheme from "./utils/theme";

// Initialize theme on app load
function initializeTheme() {
  const savedTheme = localStorage.getItem("app_theme");
  if (savedTheme) {
    try {
      const config = JSON.parse(savedTheme);
      applyTheme(config);
    } catch (e) {
      console.error("Failed to load saved theme:", e);
      applyTheme({ primary: "#4f46e5", secondary: "#6366f1", mode: "light" });
    }
  } else {
    applyTheme({ primary: "#4f46e5", secondary: "#6366f1", mode: "light" });
  }
}

initializeTheme();

const rootElement = document.getElementById("root");

// 👇 DEV MODE (normal React)
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <I18nProvider>
      <ToastProvider>
        <HeaderProvider>
          <RoleProvider>
            <App />
          </RoleProvider>
        </HeaderProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

// 👇 ERPNext mode
const mountErpUI = function (id) {
  const el = document.getElementById(id);
  if (!el) return;

  initializeTheme();

  const root = ReactDOM.createRoot(el);
  root.render(
    <I18nProvider>
      <ToastProvider>
        <HeaderProvider>
          <RoleProvider>
            <App />
          </RoleProvider>
        </HeaderProvider>
      </ToastProvider>
    </I18nProvider>,
  );
};

// Export to window for IIFE usage
if (typeof window !== "undefined") {
  window.mountErpUI = mountErpUI;
}

export { mountErpUI };
