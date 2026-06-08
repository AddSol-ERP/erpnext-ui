/**
 * Get current user info from the Frappe JS session (when embedded in ERPNext)
 * or via the custom API endpoint (when running standalone with a token).
 *
 * Order of resolution:
 *   1. window.frappe.session (ERPNext embedded) — zero API calls
 *   2. Custom API fallback (dev mode / token auth)
 *
 * @returns {{ user: string, roles: string[], from: string } | null}
 */
export async function getCurrentUser(get) {
  // ✅ ERPNext embedded: read from window.frappe.session
  if (typeof window !== "undefined" && window.frappe?.session?.user) {
    const roles = window.frappe.user_roles || [];
    return {
      user: window.frappe.session.user,
      roles: roles.filter((r) => r !== "All" && r !== "Guest"),
      from: "session",
    };
  }

  // ✅ Standalone / dev mode: call custom whitelisted API
  try {
    const res = await get("method/erpnext_ui.api.get_current_user");
    if (res?.message) {
      return {
        user: res.message.user || "",
        roles: res.message.roles || [],
        from: "api",
      };
    }
  } catch (e) {
    console.warn("Failed to fetch user via API:", e);
  }

  return null;
}

/**
 * Quick synchronous check — returns user info only if frappe session is available.
 * Useful for components that can't await (e.g. initial header render).
 */
export function getUserSync() {
  if (typeof window !== "undefined" && window.frappe?.session?.user) {
    return {
      user: window.frappe.session.user,
      roles: (window.frappe.user_roles || []).filter(
        (r) => r !== "All" && r !== "Guest",
      ),
    };
  }
  return null;
}
