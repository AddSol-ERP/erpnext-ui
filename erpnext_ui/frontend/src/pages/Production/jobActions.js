import { get, post } from "../../services/api";
import {
  COMPLETE_ARG_STATUS,
  PAUSE_ARG_STATUS,
  RESUME_ARG_STATUS,
  START_ARG_STATUS,
} from "./actions";

/**
 * Start / pause / resume / complete, on ERPNext v15's real endpoints.
 *
 * `job_card.make_time_log` is the ONLY whitelisted action endpoint Job Card
 * has in v15 -- desk JS drives every one of start/pause/resume/complete
 * through it (`job_card.js`, the `make_time_log` event), and the server turns
 * the `status` argument into the card's status inside
 * `JobCard.reset_timer_value()`. See `actions.js` for why each status is the
 * literal it is.
 *
 * The previous implementation posted to `job_card.start_job` /
 * `pause_job` / `complete_job`. None of those exist in v15 (nor in v16 or
 * develop), so every button answered HTTP 404 and the UI reported a bare
 * "Action failed" -- the whole start/stop flow was inoperative while looking
 * entirely correct. Recorded in MEMORY §9.8q.
 */
const MAKE_TIME_LOG =
  "method/erpnext.manufacturing.doctype.job_card.job_card.make_time_log";
const STOP_UNSTOP =
  "method/erpnext.manufacturing.doctype.work_order.work_order.stop_unstop";

/**
 * `frappe.datetime.now_datetime()` format: LOCAL time, no timezone, no
 * milliseconds. The server passes this straight to `get_datetime()`, and a
 * UTC timestamp here would put every time log hours off.
 */
function nowDateTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function fetchJobCard(name) {
  const res = await get(`resource/Job Card/${name}`);
  return res.data;
}

/** `flt`-alike: normalises a Float that is null/undefined to 0 the way
 * ERPNext's `flt()` does, so the comparison never sees `null`. */
function flt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * `add_time_log` writes ONE time-log row per entry in `employees`, so this
 * passes the card's own employee rows exactly as desk does (`frm.doc.employee`)
 * -- and nothing when it has none, which yields a single unassigned row rather
 * than blocking the start behind desk's employee prompt.
 */
function employeesOf(doc) {
  return (doc.employee || [])
    .map((row) => row.employee)
    .filter(Boolean)
    .map((employee) => ({ employee }));
}

/**
 * Desk tags the time-log row with the first incomplete sub-operation
 * (`job_card.js update_sub_operation`). Without it the row's `operation`
 * stays blank and sub-operation progress never advances.
 */
function nextSubOperation(doc) {
  const pending = (doc.sub_operations || []).find(
    (row) => row.status !== "Complete",
  );
  return pending ? pending.sub_operation : null;
}

async function timeLog(name, extra) {
  const doc = await fetchJobCard(name);
  const args = { job_card_id: name, ...extra };

  const employees = employeesOf(doc);
  if (employees.length) args.employees = employees;

  const subOperation = nextSubOperation(doc);
  if (subOperation) args.sub_operation = subOperation;

  // `{args}` is serialised as a JSON object; `make_time_log` also accepts a
  // JSON string, so both shapes reach the same `frappe._dict`.
  await post(MAKE_TIME_LOG, { args });
}

export function startJobCard(name) {
  return timeLog(name, {
    start_time: nowDateTime(),
    status: START_ARG_STATUS,
  });
}

export function pauseJobCard(name) {
  // `complete_time` is what CLOSES the open log row -- without it
  // `add_time_log` finds nothing to stop. `completed_qty: 0` because pausing
  // produced nothing.
  return timeLog(name, {
    complete_time: nowDateTime(),
    status: PAUSE_ARG_STATUS,
    completed_qty: 0,
  });
}

export function resumeJobCard(name) {
  return timeLog(name, {
    start_time: nowDateTime(),
    status: RESUME_ARG_STATUS,
  });
}

/**
 * `completedQty` is the quantity this completion books, so the caller asks the
 * user first (`CompleteJobDialog`), defaulting to the outstanding quantity --
 * desk prompts the same way. Assuming the full lot would book stock nobody
 * made, with no error anywhere.
 */
export function completeJobCard(name, completedQty) {
  return timeLog(name, {
    complete_time: nowDateTime(),
    status: COMPLETE_ARG_STATUS,
    completed_qty: completedQty,
  });
}

/**
 * "Start" a Work Order: start its next startable job card. ERPNext has no WO
 * start -- a Work Order's status is derived from its stock movements and job
 * cards, so production begins when a job card begins.
 *
 * `sequence_id` is the operation order, so the first Open/On Hold card in that
 * order is the one the floor should be on. Returns the card's name, or null
 * when nothing is ready (all done, or the remaining cards belong to a later
 * operation).
 *
 * A card whose materials have not been transferred to the WIP warehouse is
 * skipped: `add_time_log` opens with `validate_transfer_qty()`, which throws
 * "Materials needs to be transferred to the work in progress warehouse" for
 * exactly that card (`not is_corrective_job_card and items and
 * transferred_qty < for_quantity`), and desk hides its Start button for the
 * same reason. `items` is the one half this list query cannot see, so a card
 * with nothing to transfer and a smaller `transferred_qty` is skipped
 * conservatively -- the alternative is offering a start that can only fail.
 */
export async function startNextJobCard(workOrder) {
  const res = await get("resource/Job Card", {
    fields: JSON.stringify([
      "name",
      "status",
      "for_quantity",
      "transferred_qty",
      "is_corrective_job_card",
    ]),
    filters: JSON.stringify([
      ["work_order", "=", workOrder],
      ["status", "in", ["Open", "On Hold"]],
    ]),
    order_by: "sequence_id asc",
    limit_page_length: 20,
  });

  const next = (res.data || []).find(
    (card) =>
      card.is_corrective_job_card ||
      flt(card.transferred_qty) >= flt(card.for_quantity),
  );
  if (!next) return null;

  if (next.status === "On Hold") await resumeJobCard(next.name);
  else await startJobCard(next.name);

  return next.name;
}

/**
 * Stop / re-open a Work Order -- `stop_unstop`, which checks doc-level write
 * permission server-side. "Resumed" is ERPNext's literal for re-opening; there
 * is no "Unstopped".
 */
export function stopWorkOrder(name) {
  return post(STOP_UNSTOP, { work_order: name, status: "Stopped" });
}

export function reopenWorkOrder(name) {
  return post(STOP_UNSTOP, { work_order: name, status: "Resumed" });
}
