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
    // ESS is the one surface every authenticated employee may reach, so it is
    // the only module shown when we cannot determine permissions at all.
    public: true,
    icon: UserSquare2,
    color: "#dc2626",
    label: "Employee Self Service",
    description: "My profile, attendance, leave & salary",
  },
  Approvals: {
    // Deliberately NOT "*". This used to be "*", which handed the Approvals hub
    // to every logged-in user. Access is now decided by real read permission on
    // the backing doctypes -- see get_ui_access() in erpnext_ui/api.py and
    // applyDoctypeAccess() below. The roles array stays as a coarse first pass
    // so nothing is granted by role-name alone.
    roles: ["*"],
    gatedBy: "approvals",
    icon: CheckSquare,
    color: "#f59e0b",
    label: "Approvals",
    description: "Pending approvals across all modules",
  },
  Reports: {
    // Same reasoning as Approvals: coarse pass here, real doctype read
    // permission in applyDoctypeAccess().
    roles: ["*"],
    gatedBy: "reports",
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

/**
 * The module set to use when permissions could not be determined.
 *
 * This is the fail-closed baseline: only modules explicitly marked `public` are
 * granted. It exists because the previous behaviour fell back to
 * `getAccessibleModules(["*"])`, which returned exactly ESS + Approvals +
 * Reports -- so a failed request silently handed every user the Approvals hub
 * and the Reports page, which is precisely the disclosure this gating is meant
 * to close.
 *
 * @returns {string[]} Module keys safe to render with no permission data.
 */
export function getFailClosedModules() {
  return Object.entries(MODULE_ACCESS)
    .filter(([, config]) => config.public)
    .map(([key]) => key);
}

/**
 * Overlay real doctype read permissions onto a role-derived module list.
 *
 * A `gatedBy` module survives only if the user can read at least one of its
 * backing doctypes. Both approvals and reports are required to have at least
 * one readable doctype, because a hub with nothing in it is just a blank page
 * that still confirms which doctypes exist.
 *
 * @param {string[]} modules - Modules from getAccessibleModules().
 * @param {{approvals?: object, reports?: object}} access - get_ui_access() payload.
 * @returns {string[]} Filtered module keys.
 */
export function applyDoctypeAccess(modules, access) {
  if (!Array.isArray(modules)) return [];

  return modules.filter((key) => {
    const gate = MODULE_ACCESS[key]?.gatedBy;
    if (!gate) return true;

    const permissions = access?.[gate];

    // No permission data at all -> withhold the gated module.
    if (!permissions || typeof permissions !== "object") return false;

    return Object.values(permissions).some(Boolean);
  });
}
