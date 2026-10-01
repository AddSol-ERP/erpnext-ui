/**
 * Grid corner helper — intentionally a no-op.
 * Design decision: all card/grid corners stay sharp (square).
 * Call sites remain so future radius policies can re-enable logic here.
 */
export function gridCorners() {
  return "";
}
