/** Frappe's search_link returns nothing useful for a single character. */
export const MIN_SEARCH_CHARS = 2;

/**
 * The `txt` to send for the current contents of a Link field's search box.
 *
 * Text too short to be a search term maps to the empty string, which
 * search_link answers with the Link field's default option list. Sending the
 * partial text instead is what left the dropdown empty after backspacing out
 * of a search.
 *
 * Kept in its own module (rather than exported from the component) so the
 * decision is testable and so the component file only exports components.
 */
export function linkSearchTerm(txt, minChars = MIN_SEARCH_CHARS) {
  const term = (txt || "").trim();
  return term.length >= minChars ? term : "";
}