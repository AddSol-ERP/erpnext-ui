// Each case: the box contents a user can reach by typing, then backspacing.
// `actual` receives the exported linkSearchTerm and returns the value under
// test; the harness compares it to `expected`.
export const lf_emptyMapsToDefault = {
  name: "empty box -> default list",
  actual: (f) => f(""),
  expected: "",
};

export const lf_oneCharMapsToDefault = {
  name: "one char -> default list",
  actual: (f) => f("a"),
  expected: "",
};

export const lf_twoCharsSearches = {
  name: "two chars -> searched",
  actual: (f) => f("ab"),
  expected: "ab",
};

export const lf_whitespaceTrimmed = {
  name: "whitespace-only -> default list, padded term trimmed",
  actual: (f) => [f("  "), f("  ab  ")],
  expected: ["", "ab"],
};

export const lf_undefinedSafe = {
  name: "null/undefined are safe",
  actual: (f) => [f(null), f(undefined), f()],
  expected: ["", "", ""],
};

export const lf_neverEmptiesOptions = {
  name: "backspacing through a value never asks search_link for unusable text",
  // "HR-EMP-00002" -> "HR-EMP-0000" -> ... -> "" must never send text shorter
  // than the search length. Sending "" is what returns the default list; a
  // cleared result set is what left the dropdown empty.
  actual: (f) => {
    const start = "HR-EMP-00002";
    for (let i = start.length; i >= 0; i--) {
      const term = f(start.slice(0, i));
      if (term !== "" && term.length < 2) return `sent unusable term ${JSON.stringify(term)}`;
    }
    return f("") === "" ? "" : "cleared box did not map to the default list";
  },
  expected: "",
};

export const lf_customThreshold = {
  name: "threshold is configurable (MIN_SEARCH_CHARS contract)",
  actual: (f) => f("ab", 2) + "|" + f("ab", 5),
  expected: "ab|",
};