/**
 * Row and document helpers shared by the hand-built Store forms.
 *
 * Extracted from pages/Store/purchase-receipt/form/index.jsx so the Plate
 * Offcut form reuses tested code instead of copying it. Both forms hold rows in
 * local state that carries CLIENT-ONLY keys, and Frappe rejects a document
 * carrying a field it does not have:
 *
 *   UnknownAttributeError: Item has no field _rid
 *
 * So every key the UI invented has to be gone before the document goes out, and
 * any read-only field the server re-derives has to be gone too -- posting a stale
 * value is discarded at best and silently wrong at worst.
 */

/** Frappe's own per-document bookkeeping. Never posted on a create. */
export const SYSTEM_FIELDS = [
  "name",
  "owner",
  "creation",
  "modified",
  "modified_by",
  "idx",
  "docstatus",
  "amended_from",
  "amended_by",
  "_user_tags",
  "_comments",
  "_assign",
  "_liked_by",
  "doctype",
  "__islocal",
  "__unsaved",
];

/** The same, plus the linkage fields a child row gets once it is saved. */
export const CHILD_SYSTEM_FIELDS = [
  "name",
  "parent",
  "parenttype",
  "parentfield",
  "docstatus",
  "idx",
  "__islocal",
  "__unsaved",
  "owner",
  "creation",
  "modified",
  "modified_by",
];

/**
 * Strip system fields so a mapped document can be saved as a new document.
 *
 * @param {object} doc
 * @returns {object} a copy without any bookkeeping field
 */
export function stripSystemFields(doc) {
  const out = { ...doc };
  SYSTEM_FIELDS.forEach((f) => delete out[f]);
  return out;
}

/**
 * Strip one child row of everything the server owns or the UI invented.
 *
 * @param {object} row
 * @param {string[]} [extra=[]] - client-only / server-derived keys to drop too
 * @returns {object}
 */
export function stripChildRow(row, extra = []) {
  const clean = { ...row };
  CHILD_SYSTEM_FIELDS.forEach((f) => delete clean[f]);
  extra.forEach((f) => delete clean[f]);
  return clean;
}

/**
 * Strip a whole child table.
 *
 * @param {object[]} rows
 * @param {object} [opts]
 * @param {string[]} [opts.extra=[]] - per-row keys to drop (client-only, derived)
 * @param {string} [opts.key="items"] - the child table's fieldname
 * @returns {object} the document with that child table cleaned
 */
export function withCleanChildRows(doc, { extra = [], key = "items" } = {}) {
  const out = stripSystemFields(doc);
  out[key] = (doc[key] || []).map((row) => stripChildRow(row, extra));
  return out;
}

let ridSeq = 0;

/**
 * Stable client key for a row.
 *
 * Needed because a new child row has no server-side `name` until it is saved, so
 * an array index is the only other handle -- and indices move when a row is
 * removed from the middle. This is the Purchase Receipt form's `_rid`, promoted
 * to a shared helper.
 */
export const nextRid = () => `r${++ridSeq}`;
