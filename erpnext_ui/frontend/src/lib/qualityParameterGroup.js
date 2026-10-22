/**
 * `Quality Inspection Parameter Group` — the master behind
 * `Quality Inspection Parameter.parameter_group`.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The ERPNext doctype has exactly ONE field, `group_name`, and it is the
 * autoname field:
 *
 *   "autoname": "field:group_name"        (quality_inspection_parameter_group.json)
 *
 * Two consequences fall out of that, and both fail SILENTLY:
 *
 * 1. `name === group_name`.
 *    `frappe/model/naming.py:203-210` -> `_field_autoname()` returns the raw
 *    field value, so the document's identity IS the label. There is no
 *    separate key to rename.
 *
 * 2. **Editing `group_name` on a saved document does nothing.**
 *    `frappe/model/base_document.py:1027-1033`:
 *
 *        def _sync_autoname_field(self):
 *            """Keep autoname field in sync with `name`"""
 *            autoname = self.meta.autoname or ""
 *            _empty, _field_specifier, fieldname = autoname.partition("field:")
 *            if fieldname and self.name and self.name != self.get(fieldname):
 *                self.set(fieldname, self.name)
 *
 *    It runs from `_validate_data_fields()`, i.e. inside `validate()` on EVERY
 *    save. So a PUT carrying a changed `group_name` is validated, the field is
 *    overwritten with the stored `name`, and the server answers 200 "saved".
 *    The user sees a green toast and the value they typed is gone.
 *
 *    So the ONLY way to change a group's name is a RENAME, not a save.
 *    `frappe.client.rename_doc` is whitelisted for POST/PUT
 *    (`frappe/client.py:266-273`) and takes `doctype` / `old_name` /
 *    `new_name`. `frappe/model/rename_doc.py:169-170` then runs
 *    `update_link_field_values(link_fields, old, new, doctype)`, which rewrites
 *    every `Quality Inspection Parameter.parameter_group` pointing at the old
 *    name -- so a rename cannot orphan a parameter.
 *
 * 3. Deleting a group that is still referenced is refused by Frappe
 *    (`frappe/model/delete_doc.py` -> `check_if_doc_is_linked` ->
 *    `LinkExistsError`). Offering a Delete button that is guaranteed to fail
 *    is exactly what `resolveDocstatusActions` in `lib/docTransition.js` warns
 *    against, so the UI counts the references first and explains itself.
 *
 * The helpers below are deliberately pure and network-free so the rules suite
 * can assert them; the page does the I/O.
 */

export const PARAMETER_GROUP_DOCTYPE = "Quality Inspection Parameter Group";

/** The doctype a group is referenced from, and the field that points at it. */
export const PARAMETER_GROUP_REFERENCE = {
  doctype: "Quality Inspection Parameter",
  field: "parameter_group",
};

/**
 * The group's own name, as the server sees it.
 *
 * `group_name` is authoritative because it IS the name (`name === group_name`),
 * but a list row may be fetched with only some fields, so `name` is the
 * fallback. Trimmed, because Frappe's `_field_autoname()` trims the value it
 * derives the name from -- an untrimmed comparison would report two different
 * names for the same group.
 */
export function groupNameOf(doc = {}) {
  // A default parameter only covers `undefined`, so an explicit null still has
  // to be handled -- a caller passing a null document is a crash, not a
  // missing name.
  const source = doc || {};
  const value = source.group_name ?? source.name ?? "";
  return String(value).trim();
}

/**
 * Read a group name back out of a URL segment.
 *
 * The name is written into the URL with `encodeURIComponent` (a group called
 * "Dimensional / Gauge" has to survive the path), so it comes back encoded.
 *
 * `decodeURIComponent` THROWS on a malformed sequence, and a group legitimately
 * named "50% off" decodes to a string containing a bare `%` -- which is not a
 * valid escape. A throw inside a render would blank the page, so the decode
 * is guarded and the raw value is used as the fallback.
 */
export function decodeGroupName(value) {
  const raw = String(value ?? "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The state the group-name input is bound to.
 *
 * `value` and the piece of state `onChange` writes to MUST be the same one.
 * They were not, once: the new-group form rendered `doc.group_name` but its
 * `onChange` wrote `renameValue` -- so the field was editable, every
 * keystroke was accepted, and the text on screen never changed. The user
 * types, nothing appears, and the form looks broken.
 *
 * Naming the source makes the pairing explicit:
 *
 *   "doc"   -> the document's own `group_name`; a new group types into it,
 *              and an existing group shows it read-only.
 *   "rename"-> the pending new name; only reachable while renaming.
 *
 * @param {boolean} isEdit     is this an existing group?
 * @param {boolean} renaming   is the rename input open?
 * @param {string}  docName    the stored name
 * @param {string}  renameValue the pending new name
 */
export function groupNameFieldState({
  isEdit = false,
  renaming = false,
  docName = "",
  renameValue = "",
} = {}) {
  // An existing group shows its name read-only: the name IS the document's
  // identity, and Frappe discards an edit to it (see the module note).
  if (isEdit && !renaming) {
    return { value: docName, readOnly: true, source: "doc" };
  }

  // The rename input is the only place a name may be typed into once the
  // document exists.
  if (renaming) {
    return { value: renameValue, readOnly: false, source: "rename" };
  }

  // A new group types straight into the document.
  return { value: docName, readOnly: false, source: "doc" };
}

/**
 * Is this rename safe to send?
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }` where `reason` is one of
 * `"blank"` / `"unchanged"`. Both are rejected client-side because Frappe
 * rejects them too, and the server's message for "unchanged" only arrives
 * after a round trip:
 *
 *   "No changes made because old and new name are the same."
 *   (frappe/model/rename_doc.py:354-355)
 */
export function validateRename(currentName, nextName) {
  const next = String(nextName ?? "").trim();
  const current = String(currentName ?? "").trim();

  if (!next) return { ok: false, reason: "blank" };
  if (next === current) return { ok: false, reason: "unchanged" };

  return { ok: true };
}

/**
 * May this group be deleted right now?
 *
 * `usageCount` is the number of `Quality Inspection Parameter` rows whose
 * `parameter_group` points at this group. A group in use cannot be deleted --
 * Frappe raises `LinkExistsError` -- and the parameter rows would be left
 * pointing at a name that no longer resolves.
 */
export function canDeleteGroup(usageCount) {
  return Number(usageCount || 0) === 0;
}

/**
 * The parameters that reference a group.
 *
 * Frappe's `get_list` accepts `filters` as a JSON string, a list or a dict
 * (`frappe/client.py:82-94` for `get_count`; `reportview.get_list` parses the
 * same three shapes), so the dict is serialised here once and the same shape
 * works for both the list and the count.
 */
export function groupUsageFilter(groupName) {
  return JSON.stringify({
    [PARAMETER_GROUP_REFERENCE.field]: String(groupName ?? "").trim(),
  });
}

/**
 * The payload for `frappe.client.rename_doc`.
 *
 * The parameter names are `old_name` / `new_name`, NOT `old` / `new` -- the
 * latter are the names of `frappe.model.rename_doc.rename_doc`, the internal
 * function. `frappe.client.rename_doc` is the whitelisted wrapper
 * (`frappe/client.py:266-273`) and takes the `_name` spellings. Getting this
 * wrong sends `old=None`, and the server answers with a `TypeError` about
 * missing arguments rather than a rename.
 */
export function renamePayload({ doctype = PARAMETER_GROUP_DOCTYPE, oldName, newName }) {
  return {
    doctype,
    old_name: String(oldName ?? "").trim(),
    new_name: String(newName ?? "").trim(),
  };
}
