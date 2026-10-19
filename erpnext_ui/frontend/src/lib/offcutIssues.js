/**
 * Why a single offcut row is wrong, decided on the client so the operator is
 * told while they are still typing rather than when the save is rejected.
 *
 * PURE, and deliberately so: these are predicates over numbers, with no React
 * and no fetching, so `rules.jsx` can cover the whole truth table. That matters
 * more here than the wiring does, because a wrong answer is not cosmetic -- it
 * either hides a bad cutting or blocks a good one.
 *
 * The two dimensional rules mirror the server's `check_offcut_fits` and `fits`
 * (addsol_nl_custom/plates/cutting.py):
 *
 *   fits() allows EITHER orientation. A 600 x 2000 piece fits a 2500 x 1250
 *   plate only when rotated, and the server accepts it. A copy that compared
 *   length-to-length would reject a valid cut.
 *
 *   minimum_offcut() is per GRADE -- the Item Group's own minimum, falling back
 *   to Plate Settings -- so it arrives from the estimate rather than being
 *   guessed here. Before that answer lands, `tooSmall` simply cannot be
 *   evaluated and the row shows nothing rather than a false "fine".
 *
 * The server remains the authority: it re-checks every one of these on save.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Whether a piece fits inside the plate, in either orientation.
 *
 * Mirrors `cutting.fits` exactly, including its refusal to judge without plate
 * geometry.
 */
export function fits(offcutLength, offcutWidth, plateLength, plateWidth) {
  if (!(plateLength > 0) || !(plateWidth > 0)) return false;
  const l = num(offcutLength);
  const w = num(offcutWidth);
  return (
    (l <= plateLength && w <= plateWidth) ||
    (l <= plateWidth && w <= plateLength)
  );
}

/**
 * Every problem with one row, most fundamental first.
 *
 * `missing` outranks the rest because there is nothing to measure against: a
 * row with no width is incomplete, not too big. Returning a list rather than a
 * single value means a row can be both too big and too small at once -- a
 * 3000 x 200 piece is wider than the plate and narrower than the minimum --
 * and the operator should be told both rather than the first one found.
 *
 * @param {object} row      - the form's row: `{ length_mm, width_mm }`
 * @param {object} plate    - `{ length_mm, width_mm }` from the estimate
 * @param {object} [min]    - `{ length_mm, width_mm }` from the estimate
 * @returns {string[]} issue codes, in the order they should be shown
 */
export function rowIssues(row, plate, min) {
  const length = num(row?.length_mm);
  const width = num(row?.width_mm);
  const issues = [];

  if (!(length > 0) || !(width > 0)) return ["missing"];

  const plateLength = num(plate?.length_mm);
  const plateWidth = num(plate?.width_mm);
  // Only judge against a plate we have the real size of. A plate with no
  // geometry yet makes `fits` false for everything, and flagging every row at
  // once is worse than saying nothing.
  if (plateLength > 0 && plateWidth > 0 && !fits(length, width, plateLength, plateWidth)) {
    issues.push("tooBig");
  }

  const minLength = num(min?.length_mm);
  const minWidth = num(min?.width_mm);
  // Mirrors `check_offcut_fits`: the SHORTER side is measured against the
  // width minimum and the LONGER side against the length one, so a long thin
  // sliver is judged on the right pair.
  //
  // No outer "is a minimum configured" test: the two `> 0` guards below already
  // carry it, and an unconfigured site is 0 -- which means "no check", not
  // "nothing may be kept".
  const longer = Math.max(length, width);
  const shorter = Math.min(length, width);
  if ((minWidth > 0 && shorter < minWidth) || (minLength > 0 && longer < minLength)) {
    issues.push("tooSmall");
  }

  return issues;
}

/** Whether a row is complete enough to be measured against the plate. */
export function isComplete(row) {
  return num(row?.length_mm) > 0 && num(row?.width_mm) > 0;
}