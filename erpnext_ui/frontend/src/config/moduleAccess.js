/**
 * Role → Module Access Configuration
 *
 * Defines which roles can see which top-level modules in the dashboard.
 * - roles: array of role names that have access. "*" means all logged-in users.
 * - icon: lucide-react component (or React node)
 * - color: theme color for the tile
 *
 * To grant/revoke access, simply edit the roles array for any module.
 */
import {
  Users,
  ShoppingCart,
  Truck,
  Package,
  ShieldCheck,
  UserSquare2,
  CheckSquare,
  BarChart3,
} from "lucide-react";

export const MODULE_ACCESS = {
  HR: {
    roles: ["HR Manager", "HR User", "Administrator"],
    icon: Users,
    color: "#4f46e5",
    label: "HR",
    description: "Employee master, attendance, payroll & recruitment",
  },
  Sales: {
    roles: ["Sales Manager", "Sales User", "Administrator"],
    icon: ShoppingCart,
    color: "#0891b2",
    label: "Sales",
    description: "Customers, leads, opportunities & orders",
  },
  Purchase: {
    roles: ["Purchase Manager", "Purchase User", "Administrator"],
    icon: Truck,
    color: "#d97706",
    label: "Purchase",
    description: "Suppliers, purchase orders & invoices",
  },
  Stock: {
    roles: [
      "Stock Manager",
      "Stock User",
      "Manufacturing User",
      "Administrator",
    ],
    icon: Package,
    color: "#059669",
    label: "Stock",
    description: "Inventory, material requests & stock entry",
  },
  Quality: {
    roles: ["Quality Manager", "Quality User", "Administrator"],
    icon: ShieldCheck,
    color: "#7c3aed",
    label: "Quality",
    description: "Inspections, parameters & quality control",
  },
  ESS: {
    roles: ["*"],
    icon: UserSquare2,
    color: "#dc2626",
    label: "Employee Self Service",
    description: "My profile, attendance, leave & salary",
  },
  Approvals: {
    roles: ["*"],
    icon: CheckSquare,
    color: "#f59e0b",
    label: "Approvals",
    description: "Pending approvals across all modules",
  },
  Reports: {
    roles: ["*"],
    icon: BarChart3,
    color: "#6366f1",
    label: "Reports",
    description: "Analytics & operational reports",
  },
};

/**
 * Get modules accessible by a given set of user roles.
 * @param {string[]} userRoles - List of roles assigned to the current user
 * @returns {string[]} Array of module keys (e.g. ["HR", "Sales"])
 */
export function getAccessibleModules(userRoles) {
  if (!userRoles || userRoles.length === 0) return [];

  return Object.entries(MODULE_ACCESS)
    .filter(([, config]) => {
      if (config.roles.includes("*")) return true;
      return config.roles.some((role) => userRoles.includes(role));
    })
    .map(([key]) => key);
}
