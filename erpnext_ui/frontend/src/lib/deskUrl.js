/**
 * ERPNext desk URLs.
 *
 * The SPA is mounted inside the desk at `/assets/erpnext_ui/erp_ui/`, so
 * `/app/<doctype>/<name>` is a same-origin path and a drill-out is a real
 * navigation rather than a cross-origin jump.
 *
 * This slug rule was duplicated in three places (GenericList twice,
 * GenericForm, tileNav) before it lived here. It has to stay consistent: a
 * link built with one spelling and matched with another is a 404 that only
 * shows up after a click.
 */

/**
 * `Purchase Receipt` -> `purchase-receipt`, `Item` -> `item`.
 * @param {string} doctype
 * @returns {string}
 */
export function doctypeSlug(doctype) {
  return String(doctype || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** URL of an existing document in ERPNext desk. */
export function deskDocUrl(doctype, name) {
  return `/app/${doctypeSlug(doctype)}/${name}`;
}

/** URL of the "new" form for a doctype. */
export function deskNewUrl(doctype) {
  const slug = doctypeSlug(doctype);
  return `/app/${slug}/new-${slug}`;
}

/**
 * Open a document in the desk in a new tab.
 *
 * `window.open` with `_blank` rather than an `<a href>`: leaving the SPA loses
 * unsaved form state, and the desk is a different app from the one the user is
 * working in. This matches what ApprovalPreview and tileNav already did.
 */
export function openInDesk(doctype, name, isNew = false) {
  window.open(isNew ? deskNewUrl(doctype) : deskDocUrl(doctype, name), "_blank");
}

/**
 * Whether the user is currently sitting inside the ERPNext desk.
 *
 * Used to decide whether a "back" affordance should return to the desk rather
 * than to the SPA root; see PageHeader's TopBarNav.
 */
export function isInsideDesk(pathname) {
  return String(
    typeof pathname === "string" ? pathname : window.location.pathname,
  ).includes("/app/");
}