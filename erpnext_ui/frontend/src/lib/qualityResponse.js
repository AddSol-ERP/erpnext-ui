export const QUALITY_RESPONSE_TYPES = [
  "numeric_range",
  "yes_no",
  "ok_not_ok",
  "pass_fail",
  "choices",
  "free_text",
  "formula_numeric",
  "formula_text",
  "exact_value",
];

const PRESET_CHOICES = {
  yes_no: [
    { value: "Yes", result: "Accepted" },
    { value: "No", result: "Rejected" },
  ],
  ok_not_ok: [
    { value: "OK", result: "Accepted" },
    { value: "Not OK", result: "Rejected" },
  ],
  pass_fail: [
    { value: "Pass", result: "Accepted" },
    { value: "Failed", result: "Rejected" },
  ],
};

export function defaultResponseConfig(type = "numeric_range") {
  return {
    version: 1,
    type: QUALITY_RESPONSE_TYPES.includes(type) ? type : "numeric_range",
    choices: PRESET_CHOICES[type]?.map((choice) => ({ ...choice })) || [],
    formulaValueType: type === "formula_text" ? "text" : "numeric",
  };
}

export function inferLegacyResponseConfig(row = {}) {
  if (row.formula_based_criteria) {
    return defaultResponseConfig(row.numeric ? "formula_numeric" : "formula_text");
  }
  if (row.numeric) return defaultResponseConfig("numeric_range");

  const expected = String(row.value || "").trim().toLowerCase();
  if (["yes", "no"].includes(expected)) return defaultResponseConfig("yes_no");
  if (["ok", "not ok"].includes(expected)) return defaultResponseConfig("ok_not_ok");
  if (["pass", "failed", "fail"].includes(expected)) return defaultResponseConfig("pass_fail");
  return defaultResponseConfig("exact_value");
}

export function parseResponseConfig(value, fallbackRow = {}) {
  let parsed = value;
  if (typeof value === "string" && value.trim()) {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }
  const fallback = inferLegacyResponseConfig(fallbackRow);
  if (!parsed || typeof parsed !== "object" || !QUALITY_RESPONSE_TYPES.includes(parsed.type)) {
    return fallback;
  }
  const base = defaultResponseConfig(parsed.type);
  const choices = Array.isArray(parsed.choices) ? parsed.choices : base.choices;
  return {
    ...base,
    ...parsed,
    version: 1,
    choices: choices
      .map((choice) => ({
        value: String(choice?.value ?? "").trim(),
        result: choice?.result === "Accepted" ? "Accepted" : "Rejected",
      }))
      .filter((choice) => choice.value),
  };
}

export function serializeResponseConfig(config) {
  return JSON.stringify(parseResponseConfig(config));
}

export function responseChoices(config) {
  return parseResponseConfig(config).choices;
}

export function choiceResult(config, value) {
  return responseChoices(config).find((choice) => choice.value === String(value))?.result || "";
}

export function isNumericResponse(config) {
  const type = parseResponseConfig(config).type;
  return type === "numeric_range" || type === "formula_numeric";
}

export function isFormulaResponse(config) {
  const type = parseResponseConfig(config).type;
  return type === "formula_numeric" || type === "formula_text";
}

export function isManualResponse(config) {
  return parseResponseConfig(config).type === "free_text";
}

export function formulaForChoices(config) {
  const accepted = responseChoices(config)
    .filter((choice) => choice.result === "Accepted")
    .map((choice) => choice.value);
  return `reading_value in ${JSON.stringify(accepted)}`;
}

export function updateConfigType(config, type) {
  const next = defaultResponseConfig(type);
  if (type === "choices" && config?.type === "choices") {
    next.choices = responseChoices(config);
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* ACCEPTANCE FORMULAS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The ten reading fields ERPNext stores on a `Quality Inspection Reading`.
 *
 * They are `reading_1` … `reading_10` -- a Data field each, so they hold
 * whatever the inspector typed, and the server parses them to floats for a
 * numeric formula.
 */
export const FORMULA_READING_FIELDS = Array.from(
  { length: 10 },
  (_, i) => `reading_${i + 1}`,
);

/**
 * The variables an acceptance formula may use, per response type.
 *
 * ERPNext builds the variable table in
 * `Quality Inspection.get_formula_evaluation_data`
 * (erpnext/stock/doctype/quality_inspection/quality_inspection.py:336-347):
 *
 *   numeric = 1  ->  reading_1 .. reading_10 (floats; an EMPTY reading
 *                     counts as 0.0) and `mean` (the average of the
 *                     non-empty readings)
 *   numeric = 0  ->  ONLY `reading_value` (the text the inspector typed)
 *
 * THE TWO SETS ARE DISJOINT, and that is the trap. `reading_1` in a text
 * formula and `reading_value` in a numeric formula both raise a NameError
 * inside `frappe.safe_eval`, which ERPNext reports as
 *
 *   "Row #N: <field> is not a valid reading field. Please refer to the
 *    field description."
 *
 * -- a message that names a field the user never typed, arrives when the
 * INSPECTION is saved rather than when the formula is configured, and points
 * at ERPNext's own field description rather than at the mistake.
 *
 * The SPA sets `numeric` from the response type
 * (`QualityTemplateForm.preparePayload`): `formula_numeric` -> 1,
 * `formula_text` -> 0. So the type alone decides the variable set.
 */
export function formulaVariables(type) {
  if (type === "formula_numeric") return [...FORMULA_READING_FIELDS, "mean"];
  if (type === "formula_text") return ["reading_value"];
  return [];
}

/**
 * Python keywords, and the few names `frappe.safe_eval` provides.
 *
 * `frappe/utils/safe_exec.py:988`:
 *
 *   WHITELISTED_SAFE_EVAL_GLOBALS = { "int": int, "float": float,
 *                                      "long": int, "round": round, ... }
 *
 * Everything else is unavailable -- `abs`, `str`, `sum` and friends raise the
 * same NameError as an unknown reading field.
 */
const FORMULA_KEYWORDS = new Set([
  "and", "or", "not", "in", "is", "None", "True", "False",
  "if", "else", "elif", "for", "while", "lambda", "None",
]);

const FORMULA_SAFE_GLOBALS = new Set(["int", "float", "long", "round"]);

/**
 * Names in this formula that ERPNext will not be able to resolve.
 *
 * Returns the unknown names, in the order they first appear. An empty array
 * means the formula only mentions variables that exist for this response
 * type -- but it is NOT a proof that the formula is valid: the check is
 * lexical, so it cannot tell that `reading_1 > ` is a syntax error, and it
 * cannot know which of several readings a formula intends to use.
 *
 * It exists to catch the ONE mistake that is both easy to make and
 * expensive: reaching for the other response type's variable. That mistake
 * currently surfaces as "not a valid reading field" on the inspection, days
 * after the formula was written.
 */
export function formulaUnknownVariables(type, formula) {
  const variables = formulaVariables(type);
  // Not a formula type: there is no variable set to check against, and
  // calling every name unknown would be noise rather than a warning.
  if (!variables.length) return [];

  const allowed = new Set(variables);
  const source = String(formula ?? "");

  // String literals hold DATA, not names: `reading_value in ('Grade A')`
  // must not report "Grade" as an unknown variable.
  const withoutStrings = source.replace(/"[^"]*"|'[^']*'/g, " ");

  // An attribute or method name belongs to the object before the dot:
  // `reading_value.lower()` is fine, and `lower` is not a variable.
  const withoutAttributes = withoutStrings.replace(
    /\.\s*[A-Za-z_][A-Za-z0-9_]*/g,
    " ",
  );

  const names = withoutAttributes.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const unknown = new Set();
  for (const name of names) {
    if (allowed.has(name)) continue;
    if (FORMULA_KEYWORDS.has(name)) continue;
    if (FORMULA_SAFE_GLOBALS.has(name)) continue;
    unknown.add(name);
  }
  return [...unknown];
}

/**
 * A one-line description of what each response type asks the inspector for.
 *
 * Keyed by response type; the values are i18n keys, not text, so the
 * description follows the interface language.
 *
 * The formula types deliberately describe the INSPECTOR's side ("enters up
 * to ten readings") rather than the formula's side: the person reading this
 * is the one who has to supply the input, and the variable names belong next
 * to the formula field itself.
 */
export const RESPONSE_TYPE_HINT_KEYS = {
  numeric_range: "quality.responseTypeHints.numeric_range",
  exact_value: "quality.responseTypeHints.exact_value",
  yes_no: "quality.responseTypeHints.yes_no",
  ok_not_ok: "quality.responseTypeHints.ok_not_ok",
  pass_fail: "quality.responseTypeHints.pass_fail",
  choices: "quality.responseTypeHints.choices",
  free_text: "quality.responseTypeHints.free_text",
  formula_numeric: "quality.responseTypeHints.formula_numeric",
  formula_text: "quality.responseTypeHints.formula_text",
};

/** The i18n key for a response type's description, or "" for an unknown type. */
export function responseTypeHintKey(type) {
  return RESPONSE_TYPE_HINT_KEYS[type] || "";
}

/**
 * The i18n key for a formula type's description of WHAT TO TYPE.
 *
 * The two formula types get their own text because their variable sets are
 * disjoint -- see `formulaVariables`. A shared description would either be
 * vague (and useless) or wrong for one of them.
 */
export function formulaHintKey(type) {
  if (type === "formula_numeric") return "quality.formulaHintNumeric";
  if (type === "formula_text") return "quality.formulaHintText";
  return "";
}

/**
 * The i18n key for a formula type's worked example.
 *
 * The example is a Python expression, so it is a STRING and not JSX: it is
 * rendered inside a `<code>` block, which is why translating it is safe.
 */
export function formulaExampleKey(type) {
  if (type === "formula_numeric") return "quality.formulaExampleNumeric";
  if (type === "formula_text") return "quality.formulaExampleText";
  return "";
}

/**
 * The i18n key for the "that name does not exist here" warning.
 *
 * The message is per TYPE, not generic: telling a numeric-formula author
 * that "a text formula can use reading_value only" is noise, and telling a
 * text-formula author that "reading_1 to reading_10 and mean" are available
 * is worse -- it invites the exact mistake being warned about.
 */
export function formulaWarningKey(type) {
  if (type === "formula_numeric") return "quality.formulaUnknownVariableNumeric";
  if (type === "formula_text") return "quality.formulaUnknownVariableText";
  return "";
}
