import frappe


def has_app_permission():
    """Permission check for the add_to_apps_screen hook.
    All authenticated users can see the Addsol UI app tile.
    """
    return True


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


def boot_session(bootinfo):
    """Redirect operational users to the custom UI after login.

    This hook runs after login during boot info generation. It sets the user's
    home_page to /addsol_ui so that Employee/Self Employee users land on the
    tile-based SPA instead of the standard Frappe desk.

    Users who need the standard desk can always return via the "Back to ERPNext"
    option in the custom UI's header dropdown menu.

    Args:
        bootinfo: The boot info dict that will be sent to the client.
    """
    user = frappe.session.user
    if user and user != "Administrator":
        # Redirect all non-Administrator users to the custom UI.
        # ESS, Approvals, and Reports modules are accessible by "*" (all users),
        # so every authenticated user has access to at least parts of the SPA.
        # The "Back to ERPNext" dropdown option provides access to the standard desk.
        bootinfo["user"]["home_page"] = "/addsol_ui"
