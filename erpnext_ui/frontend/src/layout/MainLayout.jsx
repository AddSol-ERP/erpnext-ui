import { Outlet } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { useHeader } from "../context/HeaderContext";

export default function MainLayout() {
  const { header } = useHeader();

  return (
    <div className="body-container d-flex flex-column vh-100 overflow-hidden">
      <PageHeader {...header} />

      <div className="flex-grow-1 px-3 px-md-4 section-body-scroll min-h-0">
        <Outlet />
      </div>

      <div className="app-footer-credit text-center py-2">
        Designed & Developed by{" "}
        <span className="brand">Addition Solutions</span>
      </div>
    </div>
  );
}
