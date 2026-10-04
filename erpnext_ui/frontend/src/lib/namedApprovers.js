import { post } from "../services/api";

/**
 * Named approvers for Leave Application / Expense Claim.
 *
 * HRMS keeps approvers in two places:
 *   - `Employee.leave_approver` / `Employee.expense_approver` (one per person)
 *   - `Department.leave_approvers` / `Department.expense_approvers`, a
 *     `Department Approver` child table, resolved up the department tree
 *
 * Both are folded together by the whitelisted HRMS helper
 * `department_approver.get_approvers`, which is what the Desk uses for the
 * approver link field. Per the product decision we only ever offer *named*
 * approvers -- there is no free-text fallback, because an unconfigured
 * approver is a configuration problem, not something the filer should guess at.
 *
 * Two behaviours of the HRMS helper drive this wrapper:
 *
 * 1. It THROWS ("Leave Approver Missing") when nothing is configured. It never
 *    returns an empty list, so callers must treat a throw as "no approvers"
 *    rather than as a transport failure. The thrown message names the exact
 *    Employee/Department records to fix, so it is surfaced verbatim.
 *
 * 2. It returns a list of TUPLES -- `[name, first_name, last_name]` -- because
 *    it backs a search field. The previous code indexed `.value` and
 *    `.description` on them, which is why the approver select came up blank
 *    even when approvers existed.
 *
 * Note on arguments: `doctype` must be sent BOTH at the top level (it is a
 * required argument of the search-input decorator) and inside `filters` -- the
 * body reads `filters.get("doctype")` to decide which approver list to walk.
 * Omitting the nested copy raises `UnboundLocalError: parentfield`.
 */

/** Strip the HTML Frappe embeds in thrown messages so they render as plain text. */
function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const APPROVER_METHOD =
  "method/hrms.hr.doctype.department_approver.department_approver.get_approvers";

/** `[name, first_name, last_name]` -> `{ value, label }` */
function normalizeApprover(row) {
  if (Array.isArray(row)) {
    const [value, first, last] = row;
    const label = [first, last].filter(Boolean).join(" ").trim();
    return { value, label: label || value };
  }

  // Defensive: tolerate an already-mapped object if HRMS changes shape.
  if (row && typeof row === "object") {
    const value = row.value || row.name || "";
    const label =
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
      row.description ||
      value;
    return { value, label };
  }

  return { value: String(row ?? ""), label: String(row ?? "") };
}

/**
 * @param {string} employee
 * @param {"Leave Application" | "Expense Claim"} doctype
 * @returns {Promise<{approvers: {value:string,label:string}[], error: string}>}
 */
export async function fetchNamedApprovers(employee, doctype) {
  if (!employee) return { approvers: [], error: "" };

  let res;

  try {
    res = await post(APPROVER_METHOD, {
      doctype,
      txt: "",
      searchfield: "name",
      start: 0,
      page_len: 50,
      filters: { employee, doctype },
    });
  } catch (e) {
    // A throw here normally means "no approver configured" -- the HRMS helper
    // builds a message naming the Employee and Department to update. Anything
    // without server messages is a genuine transport error.
    const serverMessage = e?.messages?.[0];
    return {
      approvers: [],
      error: stripHtml(serverMessage || e?.message || ""),
    };
  }

  const rows = Array.isArray(res?.message) ? res.message : [];

  const approvers = rows
    .map(normalizeApprover)
    .filter((a) => a.value);

  // De-duplicate: the Employee-level and Department-level approver can be the
  // same person.
  const seen = new Set();
  const unique = approvers.filter((a) => {
    if (seen.has(a.value)) return false;
    seen.add(a.value);
    return true;
  });

  return { approvers: unique, error: "" };
}
