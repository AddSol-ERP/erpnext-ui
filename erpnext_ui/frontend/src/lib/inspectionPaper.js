/**
 * The inspection question paper: the state of each question, and what an
 * answer looks like as text.
 *
 * WHY THIS IS A MODULE
 * --------------------
 * Two things here are read by the EYE rather than by a validator, which is
 * exactly why they need asserting:
 *
 *   * the RAIL. A chip that says "answered" when the reading is empty (or the
 *     other way round) is the one thing that would make the paper lie about
 *     how far the user has got -- and the whole point of the paper is that it
 *     does not lie.
 *   * the SUMMARY. `describeAnswer` decides what the review shows for each
 *     question. A summary that shows the wrong value is worse than no
 *     summary, because it is what the user checks their work against.
 *
 * Both are pure, so the rules suite can assert them.
 */

import { isParameterComplete, parameterStatus } from "./inspectionProgress";

/**
 * The state of one question.
 *
 *   "todo"      -- not answered yet
 *   "answered"  -- answered, but the OUTCOME is not known here
 *   "accepted"  -- answered, and the reading is within the criterion
 *   "rejected"  -- answered, and the reading is outside the criterion
 *
 * "answered" is a real state, not a rounding of "accepted": the FORMULA
 * response types are evaluated by the SERVER (`frappe.safe_eval`, see
 * `erpnext/stock/doctype/quality_inspection/quality_inspection.py:305-334`),
 * so the browser cannot know whether the formula passed. Until the document
 * is saved and the server has spoken, a formula question the user has filled
 * in is "answered" and nothing more. Calling it "accepted" would claim a
 * verdict the browser never earned.
 */
export const QUESTION_STATES = ["todo", "answered", "accepted", "rejected"];

/**
 * The state of every question, in order.
 *
 * The rail renders this, and the summary counts it.
 */
export function questionStates(parameters = []) {
  return parameters.map((parameter) => {
    if (!isParameterComplete(parameter)) return "todo";
    const status = parameterStatus(parameter);
    if (status === "Accepted") return "accepted";
    if (status === "Rejected") return "rejected";
    return "answered";
  });
}

/**
 * The answer, as the text the summary shows.
 *
 * Empty string when the question has not been answered -- the summary then
 * shows "not answered" rather than a blank, which reads as a missing value
 * rather than as an answer of "".
 *
 * A multi-reading question shows its readings joined, in order: "1.0, 2.0, 3.0".
 * A free-text question shows the observation; its ACCEPTED/REJECTED decision is
 * shown by the status chip beside it, not here -- those are server values and
 * repeating them untranslated in a sentence would be wrong.
 */
export function describeAnswer(parameter = {}) {
  const type = parameter.responseConfig?.type;

  if (type === "numeric_range" || type === "formula_numeric") {
    return (parameter.values || [])
      .filter((value) => value !== "" && value != null)
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join(", ");
  }

  return String(parameter.readingValue || "").trim();
}

/**
 * Is every question answered?
 *
 * Note that this is about the READING, not the verdict: a reading that was
 * entered and came out out-of-range is answered, and the inspection is
 * submittable -- it is simply rejected.
 */
export function paperCanSubmit(parameters = []) {
  return parameters.length > 0 && parameters.every((p) => isParameterComplete(p));
}
