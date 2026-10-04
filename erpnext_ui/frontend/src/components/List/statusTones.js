/** Shared status → tone classes for list/detail badges. */
export const STATUS_BADGE = {
  open: "bg-muted text-muted-foreground ring-border",
  pending: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  complete:
    "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  danger: "bg-destructive/15 text-destructive ring-destructive/30",
  info: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  warning:
    "bg-orange-500/15 text-orange-600 ring-orange-500/30 dark:text-orange-400",
};

export function statusBadgeClass(tone = "open") {
  return STATUS_BADGE[tone] || STATUS_BADGE.open;
}

/**
 * Generic status text -> tone.
 *
 * Why keywords instead of a table per doctype: a Workflow's states are admin
 * authored data that the frontend cannot enumerate. `workflow_state` is a Link
 * to the Workflow State doctype, so its values do not appear in the DocType
 * meta (see approvalMeta.getApprovalStates), and the Workflow doctype itself is
 * System Manager readable only. Matching the words an admin is likely to have
 * used gives every doctype a sensible colour without hard-coding a single one.
 *
 * Ordered most specific first, so "Pending Approval" is amber rather than being
 * swallowed by a broader rule further down.
 */
const STATUS_TONE_RULES = [
  [/reject/, "danger"],
  [/fail|invalid|declin/, "danger"],
  // Cancelled is inert, not an error, so it stays neutral.
  [/cancel/, "open"],
  // "Pending Approval" contains "approv", so the pending rule has to be tested
  // first -- otherwise an item still awaiting approval is coloured green.
  [/pending|await|waiting|in progress|processing|under review|in review/, "pending"],
  [/approv|accept/, "complete"],
  [/complet|clos|paid|settl|resolv|fulfil|deliver/, "complete"],
  [/draft|open|new|to do/, "open"],
  [/submit/, "info"],
];

/** Tone for a free-text status, defaulting to the neutral `open` tone. */
export function statusTone(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "open";
  return STATUS_TONE_RULES.find(([re]) => re.test(text))?.[1] || "open";
}
