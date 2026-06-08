/**
 * Role → Module Access Configuration
 *
 * Defines which roles can see which top-level modules in the dashboard.
 * - roles: array of role names that have access. "*" means all logged-in users.
 * - icon: Bootstrap icon class
 * - color: theme color for the tile
 *
 * To grant/revoke access, simply edit the roles array for any module.
 */
export const MODULE_ACCESS = {
  HR: {
    roles: ["HR Manager", "HR User", "Administrator"],
    icon: "bi-people",
    color: "#4f46e5",
    label: "HR",
    description: "Employee master, attendance, payroll & recruitment",
  },
  Sales: {
    roles: ["Sales Manager", "Sales User", "Administrator"],
    icon: "bi-cart",
    color: "#0891b2",
    label: "Sales",
    description: "Customers, leads, opportunities & orders",
  },
  Purchase: {
    roles: ["Purchase Manager", "Purchase User", "Administrator"],
    icon: "bi-truck",
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
    icon: "bi-box-seam",
    color: "#059669",
    label: "Stock",
    description: "Inventory, material requests & stock entry",
  },
  Quality: {
    roles: ["Quality Manager", "Quality User", "Administrator"],
    icon: "bi-shield-check",
    color: "#7c3aed",
    label: "Quality",
    description: "Inspections, parameters & quality control",
  },
  ESS: {
    roles: ["*"],
    icon: "bi-person-badge",
    color: "#dc2626",
    label: "Employee Self Service",
    description: "My profile, attendance, leave & salary",
  },
  Approvals: {
    roles: ["*"],
    icon: "bi-check2-square",
    color: "#f59e0b",
    label: "Approvals",
    description: "Pending approvals across all modules",
  },
  Reports: {
    roles: ["*"],
    icon: "bi-bar-chart",
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
    .filter(([key, config]) => {
      if (config.roles.includes("*")) return true;
      return config.roles.some((role) => userRoles.includes(role));
    })
    .map(([key]) => key);
}
