const BASE_URL = "/api";

function getAuthHeader() {
  return `token 5b33c5d2897abcb:8be4f326dd1262b`;
}

const getBaseUrl = () => {
  return import.meta.env.VITE_API_BASE_URL || BASE_URL;
};

// 🔹 Core request handler
async function request(method, url, data = {}) {
  const res = await fetch(`${getBaseUrl()}/${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: method !== "GET" ? JSON.stringify(data) : undefined,
  });

  const json = await res.json();

  if (json.exc) {
    throw new Error(json.exc);
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
