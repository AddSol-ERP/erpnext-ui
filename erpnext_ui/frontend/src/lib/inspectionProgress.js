/**
 * How far a Quality Inspection has got, and what is still to do.
 *
 * WHY THIS IS A MODULE
 * --------------------
 * "Is this parameter complete?" and "what is its status?" are business
 * rules, and they fail SILENTLY. The user fills in every reading, taps
 * Submit, and nothing happens except a message at the top of a long page --
 * which on a phone is several screens above the button they just pressed.
 * The rules live here so the rules suite can assert them, and so the form
 * has ONE source of truth for them.
 *
 * A note on `parameterStatus` for the FORMULA response types: the formula is
 * evaluated by the SERVER (`frappe.safe_eval`, see
 * `erpnext/stock/doctype/quality_inspection/quality_inspection.py:305-334`),
 * so the browser cannot know the outcome. Those parameters report the status
 * the server last gave them, and stay "Pending" until it does.
 */

import { choiceResult } from "./qualityResponse";

/**
 * The status of one parameter's reading, as far as the browser can tell.
 *
 * "Accepted" / "Rejected" / "Pending". Returns "Pending" for anything it
 * cannot decide -- including the formula types, whose outcome only the
 * server knows.
 */
export function parameterStatus(parameter) {
  const config = parameter.responseConfig;
  if (config?.type === "numeric_range") {
    const values = (parameter.values || []).filter(
      (value) => value !== "" && value != null,
    );
    if (!values.length || parameter.min_value === "" || parameter.max_value === "") {
      return "Pending";
    }
    const numbers = values.map(Number);
    if (numbers.some((value) => !Number.isFinite(value))) return "Pending";
    return numbers.every(
      (value) =>
        value >= Number(parameter.min_value) && value <= Number(parameter.max_value),
    )
      ? "Accepted"
      : "Rejected";
  }
  if (config?.type === "formula_numeric" || config?.type === "formula_text") {
    return parameter.status || "Pending";
  }
  if (config?.type === "free_text") return parameter.manualStatus || "Pending";
  if (["yes_no", "ok_not_ok", "pass_fail", "choices"].includes(config?.type)) {
    return parameter.readingValue
      ? choiceResult(config, parameter.readingValue) || "Pending"
      : "Pending";
  }
  if (config?.type === "exact_value") {
    return parameter.readingValue !== ""
      ? parameter.readingValue === String(parameter.value ?? "")
        ? "Accepted"
        : "Rejected"
      : "Pending";
  }
  return "Pending";
}

/**
 * Has this parameter been filled in enough to submit?
 *
 * A parameter with no reading is NOT complete, whatever its status says --
 * a "Rejected" numeric reading is complete (the inspector measured it and
 * it was out of range); an empty one is not.
 */
export function isParameterComplete(parameter) {
  const type = parameter.responseConfig?.type;
  if (type === "numeric_range") {
    return (
      parameter.values.some((value) => value !== "") &&
      parameter.min_value !== "" &&
      parameter.max_value !== ""
    );
  }
  if (type === "formula_numeric") {
    return (
      !!parameter.acceptance_formula.trim() &&
      parameter.values.some((value) => value !== "")
    );
  }
  if (type === "formula_text") {
    return (
      !!parameter.acceptance_formula.trim() && !!parameter.readingValue.trim()
    );
  }
  if (type === "free_text") {
    return (
      !!parameter.readingValue.trim() &&
      ["Accepted", "Rejected"].includes(parameter.manualStatus)
    );
  }
  if (type === "exact_value") return !!parameter.readingValue;
  return (
    !!parameter.readingValue &&
    (parameter.responseConfig?.choices || []).some(
      (choice) => choice.value === parameter.readingValue,
    )
  );
}

/**
 * The counts the progress bar shows.
 *
 * `firstIncomplete` is the index of the first parameter still to do, or -1
 * when there is none. It is what the "next one" button jumps to, so it has
 * to be the FIRST, not the most severe: an inspector works down the list.
 */
export function summariseInspection(parameters = []) {
  const total = parameters.length;
  let complete = 0;
  let accepted = 0;
  let rejected = 0;
  let pending = 0;
  let firstIncomplete = -1;

  parameters.forEach((parameter, index) => {
    if (isParameterComplete(parameter)) {
      complete += 1;
    } else if (firstIncomplete === -1) {
      firstIncomplete = index;
    }
    const status = parameterStatus(parameter);
    if (status === "Accepted") accepted += 1;
    else if (status === "Rejected") rejected += 1;
    else pending += 1;
  });

  return {
    total,
    complete,
    remaining: total - complete,
    accepted,
    rejected,
    pending,
    firstIncomplete,
  };
}

/**
 * The inspection's overall verdict.
 *
 * "Pending" WINS over "Rejected": while any reading is still missing the
 * result is not final, and saying "Rejected" would be a verdict the
 * inspector has not earned yet. "" means there are no parameters at all --
 * no template chosen -- and there is nothing to judge.
 */
export function overallStatus(parameters = []) {
  if (!parameters.length) return "";
  if (parameters.some((parameter) => parameterStatus(parameter) === "Pending")) {
    return "Pending";
  }
  if (parameters.some((parameter) => parameterStatus(parameter) === "Rejected")) {
    return "Rejected";
  }
  return "Accepted";
}

/**
 * The parameters that still need a reading, in order.
 */
export function incompleteParameters(parameters = []) {
  return parameters.filter((parameter) => !isParameterComplete(parameter));
}
