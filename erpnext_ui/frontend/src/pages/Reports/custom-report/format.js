/**
 * Pure helpers for the generic cross-app report page.
 *
 * Split out from CustomReportPage.jsx because these are the parts with real
 * logic and they are unit-tested in .smoke-tmp/rules.jsx. They are deliberately
 * free of React and of i18n so a rules-suite case can assert on them directly.
 */

const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);

export function isNumericColumn(col) {
  return NUMERIC.has(col?.fieldtype);
}

/**
 * Frappe stores a Select filter's options in `Report Filter.options`, which is a
 * Small Text field written as one option per line with surrounding whitespace
 * from the doctype editor's Textarea.
 */
export function parseSelectOptions(options) {
  return String(options ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ value: line, label: line }));
}

/**
 * Render one report cell.
 *
 * Two things here are load-bearing, both because a stock count that reads as
 * "0" when it is actually blank is a business error, not a formatting nit:
 *
 * - `null` / `undefined` / `""` become an em dash. A naive `Number(value)` or
 *   `value ?? 0` renders a missing plate weight as 0.
 * - `Number.isFinite` is the guard, and it is applied to `Number(value)`, never
 *   to the raw value. `Number(null)` is 0 and 0 IS finite, so the same mistake
 *   `conversionPreview` once made (see AGENTS.md section 20) would report a
 *   missing weight as a real zero here.
 *
 * Numbers arrive straight from a SQL report, so whole-number Float columns
 * would otherwise print "12.0" and Currency columns would drop trailing zeros.
 */
export function formatCell(value, col) {
  if (value === null || value === undefined || value === "") return "—";

  if (!isNumericColumn(col)) return String(value);

  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);

  if (col.fieldtype === "Currency") {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (col.fieldtype === "Int" || Number.isInteger(n)) {
    return n.toLocaleString();
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

/**
 * Columns to actually render.
 *
 * A report drops a column from DISPLAY without dropping it from the row dict by
 * setting `hidden` — `Plate Stock Register`'s execute() appends a hidden
 * "Offcuts" column whenever `include_offcuts` is falsy. Filtering here is what
 * keeps that from shifting every later value one column to the left, since the
 * row dict still carries the field.
 */
export function visibleColumns(columns) {
  return (columns || []).filter((c) => !c.hidden);
}

/**
 * Seed a filter value from the report's declared `default`.
 *
 * `Report Filter.default` is Small Text, so a Check's default arrives as the
 * STRING "1"/"0". The report tests `filters.get("include_offcuts")` for
 * TRUTHINESS, and the string "0" is truthy in Python — so passing it through
 * un-normalised would silently invert the filter.
 */
export function seedDefault(filter) {
  if (!filter || filter.default === "" || filter.default === null) return undefined;
  if (filter.fieldtype === "Check") return filter.default === "1" ? 1 : 0;
  return filter.default;
}