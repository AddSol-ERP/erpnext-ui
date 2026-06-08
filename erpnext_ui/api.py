import frappe


@frappe.whitelist(allow_guest=False)
def get_current_user():
    """Return the logged-in user and their roles.

    This endpoint is accessible by all authenticated users regardless of role.
    It uses server-side frappe.get_roles() to retrieve the full role list,
    filtering out built-in roles like "All" and "Guest".

    Returns:
        dict: {"user": str, "roles": list[str]}
    """
    user = frappe.session.user
    roles = frappe.get_roles()

    # Filter out system-only roles that aren't meaningful for UI access control
    filtered = [r for r in roles if r not in ("All", "Guest")]

    return {"user": user, "roles": filtered}
