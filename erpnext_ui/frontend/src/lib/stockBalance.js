/**
 * Stock balance arithmetic.
 *
 * Pure, and deliberately so: the SQL behind the summary report cannot be unit
 * tested, so everything that decides *what the numbers mean* lives here where
 * the rules suite can assert it. Only fetching stays in `api.py`.
 *
 * The contract, from ERPNext itself (`stock_balance.py:456-587`):
 *
 *     closing = opening + in - out
 *
 * with `in`/`out` taken from Stock Ledger Entry movement inside the window and
 * `opening` being everything posted before it. A Stock Ledger Entry's
 * `actual_qty` is signed -- positive in, negative out -- so the split is by sign,
 * not by voucher type. A return is an inward movement that happens to be a
 * "Purchase Return", which is why the sign is the only honest classifier.
 *
 * Worth stating because it is the whole point of the report: a balance is not a
 * single number with a single price. On QA, item `CORE` holds 3 Kg received on
 * one Purchase Receipt at two different rates (2 Kg @ 1000, 1 Kg @ 1200). A flat
 * blended rate hides that the stock is made of two receipts of value; the
 * ledger trail is what surfaces it.
 */

/** Split a signed quantity into the inbound and outbound magnitudes. */
export function splitMovement(actualQty) {
  const q = Number(actualQty) || 0;
  return q > 0 ? { inQty: q, outQty: 0 } : { inQty: 0, outQty: Math.abs(q) };
}

/**
 * Reconcile opening + movement into a closing balance.
 *
 * @param {object} p
 * @param {number} p.openingQty  everything posted before the window
 * @param {Array}  p.movements  Stock Ledger Entries inside the window (signed
 *                              `actual_qty`); may be undefined when the server
 *                              already aggregated them
 * @param {number} [p.inQty]    pre-aggregated inbound, when there is no detail
 * @param {number} [p.outQty]   pre-aggregated outbound
 */
export function reconcile({ openingQty = 0, movements, inQty, outQty }) {
  const opening = Number(openingQty) || 0;

  let inbound = inQty === undefined || inQty === null ? 0 : Number(inQty) || 0;
  let outbound = outQty === undefined || outQty === null ? 0 : Number(outQty) || 0;

  if (Array.isArray(movements)) {
    inbound = 0;
    outbound = 0;
    for (const m of movements) {
      const s = splitMovement(m.actual_qty);
      inbound += s.inQty;
      outbound += s.outQty;
    }
  }

  const closing = opening + inbound - outbound;
  return { openingQty: opening, inQty: inbound, outQty: outbound, closingQty: closing };
}

/**
 * Free stock = what is on hand minus what is already committed.
 *
 * `reserved_qty` is stock promised to submitted sales/stock entries and cannot
 * be re-issued, so showing the balance without subtracting it overstates what
 * the store can actually use. Exposed separately rather than folded in, because
 * "we hold 40 but 12 are spoken for" is a different conversation from "we hold
 * 40".
 */
export function freeQty(closingQty, reservedQty) {
  return (Number(closingQty) || 0) - (Number(reservedQty) || 0);
}

/**
 * Which way a ledger entry moved stock. Separate from `splitMovement` because
 * the trail labels the row ("In"/"Out") while the summary sums magnitudes.
 *
 * @returns {"in"|"out"|""} empty for a zero-quantity entry, which is neither.
 */
export function directionOf(actualQty) {
  const q = Number(actualQty) || 0;
  if (q > 0) return "in";
  if (q < 0) return "out";
  return "";
}

/**
 * Fold a chronological ledger into rows carrying a running balance.
 *
 * The running balance starts at `openingQty` rather than 0 so the first row's
 * balance already accounts for stock that arrived before the window -- otherwise
 * the trail visibly disagrees with the summary above it.
 *
 * Ordering is ascending by posting time. ERPNext itself orders the ledger by
 * `posting_datetime` (`stock_balance.py:395`); we rely on the server having
 * done that rather than re-sorting here, because equal timestamps on the same
 * day must keep their server order.
 */
export function withRunningBalance(sles, openingQty = 0) {
  let running = Number(openingQty) || 0;
  return (sles || []).map((sle) => {
    const q = Number(sle.actual_qty) || 0;
    running += q;
    return { ...sle, direction: directionOf(q), running_balance: running };
  });
}

/**
 * Value of a balance, and the rate it implies.
 *
 * Only ever called with the CURRENT `Bin.valuation_rate`, which is ERPNext's
 * moving average. For a historical period this is not the rate that applied
 * then, so callers must leave value blank rather than pass an old date's rows
 * through here -- see `isValuationAccurate`.
 */
export function valueOf(qty, valuationRate) {
  return (Number(qty) || 0) * (Number(valuationRate) || 0);
}

/**
 * Whether value/rate columns may be shown for a given `to_date`.
 *
 * `Bin.valuation_rate` is today's moving average. For `to_date` in the past it
 * is a different number from the one that actually valued that stock, and
 * rendering it beside an as-of-past balance produces a confident wrong answer.
 * Compare against the *end of* `to_date`, not its start, so a range ending
 * today is accurate.
 */
export function isValuationAccurate(toDate, today) {
  if (!toDate || !today) return false;
  return String(toDate) >= String(today);
}