import { Outlet } from "react-router-dom";
import AppShell from "./AppShell";

export default function MainLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
