const BASE_URL = "/api";

const getBaseUrl = () => {
  return import.meta.env.VITE_API_BASE_URL || BASE_URL;
};

const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

// 🔹 CSRF token
// Frappe rejects every unsafe HTTP method unless the request carries the
// session's CSRF token in the `X-Frappe-CSRF-Token` header (frappe/auth.py ->
// validate_csrf_token). Same-origin deployments (production, where
// VITE_API_BASE_URL is "/api") send the session cookie, so that check is live
// and every write call fails without the header.
//
// The token is fetched once per session and cached in memory. Cross-origin
// token-auth setups (development) never have a saved token server-side, so a
// failure to fetch one is deliberately non-fatal -- the request is still sent.
let csrfToken = null;
let csrfPromise = null;

async function getCsrfToken() {
  if (csrfToken) return csrfToken;

  if (!csrfPromise) {
    csrfPromise = request("GET", "method/erpnext_ui.api.get_csrf_token")
      .then((json) => {
        csrfToken = json.message?.csrf_token || null;
        return csrfToken;
      })
      .catch(() => null)
      .finally(() => {
        csrfPromise = null;
      });
  }

  return csrfPromise;
}

function clearCsrfToken() {
  csrfToken = null;
}

// 🔹 Frappe validation errors
// On a failed insert/update Frappe reports the HTTP status (and, for a few
// endpoints, an `exc` type such as "ValidationError") plus `_server_messages`:
// a JSON-encoded array of {message, field} entries carrying the actually useful
// text ("Employee is mandatory") and the offending fieldname.
//
// `_server_messages` is only ever read to *enrich a failure that already
// happened* -- it is never itself the error signal, because Frappe also sends
// it on successful requests.
//
// Throwing only `json.exc` made every form report a bare "ValidationError",
// which is why real save failures were so hard to diagnose. `ApiError` keeps
// the raw list so callers can map messages onto individual fields, and the HTTP
// status so callers can branch on transport-level problems.
export class ApiError extends Error {
  constructor(
    message,
    { exc = "", status = 0, fieldMessages = {}, messages = [] } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.exc = exc;
    this.status = status;
    this.fieldMessages = fieldMessages;
    this.messages = messages;
  }
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// `_server_messages` is a JSON string; older/patched builds sometimes send it
// as an already-parsed array. Tolerate both, and never let a malformed value
// break error handling.
function parseServerMessages(json) {
  const raw = json?._server_messages;

  if (!raw) return { fieldMessages: {}, messages: [] };

  let entries = raw;
  if (typeof raw === "string") {
    entries = tryParseJson(raw);
    // A non-JSON payload is still worth showing, just without a field.
    if (entries === null) return { fieldMessages: {}, messages: [raw] };
  }

  if (!Array.isArray(entries)) return { fieldMessages: {}, messages: [] };

  const fieldMessages = {};
  const messages = [];

  for (let entry of entries) {
    // Frappe's msgprint sometimes emits each entry as a JSON *string* holding
    // {message, title, ...}. Unwrap one level, otherwise the UI would render
    // a raw JSON blob instead of the sentence HRMS wrote.
    if (typeof entry === "string") {
      const inner = tryParseJson(entry);
      if (inner && typeof inner === "object") entry = inner;
    }

    if (typeof entry === "string") {
      messages.push(entry);
      continue;
    }

    const message = entry?.message;
    if (!message) continue;

    messages.push(message);

    // Frappe writes the field as e.g. "employee" or, for child tables,
    // "expenses[0].amount". Only top-level fields get mapped; the rest stay
    // in the flat message list.
    const field = entry?.field;
    if (field && typeof field === "string" && !field.includes("[")) {
      fieldMessages[field] = fieldMessages[field] || message;
    }
  }

  return { fieldMessages, messages };
}

function friendlyMessage(json, parsed, status) {
  // Prefer the first concrete server message, then the exception type, then the
  // HTTP status. A failure with no text at all should still say something useful.
  return parsed.messages[0] || json.exc || `Request failed (${status})`;
}

// 🔹 Core request handler
async function request(method, url, data = {}, canRetryCsrf = true) {
  const unsafe = UNSAFE_METHODS.includes(method);

  const headers = {
    "Content-Type": "application/json",
    ...(import.meta.env.VITE_API_TOKEN && {
      Authorization: import.meta.env.VITE_API_TOKEN,
    }),
  };

  if (unsafe) {
    const token = await getCsrfToken();
    if (token) headers["X-Frappe-CSRF-Token"] = token;
  }

  const res = await fetch(`${getBaseUrl()}/${url}`, {
    method,
    headers,
    body: unsafe ? JSON.stringify(data) : undefined,
  });

  const json = await res.json().catch(() => ({}));

  // A re-login or session rotation invalidates the cached token. Drop it and
  // retry exactly once so the write is not silently lost.
  if (json.exc === "CSRFTokenError" && unsafe && canRetryCsrf) {
    clearCsrfToken();
    return request(method, url, data, false);
  }

  // Whether this call failed is decided by the HTTP status, NOT by the presence
  // of `_server_messages`.
  //
  // Frappe attaches `_server_messages` to plenty of perfectly successful
  // responses -- it is msgprint's out-of-band channel, and an ordinary save
  // commonly returns it as an empty list ("[]"). Treating its mere presence as
  // an error made every successful Leave Application save throw, so the form
  // reported a failure (and swallowed the real success) on a 200.
  //
  // `exc` is still honoured alongside the status code because a few Frappe
  // endpoints answer HTTP 200 while carrying an exception type (ValidationError
  // from frappe.client.*, PermissionError, and so on).
  const failed = !res.ok || Boolean(json.exc);

  if (failed) {
    const parsed = parseServerMessages(json);
    throw new ApiError(friendlyMessage(json, parsed, res.status), {
      exc: json.exc || "",
      status: res.status,
      fieldMessages: parsed.fieldMessages,
      messages: parsed.messages,
    });
  }

  return json;
}

// 🔹 GET
export async function get(method, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${method}?${query}` : method;

  return request("GET", url);
}

// 🔹 POST
export async function post(method, data = {}) {
  return request("POST", method, data);
}

// 🔹 PUT (used for updates)
export async function put(method, data = {}) {
  return request("PUT", method, data);
}

// ============================================
// 🔹 ATTENDANCE REGULARIZATION APIs
// ============================================

/**
 * Regularize attendance between dates
 * Creates synthetic punches for consecutive shift work
 */
export async function regularizeAttendance(payload) {
  return post("attendance/regularize", payload);
}

/**
 * Fetch attendance records for date range
 */
export async function fetchAttendanceByDateRange(params) {
  return get("attendance/records", params);
}

/**
 * Get shift details by employee and date range
 */
export async function getShiftsByEmployee(params) {
  return get("employee/shifts", params);
}

/**
 * Validate shift window for punch time
 */
export async function validatePunchInShift(payload) {
  return post("attendance/validate-punch", payload);
}

/**
 * Generate synthetic punches preview (no creation)
 */
export async function previewSyntheticPunches(payload) {
  return post("attendance/preview-punches", payload);
}

/**
 * Get regularization history for employee
 */
export async function getRegularizationHistory(params) {
  return get("attendance/regularization-history", params);
}

/**
 * Bulk regularize attendance for multiple employees
 */
export async function bulkRegularizeAttendance(payload) {
  return post("attendance/bulk-regularize", payload);
}

/**
 * Undo regularization (soft delete)
 */
export async function undoRegularization(regularizationId) {
  return put(`attendance/regularization/${regularizationId}/undo`, {});
}
