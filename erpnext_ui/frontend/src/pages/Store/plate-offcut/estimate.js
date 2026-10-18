import { get } from "../../../services/api";

/**
 * Live offcut estimates from addsol_nl_custom.
 *
 * The server owns every number here. `compute_theoretical_weight` evaluates an
 * admin-authored formula on the Item Group using L/W/T/MF and THROWS rather than
 * guessing (`plates/weight.py`), so there is nothing for this module to work out.
 * It asks `estimate_offcut_weights`, which runs the same functions the save runs
 * (`get_offcut_details`, `compute_offcut`, `auto_scrap_weight`, `offcut_totals`)
 * -- which is exactly why the preview and the save cannot disagree, provided the
 * request we send describes the same rows the save will contain.
 */

/** Keystrokes are firehose; asking the server for each one would queue replies. */
export const ESTIMATE_DEBOUNCE_MS = 300;

export const OFFCUT_ESTIMATE_METHOD =
  "addsol_nl_custom.addsol_nl_custom.plates.api.estimate_offcut_weights";

/**
 * Expand the form's `pieces` count into the flat rows the server expects.
 *
 * The doctype has no `pieces` field: one child row IS one offcut. So a row with
 * `pieces: 6` is a UI affordance and becomes six identical rows on the wire.
 *
 * THE SAME expansion must feed both the estimate request and the save payload.
 * If they diverged, the preview would total six pieces while the save wrote one
 * -- the totals would look right and the stock would be wrong.
 *
 * @param {Array<{_rid: string, length_mm: any, width_mm: any, pieces?: any}>} rows
 * @returns {Array<{name: string, length_mm: any, width_mm: any}>}
 */
export function expandRows(rows) {
  const out = [];
  for (const row of rows || []) {
    const count = Math.max(1, Math.floor(Number(row.pieces) || 1));
    for (let i = 0; i < count; i += 1) {
      out.push({
        // The client row key travels as `name`, and the server echoes it back
        // untouched. Matching replies on this rather than on an index is what
        // stops a slow answer landing on the wrong row.
        name: `${row._rid}#${i}`,
        length_mm: row.length_mm,
        width_mm: row.width_mm,
      });
    }
  }
  return out;
}

/** Total offcut pieces the form currently describes. */
export function pieceTotal(rows) {
  return expandRows(rows).length;
}

/**
 * Rebuild the form's rows from the server's per-piece reply.
 *
 * The reply carries one entry per expanded row, keyed by the `name` we sent.
 * Those `name`s are `<rid>#<i>`, so the aggregate for a form row is the sum over
 * its own pieces -- which is what the operator sees next to the size.
 *
 * @param {Array<{_rid: string}>} rows - the form's rows
 * @param {Array<object>} estimates - the server's `rows`
 * @returns {Map<string, {weight_kg: number, theoretical_weight_kg: number, value: number}>}
 */
export function aggregateEstimates(rows, estimates) {
  const out = new Map();
  for (const est of estimates || []) {
    const name = String(est?.name ?? "");
    const [rid] = name.split("#");
    if (!rid) continue;
    const prev = out.get(rid) || {
      weight_kg: 0,
      theoretical_weight_kg: 0,
      value: 0,
    };
    prev.weight_kg += Number(est.weight_kg) || 0;
    prev.theoretical_weight_kg += Number(est.theoretical_weight_kg) || 0;
    prev.value += Number(est.value) || 0;
    out.set(rid, prev);
  }
  return out;
}

/** The per-piece reply for one form row, for the canvas tooltip. */
export function piecesForRow(estimates, rid) {
  return (estimates || [])
    .filter((est) => String(est?.name ?? "").startsWith(`${rid}#`))
    .map((est) => ({
      index: Number(String(est.name).split("#")[1]) || 0,
      weight_kg: Number(est.weight_kg) || 0,
      theoretical_weight_kg: Number(est.theoretical_weight_kg) || 0,
      value: Number(est.value) || 0,
    }))
    .sort((a, b) => a.index - b.index);
}

/**
 * The server's own reason for refusing an estimate, or "" if it had none.
 *
 * A plate can be perfectly Active and still not cuttable: `get_source_details`
 * throws when the serial carries no weight ("It was received before weights were
 * recorded"), and `estimate_offcut_weights` calls it before doing anything else.
 * That is a fact about the plate, not a crash, and Frappe already phrases it in
 * the user's language -- so it is worth repeating rather than swallowing.
 *
 * A TRANSPORT failure has no `exc` and status 0, and gets no text: per the
 * "probe failure blocks nothing" rule, a network blip must not leave a message
 * implying the plate is unusable.
 *
 * @param {any} err
 * @returns {string} a message to show quietly, or ""
 */
export function serverReason(err) {
  const exc = typeof err?.exc === "string" ? err.exc : "";
  if (!exc) return "";
  if (/NetworkError|AbortError|Failed to fetch|Load failed/i.test(exc)) return "";
  return err?.message || "";
}

/**
 * Ask the server what the current rows weigh.
 *
 * @param {string} sourceSerialNo
 * @param {Array<object>} rows - the form's rows (with `pieces`)
 * @returns {Promise<object>} the server payload, plus `perRow` aggregates
 * @throws  whatever the server raised -- the caller decides whether to clear the
 *          numbers or surface the message
 */
export async function fetchEstimate(sourceSerialNo, rows) {
  const res = await get(`method/${OFFCUT_ESTIMATE_METHOD}`, {
    source_serial_no: sourceSerialNo,
    rows: JSON.stringify(expandRows(rows)),
  });
  const payload = res?.message || {};
  return {
    ...payload,
    perRow: aggregateEstimates(rows, payload.rows),
  };
}

/**
 * The plate's own geometry, so the canvas can draw at true scale.
 *
 * `estimate_offcut_weights` already reads the plate through
 * `cutting.get_offcut_details`; it returns the derived TOTALS only. These three
 * keys are the source dimensions from that same read, forwarded so the client
 * never has to work them out from a second source.
 *
 * Returned as nulls when absent, which is the pre-migration case: the form then
 * has no canvas geometry and says so rather than guessing a scale.
 */
export function plateGeometry(payload) {
  return {
    length_mm: Number(payload?.source_length_mm) || 0,
    width_mm: Number(payload?.source_width_mm) || 0,
    thickness_mm: Number(payload?.source_thickness_mm) || 0,
  };
}
