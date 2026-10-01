import { get } from "../services/api";

/**
 * DocType meta for the approval screens.
 *
 * Frappe only adds `workflow_state` to a doctype once a Workflow is defined
 * for it. Requesting that field unconditionally makes the list query fail with
 * `DataError: Field not permitted in query: workflow_state`, which is why
 * every field we send is validated against the doctype meta first.
 *
 * Approvals are driven by the doctype's own `status` field (ERPNext stores the
 * approval outcome there), with `workflow_state` used only for display when a
 * Workflow happens to be configured.
 */

const metaCache = new Map();

/**
 * ERPNext models the approval outcome as `approval_status` on Expense Claim
 * but as `status` on Purchase Order / Quotation / Leave Application. We try the
 * doctype's preferred column first and fall back to whichever exists.
 */
const PREFERRED_STATUS_FIELD = {
  "Expense Claim": "approval_status",
};

const DEFAULT_STATUS_FIELD = "status";
const FALLBACK_STATUS_FIELD = "approval_status";

/**
 * Fetch (and memoise) a doctype's meta.
 *
 * Returns `null` when meta is unavailable; callers must degrade gracefully
 * rather than assume the shape.
 */
export async function getApprovalMeta(doctype) {
  if (!doctype) return null;

  const cached = metaCache.get(doctype);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const res = await get(`resource/DocType/${encodeURIComponent(doctype)}`);
      const fields = res?.data?.fields || [];
      const fieldSet = new Set(fields.map((f) => f.fieldname));

      return {
        doctype,
        fields,
        fieldSet,
        hasWorkflow: fieldSet.has("workflow_state"),
        // Submittable doctypes carry the default Draft -> Submitted -> Cancelled
        // lifecycle in `docstatus`, which is what we fall back to when no
        // Workflow is configured.
        isSubmittable: Boolean(res?.data?.is_submittable),
      };
    } catch (e) {
      console.error(`Failed to load meta for ${doctype}:`, e);
      return null;
    }
  })();

  metaCache.set(doctype, pending);

  const meta = await pending;

  // Don't cache a failure: a later attempt (e.g. after permissions change or a
  // transient network error) should be able to succeed.
  if (!meta) metaCache.delete(doctype);

  return meta;
}

/**
 * Fields Frappe keeps on every document but that are NOT reported in a
 * DocType's `fields` array, so they must never be filtered out by meta.
 *
 * `name` in particular is a synthesized column (there is no DocField row for
 * it), so dropping it from the query makes every row come back without an
 * identifier and any `resource/<doctype>/<name>` fetch resolve to `undefined`.
 */
const IMPLICIT_FIELDS = new Set([
  "name",
  "owner",
  "creation",
  "modified",
  "modified_by",
]);

/**
 * Keep only the fields this doctype actually has, without duplicates.
 *
 * `status` appears in both BASE_FIELDS and some DOCTYPE_FIELDS entries, and a
 * repeated column in the `fields` list produces a duplicated select column.
 *
 * Without meta we can't validate anything, so we ask for `*` rather than risk
 * the same "Field not permitted in query" failure.
 */
export function pickFields(meta, fields) {
  if (!meta) return ["*"];
  return [
    ...new Set(
      fields.filter((f) => IMPLICIT_FIELDS.has(f) || meta.fieldSet.has(f)),
    ),
  ];
}

/**
 * Resolve the fieldname holding this doctype's approval status.
 */
export function resolveStatusField(meta, doctype) {
  if (!meta) return DEFAULT_STATUS_FIELD;

  const preferred = PREFERRED_STATUS_FIELD[doctype] || DEFAULT_STATUS_FIELD;

  if (meta.fieldSet.has(preferred)) return preferred;
  if (meta.fieldSet.has(DEFAULT_STATUS_FIELD)) return DEFAULT_STATUS_FIELD;
  if (meta.fieldSet.has(FALLBACK_STATUS_FIELD)) return FALLBACK_STATUS_FIELD;

  return DEFAULT_STATUS_FIELD;
}

/**
 * `docstatus` values, which every submittable doctype carries regardless of
 * whether a Workflow exists.
 */
export const DOCSTATUS_STATES = {
  0: "Draft",
  1: "Submitted",
  2: "Cancelled",
};

const splitOptions = (options) =>
  (options || "")
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

/**
 * Resolve the approval states a doctype offers, straight from its metadata.
 *
 * Precedence:
 *   1. `workflow_state` options - only present when a Workflow is configured.
 *   2. the doctype's own status column (`approval_status` / `status`) options.
 *   3. the default `docstatus` lifecycle for submittable doctypes.
 *
 * This is what lets a doctype with no Workflow still show meaningful states
 * (Draft -> Submitted) and lets the UI offer the matching transition.
 *
 * Returns `{ source, fieldname, states }`.
 */
export function getApprovalStates(meta) {
  if (!meta) return { source: "unknown", fieldname: null, states: [] };

  const byName = (name) => meta.fields.find((f) => f.fieldname === name);

  if (meta.hasWorkflow) {
    const ws = byName("workflow_state");
    if (ws) {
      return {
        source: "workflow",
        fieldname: "workflow_state",
        // Frappe creates `workflow_state` as a Link to the Workflow State
        // doctype, so its possible values are NOT listed in the DocType meta
        // and transitions have to come from the backend. Only a Select (custom
        // schema) can enumerate its states here.
        states: ws.fieldtype === "Select" ? splitOptions(ws.options) : [],
      };
    }
  }

  const statusField = resolveStatusField(meta, meta.doctype);
  const sf = byName(statusField);
  if (sf?.fieldtype === "Select" && sf.options) {
    return {
      source: "status",
      fieldname: statusField,
      states: splitOptions(sf.options),
    };
  }

  if (meta.isSubmittable) {
    return {
      source: "docstatus",
      fieldname: "docstatus",
      states: Object.values(DOCSTATUS_STATES),
    };
  }

  return { source: "unknown", fieldname: null, states: [] };
}

/** Test seam. */
export function __clearApprovalMetaCache() {
  metaCache.clear();
}
