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
 *
 * THE META TRAP
 * -------------
 * `resource/DocType/<dt>` is the DocType *document*, i.e. its `tabDocField`
 * rows -- and a Workflow's state column is NOT a DocField. Frappe creates it
 * as a Custom Field when the Workflow is saved
 * (`Workflow.create_custom_field_for_workflow_state`). `frappe.get_meta()`
 * reports Custom Fields; that endpoint does not. So validating `workflow_state`
 * against REST meta always concluded "this doctype has no such column" and
 * dropped it -- silently, because every consumer already degrades to `status`.
 * That is how a document sitting in "Waiting For Approval" rendered as
 * "Draft": the badge was reading ERPNext's own column, not the Workflow's.
 *
 * The fix is `getWorkflowMeta`, which asks the server (whose meta is
 * Custom-Field aware) for the column an active Workflow actually advances --
 * and for the state NAMES that form its approval queues -- and
 * `withWorkflowField`, which adds it to the field list. The list is then safe
 * to send: the server only names a column the doctype really has.
 */

const metaCache = new Map();
const workflowFieldCache = new Map();

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
 * The active Workflow behind a doctype: the column it advances (usually
 * `workflow_state`, but a Workflow may name its own field) and the states that
 * form its approval queues, straight from the server -- the only side whose
 * meta includes Custom Fields and the only side that reads the Workflow.
 *
 * Resolves to `{hasWorkflow, fieldname, pendingStates, approvedStates}`; `null`
 * means the question could not be answered (network, permission, unexpected
 * reply).
 *
 * The state NAMES matter as much as the column: `Waiting For Approval` here,
 * `Pending HR Approval` there, and anything at all on a site whose workflows
 * were authored in another language. Guessing them in JavaScript is how the
 * Approvals tile asked for `status == "Pending"` -- a value none of these
 * doctypes has -- and reported zero while documents waited.
 *
 * A FAILED PROBE IS NOT "NO WORKFLOW" for the status column: `null` here only
 * suppresses the workflow field, and `getApprovalMeta` retries next time. It is
 * deliberately never cached as a negative answer -- a blip would otherwise hide
 * the workflow state for the rest of the session.
 */
export async function getWorkflowMeta(doctype) {
  if (!doctype) return null;

  const cached = workflowFieldCache.get(doctype);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const res = await get("method/erpnext_ui.api.get_doctype_workflow_meta", {
        doctype,
      });
      const message = res?.message;
      // An answer that is not the documented shape is a failure, not a
      // "no workflow": reporting the wrong column fails the whole list query,
      // and reporting "none" hides an approval state.
      if (!message || typeof message.has_workflow !== "boolean") return null;
      return {
        hasWorkflow: message.has_workflow,
        fieldname: message.fieldname || null,
        pendingStates: message.pending_states || [],
        approvedStates: message.approved_states || [],
      };
    } catch {
      return null;
    }
  })();

  workflowFieldCache.set(doctype, pending);

  const workflow = await pending;
  if (!workflow) workflowFieldCache.delete(doctype);

  return workflow;
}

/** `workflow_state` -> "Workflow State", the label Frappe gives the custom field. */
const fieldLabel = (fieldname) =>
  fieldname.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Add the Workflow's state column to a doctype's field list.
 *
 * It is absent from REST meta even when it exists as a Custom Field, so without
 * this the column can never be requested. A doctype that genuinely declares
 * the field (a real DocField, or a Select holding the states itself) keeps its
 * own definition -- only the gap is filled, and only for a fieldname the server
 * has confirmed exists.
 */
export function withWorkflowField(fields, fieldname) {
  const list = Array.isArray(fields) ? fields : [];
  if (!fieldname || list.some((f) => f.fieldname === fieldname)) return list;

  return [
    ...list,
    {
      fieldname,
      label: fieldLabel(fieldname),
      // Frappe creates the Custom Field with `fieldtype: "Link"` and
      // `options: "Workflow State"`, so the filter chips can offer it as a link
      // search against the real states instead of guessing a value list.
      fieldtype: "Link",
      options: "Workflow State",
    },
  ];
}

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
      const [res, workflow] = await Promise.all([
        get(`resource/DocType/${encodeURIComponent(doctype)}`),
        getWorkflowMeta(doctype),
      ]);

      const fields = withWorkflowField(
        res?.data?.fields || [],
        workflow?.fieldname,
      );
      const fieldSet = new Set(fields.map((f) => f.fieldname));

      return {
        meta: {
          doctype,
          fields,
          fieldSet,
          // The SERVER's verdict, not `fieldSet.has("workflow_state")`. An
          // inactive Workflow leaves its Custom Field behind (Frappe's
          // `on_trash` only clears the cache), and inferring "has workflow"
          // from that column's existence hid the plain Submit on a doctype
          // whose Workflow no longer runs -- a stuck form with no way forward.
          //
          // A failed probe therefore means "no workflow", which is AGENTS.md
          // invariant 4: probe failure must never block a user's submit.
          hasWorkflow: Boolean(workflow?.hasWorkflow),
          // The exact column, so callers never hardcode `workflow_state`.
          workflowField: workflow?.fieldname || null,
          // The Workflow's own queue states: what "pending" and "approved"
          // mean for this doctype. Empty when there is no Workflow (the caller
          // then falls back to ERPNext's `status`), never guessed here.
          pendingStates: workflow?.pendingStates || [],
          approvedStates: workflow?.approvedStates || [],
          // Submittable doctypes carry the default Draft -> Submitted ->
          // Cancelled lifecycle in `docstatus`, which is what we fall back to
          // when no Workflow is configured.
          isSubmittable: Boolean(res?.data?.is_submittable),
        },
        // Only a fully answered lookup is worth keeping: a failed workflow
        // probe must be retried, not remembered as "no workflow".
        complete: workflow !== null,
      };
    } catch (e) {
      console.error(`Failed to load meta for ${doctype}:`, e);
      return null;
    }
  })();

  metaCache.set(
    doctype,
    pending.then((r) => r?.meta ?? null),
  );

  const result = await pending;

  // Don't cache a failure: a later attempt (e.g. after permissions change or a
  // transient network error) should be able to succeed.
  if (!result?.complete) metaCache.delete(doctype);

  return result?.meta ?? null;
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
  if (!meta) return null;
  if (meta.hasWorkflow) {
    // Not necessarily `workflow_state`: a Workflow may advance its own column
    // (`status` on the IMS doctypes). Naming the wrong one fails the query.
    const workflowField = meta.workflowField || "workflow_state";
    if (meta.fieldSet.has(workflowField)) return workflowField;
  }

  const preferred = PREFERRED_STATUS_FIELD[doctype] || DEFAULT_STATUS_FIELD;

  if (meta.fieldSet.has(preferred)) return preferred;
  if (meta.fieldSet.has(DEFAULT_STATUS_FIELD)) return DEFAULT_STATUS_FIELD;
  if (meta.fieldSet.has(FALLBACK_STATUS_FIELD)) return FALLBACK_STATUS_FIELD;
  if (meta.fieldSet.has("workflow_state")) return "workflow_state";

  return DEFAULT_STATUS_FIELD;
}

/**
 * Resolve the active approval field from Workflow config or DocType schema.
 *
 * `meta` already carries the server's workflow verdict, so the probe below is
 * only a fallback for a doctype whose meta could not be loaded; without it a
 * Workflow doctype would have its outcome read from ERPNext's `status` (the
 * "Draft while awaiting approval" bug again).
 */
export async function getApprovalStatusField(meta, doctype) {
  if (meta) {
    if (meta.hasWorkflow) return meta.workflowField || "workflow_state";
    return resolveStatusField(meta, doctype);
  }

  // No meta to read: ask the workflow question directly rather than assume
  // `workflow_state`. Returning a column the doctype lacks fails the query the
  // field ends up in.
  const workflow = await getWorkflowMeta(doctype);
  if (workflow?.hasWorkflow) return workflow.fieldname || "workflow_state";
  return null;
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
    const workflowField = meta.workflowField || "workflow_state";
    const ws = byName(workflowField);
    if (ws) {
      return {
        source: "workflow",
        fieldname: workflowField,
        // Frappe creates the state column as a Link to the Workflow State
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
  workflowFieldCache.clear();
}
