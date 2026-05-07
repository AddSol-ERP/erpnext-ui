import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./temp-index.css";
import { HeaderProvider } from "./context/HeaderContext";
import { ToastProvider } from "./context/ToastContext";

const rootElement = document.getElementById("root");

// 👇 DEV MODE (normal React)
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ToastProvider>
      <HeaderProvider>
        <App />
      </HeaderProvider>
    </ToastProvider>,
  );
}

// 👇 ERPNext mode
const mountErpUI = function (id) {
  const el = document.getElementById(id);
  if (!el) return;

  const root = ReactDOM.createRoot(el);
  root.render(
    <ToastProvider>
      <HeaderProvider>
        <App />
      </HeaderProvider>
    </ToastProvider>,
  );
};

// Export to window for IIFE usage
if (typeof window !== "undefined") {
  window.mountErpUI = mountErpUI;
}

export { mountErpUI };
