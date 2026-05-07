import { Outlet } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { useHeader } from "../context/HeaderContext";

export default function MainLayout() {
  const { header } = useHeader();

  return (
    <div className="body-container d-flex flex-column min-vh-100">
      <PageHeader {...header} />

      <div className="flex-grow-1 container section-body-scroll">
        <Outlet />
      </div>

      <div className="app-footer-credit text-center py-2">
        Designed & Developed by{" "}
        <span className="brand">Addition Solutions</span>
      </div>
    </div>
  );
}
