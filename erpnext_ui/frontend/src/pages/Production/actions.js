/**
 * The Production dashboard's whole decision surface: which actions a status
 * permits, which statuses each tab shows, and how each status renders.
 *
 * Pure data on purpose -- `.smoke-tmp/rules.jsx` imports this file and asserts
 * all of it directly. Every key is an ERPNext v15 Select option or derived
 * from one, and there is no second copy anywhere: the dashboard, the Start
 * work dialog and both preview modals read from here, so they cannot disagree
 * about which button a status offers (a disagreement is how the module shipped
 * an "On Hold" card with no way back to work).
 */

/**
 * Actions per Job Card status.
 *
 * `Open` and `Submitted` both mean "ready, nothing done yet": a card is
 * `Open` at docstatus 0 and flips to `Submitted` the moment it is submitted
 * (JobCard.set_status, `{1: "Submitted"}`), which is the NORMAL state of a
 * card auto-created from a Work Order -- so a dashboard keyed on `Open` alone
 * hides most of the shop floor's queue.
 *
 * `Material Transferred` / `Partially Transferred` are set from the raw
 * material transfers, not by the operator. A fully transferred card is ready
 * to run; a partially transferred one cannot start, because `add_time_log`
 * opens with `validate_transfer_qty()`, which throws while
 * `transferred_qty < for_quantity`. That is why Partially Transferred has an
 * empty list rather than being dropped: the card exists, it is just waiting on
 * materials, and hiding it would be the same invisibility in a new place.
 */
export const JOB_CARD_ACTIONS = {
  Open: ["start"],
  Submitted: ["start"],
  "Material Transferred": ["start"],
  "Partially Transferred": [],
  "Work In Progress": ["pause", "complete"],
  "On Hold": ["resume", "complete"],
  Completed: [],
};

/**
 * A Work Order has no "start" in ERPNext: its status is derived from stock
 * movements (WorkOrder.get_status recomputes it from Stock Entries), and
 * production begins when a job card begins. "startNext" starts the Work
 * Order's next startable job card instead; "reopen" is the only way out of
 * `Stopped`.
 */
export const WORK_ORDER_ACTIONS = {
  "Not Started": ["startNext", "stop"],
  "In Process": ["startNext", "stop"],
  Stopped: ["reopen"],
  Completed: [],
  Closed: [],
};

/**
 * The three tabs, in order. Each lists the statuses its section queries, so a
 * tab IS its query -- there is no client-side bucketing that could disagree
 * with what the server returns.
 *
 * - `ongoing`: running right now, and nothing else. One status per doctype is
 *   deliberate -- "running" must not quietly grow to include paused work.
 * - `waiting`: everything that needs a "go" before it moves -- untouched,
 *   paused, and waiting on materials.
 * - `completed`: terminal states, read-only.
 */
export const TAB_KEYS = ["ongoing", "waiting", "completed"];

export const JOB_CARD_TABS = {
  ongoing: ["Work In Progress"],
  waiting: [
    "Open",
    "Submitted",
    "Material Transferred",
    "Partially Transferred",
    "On Hold",
  ],
  completed: ["Completed"],
};

export const WORK_ORDER_TABS = {
  ongoing: ["In Process"],
  waiting: ["Not Started", "Stopped"],
  completed: ["Completed", "Closed"],
};

export const jobCardActionsFor = (status) => JOB_CARD_ACTIONS[status] || [];

export const workOrderActionsFor = (status) => WORK_ORDER_ACTIONS[status] || [];

/**
 * The actions that BEGIN work, as opposed to directing it once running. The
 * Start work dialog offers only these: pausing or completing a job that has
 * not started yet is not a thing the operator is there to do.
 */
export const START_ACTION_KEYS = ["start", "resume", "startNext", "reopen"];

/**
 * What the Start work dialog offers, derived from the matrices above so the
 * two can never drift: a status belongs here exactly when it has a
 * start/resume action. `Partially Transferred` is therefore excluded on its
 * own terms -- it is in the waiting tab (visible) but not startable.
 */
export const STARTABLE_JOB_CARD_STATUSES = Object.keys(JOB_CARD_ACTIONS).filter(
  (s) =>
    jobCardActionsFor(s).includes("start") ||
    jobCardActionsFor(s).includes("resume"),
);

export const STARTABLE_WORK_ORDER_STATUSES = Object.keys(
  WORK_ORDER_ACTIONS,
).filter(
  (s) =>
    workOrderActionsFor(s).includes("startNext") ||
    workOrderActionsFor(s).includes("reopen"),
);

/**
 * How each status renders. `common.open` is shared with the list pages, which
 * already translate "Not Started" and "Open" that way -- an operator should
 * not have to learn two vocabularies for the same card.
 */
export const JOB_CARD_STATUS_UI = {
  Open: { labelKey: "common.open", tone: "open" },
  Submitted: { labelKey: "production.statusSubmitted", tone: "open" },
  "Material Transferred": {
    labelKey: "production.statusMaterialTransferred",
    tone: "info",
  },
  "Partially Transferred": {
    labelKey: "production.statusPartiallyTransferred",
    tone: "warning",
  },
  "Work In Progress": {
    labelKey: "production.statusInProgress",
    tone: "pending",
  },
  "On Hold": { labelKey: "production.statusOnHold", tone: "warning" },
  Completed: { labelKey: "production.statusCompleted", tone: "complete" },
};

export const WORK_ORDER_STATUS_UI = {
  "Not Started": { labelKey: "common.open", tone: "open" },
  "In Process": { labelKey: "production.statusInProgress", tone: "pending" },
  Stopped: { labelKey: "production.statusStopped", tone: "warning" },
  Completed: { labelKey: "production.statusCompleted", tone: "complete" },
  Closed: { labelKey: "production.statusClosed", tone: "complete" },
};

/**
 * Button chrome per action, shared by every surface that offers one. Labels
 * stay out of here (they are i18n lookups at render time) so a translated
 * string can never end up posted to the server.
 */
export const JOB_CARD_ACTION_STYLE = {
  start: "bg-primary text-primary-foreground hover:bg-primary/90",
  pause:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
  resume:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20",
  complete: "bg-emerald-600 text-white hover:bg-emerald-600/85",
};

export const WORK_ORDER_ACTION_STYLE = {
  startNext: "bg-primary text-primary-foreground hover:bg-primary/90",
  stop: "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
  reopen:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20",
};

export const JOB_CARD_ACTION_LABEL_KEY = {
  start: "production.startJob",
  pause: "production.pauseJob",
  resume: "production.resumeJob",
  complete: "production.completeJob",
};

export const WORK_ORDER_ACTION_LABEL_KEY = {
  startNext: "production.startNextJob",
  stop: "production.stopOrder",
  reopen: "production.reopenOrder",
};

export const JOB_CARD_DONE_TOAST_KEY = {
  start: "production.jobStartedToast",
  pause: "production.jobPausedToast",
  resume: "production.jobResumedToast",
};

export const WORK_ORDER_DONE_TOAST_KEY = {
  stop: "production.woStoppedToast",
  reopen: "production.woReopenedToast",
};

/**
 * The literal `status` values sent to `job_card.make_time_log` -- these are
 * ERPNext's own, and `JobCard.reset_timer_value()` branches on them:
 *
 * - "Resume Job" is REWRITTEN to "Work In Progress" AFTER the elapsed-time
 *   reset, so a resume keeps the accumulated `current_time`. Sending
 *   "Work In Progress" directly would zero it, which is why resume must carry
 *   the odd-looking literal rather than the status it lands on.
 * - "On Hold" skips the elapsed-time reset entirely -- pausing must not
 *   pretend the clock restarted.
 */
export const START_ARG_STATUS = "Work In Progress";
export const PAUSE_ARG_STATUS = "On Hold";
export const RESUME_ARG_STATUS = "Resume Job";
export const COMPLETE_ARG_STATUS = "Complete";
