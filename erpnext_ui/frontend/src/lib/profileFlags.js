/**
 * ESS profile: which optional-feature state, if any, the profile page should
 * surface.
 *
 * Kept as pure functions so the rules suite can cover them without rendering
 * the page. `Profile` fetches its data with an async `get(...)`, so it cannot be
 * smoke-rendered the way `GenericForm` is.
 */

/**
 * Does this Employee record carry an HR-approval gate?
 *
 * The gate is Frappe's own `workflow_state`, which only exists once an Employee
 * Workflow has been configured (`erpnext_ui/setup/workflows.py` seeds one). That
 * makes the *presence* of the key a reliable per-customer capability signal:
 *
 *   - key absent        -> this site has no Employee Workflow; show nothing.
 *   - key null          -> record predates the workflow and has never been
 *                          re-saved, so it never went through approval either.
 *                          Warning it would be noise, so also show nothing.
 *   - "Pending HR Approval" / "Rejected" -> genuinely not approved yet.
 *   - "Approved"        -> approved; nothing to say.
 *
 * This deliberately does NOT read a customer-added field such as a
 * `custom_hr_approved` Check. Those can sit at permlevel > 0, in which case
 * Frappe's REST layer omits them for non-privileged users and the gate would
 * silently vanish for exactly the employees it targets. `workflow_state` is
 * first-party and always at permlevel 0.
 *
 * The failure this replaces: `!profile.workflow_state` cannot tell "pending"
 * from "no such field", because `!undefined` is `true` -- which showed the
 * warning to every employee at every customer, including those that never
 * configured an approval workflow at all.
 */
export function resolveHrApprovalGate(profile) {
  const state = profile?.workflow_state;

  const hasGate = state !== undefined && state !== null;

  return {
    hasGate,
    state: hasGate ? state : null,
    showWarning: hasGate && state !== "Approved",
  };
}