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
