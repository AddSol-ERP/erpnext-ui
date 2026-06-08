import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./index.css";
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
      applyTheme({ primary: "#00d1ff", secondary: "#7b61ff", mode: "dark" });
    }
  } else {
    applyTheme({ primary: "#00d1ff", secondary: "#7b61ff", mode: "dark" });
  }
}

initializeTheme();

const rootElement = document.getElementById("root");

// 👇 DEV MODE (normal React)
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ToastProvider>
      <HeaderProvider>
        <RoleProvider>
          <App />
        </RoleProvider>
      </HeaderProvider>
    </ToastProvider>,
  );
}

// 👇 ERPNext mode
const mountErpUI = function (id) {
  const el = document.getElementById(id);
  if (!el) return;

  initializeTheme();

  const root = ReactDOM.createRoot(el);
  root.render(
    <ToastProvider>
      <HeaderProvider>
        <RoleProvider>
          <App />
        </RoleProvider>
      </HeaderProvider>
    </ToastProvider>,
  );
};

// Export to window for IIFE usage
if (typeof window !== "undefined") {
  window.mountErpUI = mountErpUI;
}

export { mountErpUI };
