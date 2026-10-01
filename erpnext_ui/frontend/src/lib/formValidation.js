/**
 * Shared form validation helpers.
 *
 * Convention: validate() returns { fieldErrors: {field: message}, summary: string }.
 * On failure: show summary in a top Alert, pass fieldErrors into FormField error,
 * then focusFirstError(fieldErrors).
 */

/** Build {field: message} for empty required fields. labels: {field: labelString} */
export function requiredFields(doc, labels, t) {
  const fieldErrors = {};

  Object.entries(labels).forEach(([field, label]) => {
    const val = doc[field];
    if (val === null || val === undefined || val === "") {
      fieldErrors[field] = t("common.fieldRequired", { field: label });
    }
  });

  return fieldErrors;
}

/**
 * Required-field errors for a subset of DocType fields (step/tab validation).
 * Skips system/break fieldtypes and Tables (same contract as full form validate).
 */
export function validateRequired(doc, fields = [], t) {
  const fieldErrors = {};
  const skipTypes = [
    "Section Break",
    "Column Break",
    "Tab Break",
    "Fold",
    "Page Break",
    "Table",
  ];

  fields.forEach((field) => {
    if (!field?.reqd || skipTypes.includes(field.fieldtype)) return;
    if (field.hidden) return;

    const val = doc[field.fieldname];
    if (val === null || val === undefined || val === "") {
      fieldErrors[field.fieldname] = t("common.fieldRequired", {
        field: field.label || field.fieldname,
      });
    }
  });

  return fieldErrors;
}

/** True when every message in fieldErrors is empty/undefined. */
export function isFormValid(fieldErrors) {
  return Object.values(fieldErrors || {}).every((msg) => !msg);
}

/** First non-empty message from fieldErrors (for top-level summary), or "". */
export function firstError(fieldErrors) {
  const msgs = Object.values(fieldErrors || {}).filter(Boolean);
  return msgs[0] || "";
}

/** All non-empty messages from fieldErrors. */
export function errorList(fieldErrors) {
  return Object.values(fieldErrors || {}).filter(Boolean);
}

/** Number of failing fields in fieldErrors. */
export function countErrors(fieldErrors) {
  return errorList(fieldErrors).length;
}

/**
 * Focus the control inside the first [data-field] wrapper that has an error.
 * Works with FormField's data-field={name} + Input/Select/Textarea/LinkField.
 */
export function focusFirstError(fieldErrors) {
  const fields = Object.keys(fieldErrors || {}).filter(
    (key) => fieldErrors[key],
  );

  for (const key of fields) {
    const wrap = document.querySelector(
      `[data-field="${CSS.escape(key)}"]`,
    );
    if (!wrap) continue;

    const control = wrap.querySelector(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    if (control) {
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    }
  }

  return false;
}

/**
 * Run a validate() result: returns false and focuses+returns the summary
 * when invalid; returns true when valid.
 * Usage: if (!handleValidation(result, setError)) return;
 */
export function handleValidation(result, setSummary) {
  const fieldErrors = result?.fieldErrors || {};
  const valid = isFormValid(fieldErrors);

  if (setSummary) {
    setSummary(valid ? "" : result?.summary || firstError(fieldErrors));
  }

  if (!valid) {
    // Allow React to paint field errors before focusing.
    requestAnimationFrame(() => focusFirstError(fieldErrors));
    return false;
  }

  return true;
}
